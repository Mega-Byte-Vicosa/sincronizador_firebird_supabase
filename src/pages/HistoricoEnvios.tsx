import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { WhatsappEnvio } from "../types/whatsappEnvio";
import { formatarDataHora } from "./ContasAReceber";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { useAuth } from "../auth/AuthContext";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

interface FiltrosHistorico {
  busca: string;
  dataInicial: string;
  dataFinal: string;
  origem: string;
  tipoEnvio: string;
  status: string;
}

function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function getPrimeiroDiaMesAtual() {
  const hoje = new Date();
  return formatarDataInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
}

function getUltimoDiaMesAtual() {
  const hoje = new Date();
  return formatarDataInput(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
}

const filtrosIniciais: FiltrosHistorico = {
  busca: "",
  dataInicial: getPrimeiroDiaMesAtual(),
  dataFinal: getUltimoDiaMesAtual(),
  origem: "todas",
  tipoEnvio: "todos",
  status: "erro_pendente",
};

const filtrosHistoricoLimpos: FiltrosHistorico = {
  busca: "",
  dataInicial: "",
  dataFinal: "",
  origem: "todas",
  tipoEnvio: "todos",
  status: "todos",
};

const ITENS_POR_PAGINA_HISTORICO = 100;

const resumoHistoricoVazio = {
  enviados: 0,
  erros: 0,
  pendentes: 0,
  total: 0,
};

const HISTORICO_ENVIOS_SELECT = [
  "id",
  "id_empresa",
  "criado_em",
  "enviado_em",
  "cliente_nome",
  "cliente_telefone",
  "origem",
  "documento",
  "mensagem",
  "status",
  "tipo_envio",
  "erro",
  "motivo_bloqueio",
  "ultima_tentativa_em",
  "proxima_tentativa_em",
  "origem_envio",
  "origem_modulo",
  "id_msg_programada",
  "id_origem",
  "mensagem_id_externo",
  "status_entrega",
  "enviado_api_em",
  "entregue_em",
  "lido_em",
  "visualizado_em",
  "falhou_em",
  "webhook_payload",
  "ultimo_webhook_em",
  "webhook_ultimo_evento",
  "response_payload",
].join(",");

function formatarDataFiltro(valor: string) {
  if (!valor) return "";
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function mostrarValor(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "-";
  return String(valor);
}

function normalizarTexto(valor: string | number | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarTelefone(valor: string | number | null | undefined) {
  return String(valor ?? "").replace(/\D/g, "");
}

function normalizarOpcao(valor: string | null | undefined) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "");
}

function resumirMensagem(valor: string | null | undefined) {
  const mensagem = mostrarValor(valor);
  if (mensagem === "-" || mensagem.length <= 260) return mensagem;
  return `${mensagem.slice(0, 260).trimEnd()}...`;
}

function resumirErro(valor: string | null | undefined) {
  const erro = mostrarValor(valor);
  if (erro === "-" || erro.length <= 70) return erro;
  return `${erro.slice(0, 70).trimEnd()}...`;
}

function formatarMotivoBloqueio(motivo: string | null | undefined) {
  const mensagens: Record<string, string> = {
    bloqueado_fora_horario: "Envio pendente: fora do horário permitido.",
    aguardando_horario_permitido: "Envio pendente: aguardando próximo horário permitido.",
    bloqueado_limite_diario: "Envio pendente: limite diário atingido.",
    bloqueado_limite_categoria_cliente_dia: "Envio pendente: cliente atingiu o limite diário desta categoria.",
    bloqueado_limite_minuto: "Envio pendente: limite por minuto atingido.",
    bloqueado_frequencia_cliente: "Envio pendente: frequência mínima do cliente ainda não foi atingida.",
    bloqueado_feriado: "Envio pendente: envio bloqueado em feriado.",
    bloqueado_dia_nao_permitido: "Envio pendente: dia da semana não permitido.",
    aguardando_intervalo: "Envio pendente: aguardando intervalo entre mensagens.",
    reenvio_agendado: "Envio pendente: reenvio agendado.",
    aguardando_parametro: "Envio pendente: aguardando regra de envio permitida.",
    falha_sem_parametro_whats: "Envio pendente: parâmetros de WhatsApp não configurados.",
    max_tentativas_reenvio: "Envio pendente: limite máximo de tentativas de reenvio atingido.",
    erro_btzap: "Erro no BTZap/WhatsApp sem detalhe técnico salvo. Verifique a configuração/conexão do WhatsApp ou os logs da Edge Function.",
  };
  return mensagens[String(motivo ?? "")] ?? motivo ?? null;
}

function normalizarStatusEnvio(envio: WhatsappEnvio): "pendente" | "enviado" | "erro" {
  const status = normalizarTexto(envio.status);
  const motivo = String(envio.motivo_bloqueio ?? "");
  const motivosPendentes = new Set([
    "bloqueado_fora_horario",
    "aguardando_horario_permitido",
    "bloqueado_limite_minuto",
    "bloqueado_limite_diario",
    "bloqueado_limite_categoria_cliente_dia",
    "bloqueado_dia_nao_permitido",
    "bloqueado_feriado",
    "aguardando_intervalo",
    "reenvio_agendado",
    "aguardando_parametro",
    "falha_sem_parametro_whats",
    "bloqueado_frequencia_cliente",
    "max_tentativas_reenvio",
  ]);
  const enviados = new Set(["enviado", "sent", "delivered", "read", "sucesso", "processado"]);
  const erros = new Set(["erro", "erro_btzap", "erro_whatsapp", "erro_internet", "timeout", "falha_api", "erro_conexao", "erro_tecnico", "erro_inesperado", "falhou", "falha"]);

  if (status === "pendente" || motivosPendentes.has(motivo)) return "pendente";
  if (enviados.has(status)) return "enviado";
  if (erros.has(status) || erros.has(motivo)) return "erro";
  return "pendente";
}

function labelStatusEnvio(envio: WhatsappEnvio) {
  const status = normalizarStatusEnvio(envio);
  if (status === "enviado") return "Enviado";
  if (status === "erro") return "Erro";
  return "Pendente";
}

function textoPayload(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (!texto) return null;
    try {
      return textoPayload(JSON.parse(texto)) ?? texto;
    } catch {
      return texto;
    }
  }
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (Array.isArray(valor)) {
    const itens = valor.map(textoPayload).filter(Boolean) as string[];
    return itens.length ? [...new Set(itens)].join(" | ") : null;
  }
  if (typeof valor === "object") {
    const payload = valor as Record<string, unknown>;
    const campos = ["message", "mensagem", "error", "erro", "detail", "details", "description", "reason", "motivo"];
    const detalhes = campos.map((campo) => textoPayload(payload[campo])).filter(Boolean) as string[];
    if (detalhes.length) return [...new Set(detalhes)].join(" | ");
    if ("retorno" in payload) return textoPayload(payload.retorno);
    if ("response" in payload) return textoPayload(payload.response);
    if ("data" in payload) return textoPayload(payload.data);
    if ("result" in payload) return textoPayload(payload.result);
  }
  return null;
}

function getRetornoErroEnvio(envio: WhatsappEnvio) {
  const statusNormalizado = normalizarStatusEnvio(envio);
  if (statusNormalizado === "enviado" && (!envio.erro || String(envio.erro).trim() === "")) return "OK";
  if (envio.erro && String(envio.erro).trim()) return envio.erro;

  const detalhePayload = textoPayload(envio.response_payload);
  if (detalhePayload) return detalhePayload;

  if (envio.motivo_bloqueio && String(envio.motivo_bloqueio).trim()) return formatarMotivoBloqueio(envio.motivo_bloqueio);

  return statusNormalizado === "enviado" ? "OK" : null;
}

function getStatusClass(envio: WhatsappEnvio) {
  const statusNormalizado = normalizarStatusEnvio(envio);

  if (statusNormalizado === "enviado") return "history-status history-status-enviado";
  if (statusNormalizado === "erro") return "history-status history-status-erro";
  if (statusNormalizado === "pendente") return "history-status history-status-pendente";

  return "history-status history-status-pendente";
}

function renderConfirmacaoEntrega(envio: WhatsappEnvio) {
  if (normalizarStatusEnvio(envio) === "pendente") {
    return <div className="history-delivery-status">
      <span className="delivery-status-badge delivery-status-unknown">Aguardando entrega</span>
    </div>;
  }
  const entregue = Boolean(envio.entregue_em || envio.lido_em || envio.visualizado_em || ["ENTREGUE", "LIDO"].includes(String(envio.status_entrega ?? "").toUpperCase()));
  const falhou = String(envio.status_entrega ?? "").toUpperCase() === "FALHOU";
  const label = entregue ? "Entregue" : falhou ? "Erro na entrega" : "Aguardando entrega";
  const className = entregue ? "delivery-status-delivered" : falhou ? "delivery-status-failed" : "delivery-status-unknown";
  const data = envio.entregue_em || envio.lido_em || envio.visualizado_em || envio.falhou_em;

  return <div className="history-delivery-status">
    <span className={`delivery-status-badge ${className}`}>{label}</span>
    {data && <small>{formatarDataHora(data)}</small>}
  </div>;
}

function renderConfirmacaoVisualizacao(envio: WhatsappEnvio) {
  const dataVisualizacao = envio.lido_em || envio.visualizado_em || null;
  const visualizada = Boolean(dataVisualizacao || String(envio.status_entrega ?? "").toUpperCase() === "LIDO");

  return <div className="history-delivery-status">
    <span className={`delivery-status-badge ${visualizada ? "delivery-status-read" : "delivery-status-unknown"}`}>
      {visualizada ? "Visualizada" : "Não confirmada"}
    </span>
    {dataVisualizacao && <small>{formatarDataHora(dataVisualizacao)}</small>}
  </div>;
}

function renderTentativasHistorico(envio: WhatsappEnvio) {
  return (
    <div className="history-attempts-info">
      <small>Última Tentativa: {envio.ultima_tentativa_em ? formatarDataHora(envio.ultima_tentativa_em) : "-"}</small>
      <small>Próxima Tentativa: {envio.proxima_tentativa_em ? formatarDataHora(envio.proxima_tentativa_em) : "-"}</small>
    </div>
  );
}

function dataInicioDia(data: string) {
  return new Date(`${data}T00:00:00`);
}

function dataDiaSeguinte(data: string) {
  const valor = dataInicioDia(data);
  valor.setDate(valor.getDate() + 1);
  return valor;
}

function origemCompativel(envio: WhatsappEnvio, origemSelecionada: string) {
  if (origemSelecionada === "todas") return true;

  const origemNormalizada = normalizarOpcao(envio.origem);
  const origemModuloNormalizada = normalizarOpcao(envio.origem_modulo);
  const origemEnvioNormalizada = normalizarOpcao(envio.origem_envio);
  const aliases: Record<string, string[]> = {
    contas_receber: ["contasareceber", "contasreceber"],
    aniversariantes: ["aniversariantes"],
    campanhas_promocao: ["campanha", "campanhadepromocao", "campanhasdepromocao", "campanhaspromocao", "campanhapromocao"],
    automacao: ["automacao", "campanhaautomatizada"],
    mensagem_programada: ["mensagemprogramada"],
    manual: ["manual"],
  };

  const opcoes = aliases[origemSelecionada] ?? [origemSelecionada];
  return (
    opcoes.includes(origemNormalizada) ||
    opcoes.includes(origemModuloNormalizada) ||
    opcoes.includes(origemEnvioNormalizada)
  );
}

function filtrosAtivos(filtros: FiltrosHistorico) {
  return (
    filtros.busca.trim() !== "" ||
    filtros.dataInicial !== "" ||
    filtros.dataFinal !== "" ||
    filtros.origem !== "todas" ||
    filtros.tipoEnvio !== "todos" ||
    filtros.status !== "todos"
  );
}

function filtrarEnvios(envios: WhatsappEnvio[], filtros: FiltrosHistorico) {
  const busca = normalizarTexto(filtros.busca);
  const buscaTelefone = normalizarTelefone(filtros.busca);
  const inicio = filtros.dataInicial ? dataInicioDia(filtros.dataInicial) : null;
  const fim = filtros.dataFinal ? dataDiaSeguinte(filtros.dataFinal) : null;

  return envios.filter((envio) => {
    if (busca) {
      const encontrouTexto =
        normalizarTexto(envio.cliente_nome).includes(busca) ||
        normalizarTexto(envio.documento).includes(busca) ||
        normalizarTexto(envio.cliente_telefone).includes(busca);
      const encontrouTelefone =
        buscaTelefone !== "" && normalizarTelefone(envio.cliente_telefone).includes(buscaTelefone);

      if (!encontrouTexto && !encontrouTelefone) return false;
    }

    if (inicio || fim) {
      if (!envio.criado_em) return false;
      const criadoEm = new Date(envio.criado_em);
      if (inicio && criadoEm < inicio) return false;
      if (fim && criadoEm >= fim) return false;
    }

    if (filtros.origem === "mensagem_programada") {
      if (envio.origem_envio !== "MENSAGEM_PROGRAMADA") return false;
    } else if (!origemCompativel(envio, filtros.origem)) {
      return false;
    }
    if (filtros.tipoEnvio !== "todos" && normalizarTexto(envio.tipo_envio) !== filtros.tipoEnvio) return false;
    const statusEnvio = normalizarStatusEnvio(envio);
    if (filtros.status === "erro_pendente" && statusEnvio !== "erro" && statusEnvio !== "pendente") return false;
    if (filtros.status !== "todos" && filtros.status !== "erro_pendente" && statusEnvio !== filtros.status) return false;

    return true;
  });
}

function formatarOrigemHistorico(envio: WhatsappEnvio) {
  const origem = normalizarOpcao(envio.origem);
  const origemModulo = normalizarOpcao(envio.origem_modulo);
  const origemEnvio = normalizarOpcao(envio.origem_envio);
  const mensagem = normalizarTexto(envio.mensagem);
  const contaReceber = ["contareceber", "contasareceber", "contasreceber"].includes(origemModulo)
    || ["contareceber", "contasareceber", "contasreceber"].includes(origem);
  const mensagemProgramada = origemEnvio === "mensagemprogramada"
    || Boolean(envio.id_msg_programada)
    || mensagem.replace(/^[^a-z0-9]+/, "").startsWith("mensagem programada");

  if (origemModulo === "automacao" || origemEnvio === "campanhaautomatizada") return "Automação";
  if (mensagemProgramada) {
    if (contaReceber) return "Contas a Receber > Mensagens Programadas";
    if (origemModulo === "campanha") return "Campanha";
    return `Mensagens Programadas > ${mostrarValor(envio.origem_modulo)}`;
  }

  if (contaReceber) return "Contas a Receber";

  if (origemModulo === "campanha" || origem === "campanha") {
    return "Campanha";
  }

  return mostrarValor(envio.origem);
}

export function HistoricoEnvios() {
  const { usuario } = useAuth();
  const [envios, setEnvios] = useState<WhatsappEnvio[]>([]);
  const [filtros, setFiltros] = useState<FiltrosHistorico>(filtrosIniciais);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [resumo, setResumo] = useState(resumoHistoricoVazio);
  const [carregando, setCarregando] = useState(true);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarResumo = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setResumo(resumoHistoricoVazio);
      setCarregandoResumo(false);
      return;
    }

    setCarregandoResumo(true);

    try {
      const consultaBase = () => supabase
        .from("tab_whatsapp_envios")
        .select("id", { count: "exact", head: true })
        .eq("id_empresa", usuario.id_empresa);

      const [enviados, erros, pendentes, total] = await Promise.all([
        consultaBase().eq("status", "enviado"),
        consultaBase().eq("status", "erro"),
        consultaBase().eq("status", "pendente"),
        consultaBase(),
      ]);

      const erroResumo = enviados.error ?? erros.error ?? pendentes.error ?? total.error;
      if (erroResumo) throw erroResumo;

      setResumo({
        enviados: enviados.count ?? 0,
        erros: erros.count ?? 0,
        pendentes: pendentes.count ?? 0,
        total: total.count ?? 0,
      });
    } catch {
      setResumo(resumoHistoricoVazio);
    } finally {
      setCarregandoResumo(false);
    }
  }, [usuario?.id_empresa]);

  const carregarEnvios = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setEnvios([]);
      setTotalRegistros(0);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);

    try {
      const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA_HISTORICO;
      const fimPagina = inicioPagina + ITENS_POR_PAGINA_HISTORICO - 1;
      const busca = filtros.busca.trim();
      const buscaTelefone = normalizarTelefone(busca);
      let consulta = supabase
        .from("tab_whatsapp_envios")
        .select(HISTORICO_ENVIOS_SELECT, { count: "exact" })
        .eq("id_empresa", usuario.id_empresa);

      if (filtros.dataInicial) consulta = consulta.gte("criado_em", dataInicioDia(filtros.dataInicial).toISOString());
      if (filtros.dataFinal) consulta = consulta.lt("criado_em", dataDiaSeguinte(filtros.dataFinal).toISOString());

      if (filtros.status === "erro_pendente") {
        consulta = consulta.in("status", ["erro", "pendente"]);
      } else if (filtros.status !== "todos") {
        consulta = consulta.eq("status", filtros.status);
      }

      if (filtros.tipoEnvio !== "todos") consulta = consulta.eq("tipo_envio", filtros.tipoEnvio);
      if (filtros.origem === "mensagem_programada") consulta = consulta.eq("origem_envio", "MENSAGEM_PROGRAMADA");
      if (filtros.origem === "campanhas_promocao") consulta = consulta.eq("origem_modulo", "CAMPANHA");
      if (filtros.origem === "automacao") consulta = consulta.eq("origem_modulo", "AUTOMACAO");
      if (filtros.origem === "contas_receber") consulta = consulta.eq("origem_modulo", "CONTA_RECEBER");
      if (filtros.origem === "manual") consulta = consulta.eq("origem", "manual");

      if (busca) {
        const filtrosBusca = [
          `cliente_nome.ilike.%${busca}%`,
          `documento.ilike.%${busca}%`,
        ];
        if (buscaTelefone) filtrosBusca.push(`cliente_telefone.ilike.%${buscaTelefone}%`);
        consulta = consulta.or(filtrosBusca.join(","));
      }

      const { data, error, count } = await consulta
        .order("criado_em", { ascending: false })
        .range(inicioPagina, fimPagina);

      if (error) throw error;
      setEnvios((data ?? []) as unknown as WhatsappEnvio[]);
      setTotalRegistros(count ?? data?.length ?? 0);
    } catch (error) {
      setEnvios([]);
      setTotalRegistros(0);
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o histórico de envios.");
    } finally {
      setCarregando(false);
    }
  }, [filtros, paginaAtual, usuario?.id_empresa]);

  useEffect(() => {
    void carregarEnvios();
  }, [carregarEnvios]);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtros]);

  const enviosFiltrados = useMemo(() => filtrarEnvios(envios, filtros), [envios, filtros]);
  const temFiltrosAtivos = filtrosAtivos(filtros);
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / ITENS_POR_PAGINA_HISTORICO));
  const labelOrigemHistorico: Record<string, string> = {
    todas: "Todas",
    contas_receber: "Contas a Receber",
    aniversariantes: "Aniversariantes",
    campanhas_promocao: "Campanha de Promoção",
    automacao: "Automação",
    mensagem_programada: "Mensagem Programada",
    manual: "Manual",
  };
  const labelTipoHistorico: Record<string, string> = {
    todos: "Todos",
    whatsapp: "WhatsApp",
    envio: "Envio",
    reenvio: "Reenvio",
    teste: "Teste",
  };
  const labelStatusHistorico: Record<string, string> = {
    todos: "Todos",
    erro_pendente: "Erro e Pendente",
    enviado: "Enviado",
    erro: "Erro",
    pendente: "Pendente",
  };
  const filtrosAtivosHistorico = [
    filtros.busca.trim() ? `Busca: ${filtros.busca.trim()}` : null,
    filtros.dataInicial ? `Data inicial: ${formatarDataFiltro(filtros.dataInicial)}` : null,
    filtros.dataFinal ? `Data final: ${formatarDataFiltro(filtros.dataFinal)}` : null,
    filtros.origem !== "todas" ? `Origem: ${labelOrigemHistorico[filtros.origem] ?? filtros.origem}` : null,
    filtros.tipoEnvio !== "todos" ? `Tipo: ${labelTipoHistorico[filtros.tipoEnvio] ?? filtros.tipoEnvio}` : null,
    filtros.status !== "todos" ? `Status: ${labelStatusHistorico[filtros.status] ?? filtros.status}` : null,
  ].filter((filtro): filtro is string => Boolean(filtro));

  const cards = [
    { label: "Mensagens enviadas", value: resumo.enviados, icon: "sent", color: "verde", help: "Envios concluídos", status: "enviado" },
    { label: "Mensagens com erro", value: resumo.erros, icon: "error", color: "vermelho", help: "Falhas registradas", status: "erro" },
    { label: "Mensagens pendentes", value: resumo.pendentes, icon: "pending", color: "laranja", help: "Aguardando envio", status: "pendente" },
    { label: "Total de envios", value: resumo.total, icon: "list", color: "azul", help: "Todos os registros", status: "todos" },
  ];

  return (
    <main className="history-page">
      <GlobalPageHeader title="Histórico de Envio de Mensagens" subtitle="Acompanhe os envios e reenvios de mensagens realizados para clientes." icon="history" actions={
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void carregarEnvios();
            void carregarResumo();
          }}
          disabled={carregando || carregandoResumo}
        >
          Atualizar
        </button>
      } />

      <section className="summary-grid history-summary-grid" aria-label="Resumo de envios">
        {cards.map((card) => {
          const ativo =
            filtros.status === card.status ||
            (filtros.status === "erro_pendente" && (card.status === "erro" || card.status === "pendente"));

          return (
          <button
            className={`summary-card summary-card-${card.color} history-summary-filter${ativo ? " history-summary-filter-active" : ""}`}
            type="button"
            key={card.label}
            aria-pressed={ativo}
            onClick={() => setFiltros({ ...filtros, status: card.status })}
          >
            <div>
              <span>{card.label}</span>
              <strong>{carregandoResumo ? "..." : card.value}</strong>
              <small>{card.help}</small>
            </div>
            <div className="summary-card-icon" aria-hidden="true"><MetricCardIcon type={card.icon} /></div>
          </button>
          );
        })}
      </section>

      <section className="history-filters-panel" aria-label="Filtros do historico">
        <div className="history-filters-grid">
          <label className="history-filter-search">
            <span>Buscar</span>
            <input
              type="search"
              placeholder="Cliente, telefone ou documento"
              value={filtros.busca}
              onChange={(event) => setFiltros({ ...filtros, busca: event.target.value })}
            />
          </label>

          <label>
            <span>Data inicial</span>
            <input
              type="date"
              value={filtros.dataInicial}
              onChange={(event) => setFiltros({ ...filtros, dataInicial: event.target.value })}
            />
          </label>

          <label>
            <span>Data final</span>
            <input
              type="date"
              value={filtros.dataFinal}
              onChange={(event) => setFiltros({ ...filtros, dataFinal: event.target.value })}
            />
          </label>

          <label>
            <span>Origem</span>
            <select value={filtros.origem} onChange={(event) => setFiltros({ ...filtros, origem: event.target.value })}>
              <option value="todas">Todas</option>
              <option value="contas_receber">Contas a Receber</option>
              <option value="aniversariantes">Aniversariantes</option>
              <option value="campanhas_promocao">Campanha de Promocao</option>
              <option value="automacao">Automação</option>
              <option value="mensagem_programada">Mensagem Programada</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          <label>
            <span>Tipo de envio</span>
            <select
              value={filtros.tipoEnvio}
              onChange={(event) => setFiltros({ ...filtros, tipoEnvio: event.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="envio">Envio</option>
              <option value="reenvio">Reenvio</option>
              <option value="teste">Teste</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={filtros.status} onChange={(event) => setFiltros({ ...filtros, status: event.target.value })}>
              <option value="todos">Todos</option>
              <option value="erro_pendente">Erro e Pendente</option>
              <option value="enviado">Enviado</option>
              <option value="erro">Erro</option>
              <option value="pendente">Pendente</option>
            </select>
          </label>

        </div>

        {filtrosAtivosHistorico.length > 0 && (
          <div className="active-filters-bar">
            <div className="active-filters-info">
              <span className="active-filters-label">Filtro ativo:</span>
              {filtrosAtivosHistorico.map((filtro) => (
                <span className="active-filter-chip" key={filtro}>{filtro}</span>
              ))}
            </div>
            <button className="active-filters-clear" type="button" onClick={() => setFiltros(filtrosHistoricoLimpos)}>
              Limpar filtros
            </button>
          </div>
        )}
      </section>

      <section className="results-section">
        <div className="section-title">
          <h2>Historico de envios</h2>
          <span>Resultados: {totalRegistros}</span>
        </div>

        {erro && <div className="state-box state-box-error">Erro ao carregar historico de envios.</div>}

        <div className="table-wrap">
          <table className="history-table">
            <colgroup>
              <col className="history-col-datetime" />
              <col className="history-col-client" />
              <col className="history-col-phone" />
              <col className="history-col-document" />
              <col className="history-col-origin" />
              <col className="history-col-type" />
              <col className="history-col-status" />
              <col className="history-col-status" />
              <col className="history-col-status" />
              <col className="history-col-message" />
              <col className="history-col-error" />
            </colgroup>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Documento</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>Status do envio</th>
                <th>Confirmação de entrega</th>
                <th>Confirmação de visualização</th>
                <th>Mensagem</th>
                <th>Retorno / Erro</th>
              </tr>
            </thead>
            <tbody>
              {!carregando && !erro && enviosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-table-message">
                      {temFiltrosAtivos
                        ? "Nenhum envio encontrado para os filtros selecionados."
                        : "Nenhum envio de mensagem registrado."}
                    </div>
                  </td>
                </tr>
              )}

              {enviosFiltrados.map((envio) => (
                <tr key={envio.id}>
                  <td>{formatarDataHora(envio.enviado_em || envio.criado_em)}</td>
                  <td>{mostrarValor(envio.cliente_nome)}</td>
                  <td>{mostrarValor(envio.cliente_telefone)}</td>
                  <td>{mostrarValor(envio.documento)}</td>
                  <td>{formatarOrigemHistorico(envio)}</td>
                  <td>{mostrarValor(envio.tipo_envio)}</td>
                  <td>
                    <span className={getStatusClass(envio)}>{labelStatusEnvio(envio)}</span>
                  </td>
                  <td>{renderConfirmacaoEntrega(envio)}</td>
                  <td>{renderConfirmacaoVisualizacao(envio)}</td>
                  <td>
                    <span className="history-message-cell" title={mostrarValor(envio.mensagem)}>
                      {resumirMensagem(envio.mensagem)}
                    </span>
                  </td>
                  <td>
                    <span className="history-error-cell" title={mostrarValor(getRetornoErroEnvio(envio))}>
                      {resumirErro(getRetornoErroEnvio(envio))}
                    </span>
                    {renderTentativasHistorico(envio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalRegistros > 0 && (
          <nav className="receivables-pagination" aria-label="Paginação do histórico de envios">
            <button
              className="secondary-button"
              type="button"
              disabled={carregando || paginaAtual <= 1}
              onClick={() => setPaginaAtual((pagina) => Math.max(1, pagina - 1))}
            >
              Anterior
            </button>
            <span>Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong></span>
            <button
              className="secondary-button"
              type="button"
              disabled={carregando || paginaAtual >= totalPaginas}
              onClick={() => setPaginaAtual((pagina) => Math.min(totalPaginas, pagina + 1))}
            >
              Próxima
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}
