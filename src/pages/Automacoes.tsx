import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { supabase } from "../lib/supabaseClient";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

type AutomacaoStatus = "inativa" | "ativa" | "pausada" | "encerrada" | "erro";
type FiltroCardAutomacao = "padrao" | "ativa" | "continua" | "encerrada" | "erro" | "todos";

interface CampanhaAutomatizada {
  id: string;
  id_empresa: string;
  nome: string;
  objetivo: string | null;
  mensagem: string | null;
  status: string;
  tipo_automacao: string | null;
  automacao_dias_antes_vencimento: number | null;
  automacao_dias_sem_compra: number | null;
  automacao_dias_pos_compra: number | null;
  automacao_repeticao_tipo: "diaria" | "dias_semana" | "mensal" | null;
  automacao_dias_semana: number[] | null;
  automacao_meses: number[] | null;
  automacao_horarios: string[] | null;
  automacao_timezone: string | null;
  publico_dinamico: boolean;
  campanha_continua: boolean;
  termina_em: string | null;
  automacao_status: AutomacaoStatus;
  automacao_ultima_execucao_em: string | null;
  automacao_proxima_execucao_em: string | null;
  automacao_total_envios: number;
  automacao_total_erros: number;
  data_hora_criacao: string;
  data_hora_agendamento: string | null;
  criado_em: string;
}

interface ClienteAutomacao {
  id_cliente: number | null;
  dt_nascto: string | null;
  dt_ultcomp: string | null;
  ddd_celul: string | null;
  fone_celul: string | null;
  permite_campanha: boolean | null;
  contato_restrito: boolean | null;
}

interface ContaAutomacao {
  id_ctarec: number;
  id_cliente: number | null;
  dt_vencto: string | null;
  dt_baixa: string | null;
  vlr_receb: number | null;
  cliente_telefone: string | null;
  dias_carencia: number | null;
}

interface AutomacaoExecucaoItem {
  id: string;
  id_campanha: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  documento: string | null;
  status: "pendente" | "enviado" | "erro" | "cancelado";
  tentativa_atual: number | null;
  ultima_tentativa_em: string | null;
  proxima_tentativa_em: string | null;
  motivo_bloqueio: string | null;
  erro_envio: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

const tipoLabels: Record<string, string> = {
  aniversariantes_mes: "Aniversariantes do mês",
  aniversariantes_dia: "Aniversariantes do dia",
  clientes_sem_comprar_dias: "Cliente sem comprar por dias",
  pos_compra_dias: "Pós-compra por dias",
  contas_a_vencer_dias: "A vencer em dias",
  contas_vencendo_hoje: "Vencendo hoje",
  contas_vencidas_com_carencia: "Vencida com Carência",
  contas_vencidas: "Vencidas",
};

const tiposCobranca = new Set(["contas_a_vencer_dias", "contas_vencendo_hoje", "contas_vencidas_com_carencia", "contas_vencidas"]);

const statusLabels: Record<AutomacaoStatus, string> = {
  inativa: "Inativa",
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  erro: "Com erro",
};

function labelAutomacao(automacao: CampanhaAutomatizada) {
  if (automacao.tipo_automacao === "contas_a_vencer_dias") return `A vencer em ${automacao.automacao_dias_antes_vencimento ?? "-"} dias`;
  if (automacao.tipo_automacao === "clientes_sem_comprar_dias") return `Cliente sem comprar por ${automacao.automacao_dias_sem_compra ?? "-"} dias`;
  if (automacao.tipo_automacao === "pos_compra_dias") return `Pós-compra em ${automacao.automacao_dias_pos_compra ?? "-"} dias`;
  return tipoLabels[automacao.tipo_automacao ?? ""] ?? "-";
}

function formatarMotivoTentativa(valor?: string | null) {
  const texto = String(valor ?? "").trim();
  if (!texto) return "-";
  const labels: Record<string, string> = {
    aguardando_intervalo: "Aguardando Intervalo",
    bloqueado_limite_minuto: "Limite por Minuto",
    bloqueado_limite_diario: "Limite Diário",
    aguardando_horario_permitido: "Aguardando Horário Permitido",
    bloqueado_dia_nao_permitido: "Dia Não Permitido",
    bloqueado_feriado: "Feriado",
    bloqueado_fora_horario: "Fora do Horário",
    bloqueado_frequencia_cliente: "Frequência do Cliente",
    bloqueado_limite_categoria_cliente_dia: "Limite Diário da Categoria",
    reenvio_agendado: "Reenvio Agendado",
    campanha_cancelada: "Cancelada pelo cancelamento da campanha",
  };
  return labels[texto] ?? texto
    .replace(/^Envio pendente:\s*/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
}

const nomesDiasSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function labelAgenda(automacao: CampanhaAutomatizada) {
  const horarios = (automacao.automacao_horarios ?? []).map((horario) => horario.slice(0, 5)).join(" e ") || "-";
  if (automacao.automacao_repeticao_tipo === "dias_semana") {
    const dias = (automacao.automacao_dias_semana ?? []).map((dia) => nomesDiasSemana[dia]).filter(Boolean).join(", ");
    return `${dias || "Dias não definidos"} às ${horarios}`;
  }
  if (automacao.automacao_repeticao_tipo === "mensal") {
    const meses = (automacao.automacao_meses ?? []).map((mes) => nomesMeses[mes - 1]).filter(Boolean).join(", ");
    return `${meses || "Meses não definidos"} às ${horarios}`;
  }
  return `Diariamente às ${horarios}`;
}

function normalizar(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatarDataHora(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatarDataInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodoMesAtual() {
  const hoje = new Date();
  return {
    inicio: formatarDataInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: formatarDataInput(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

function statusEfetivo(automacao: CampanhaAutomatizada): AutomacaoStatus {
  if (
    !automacao.campanha_continua &&
    automacao.termina_em &&
    new Date(automacao.termina_em).getTime() < Date.now() &&
    automacao.automacao_status === "ativa"
  ) return "encerrada";
  return automacao.automacao_status;
}

function dataCivil(value: string | null) {
  if (!value) return null;
  const [ano, mes, dia] = value.split("T")[0].split("-").map(Number);
  return ano && mes && dia ? new Date(ano, mes - 1, dia) : null;
}

function atendeRegra(cliente: ClienteAutomacao, automacao: CampanhaAutomatizada) {
  const tipo = automacao.tipo_automacao;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const nascimento = dataCivil(cliente.dt_nascto);
  const ultimaCompra = dataCivil(cliente.dt_ultcomp);
  if (tipo === "aniversariantes_mes") return Boolean(nascimento && nascimento.getMonth() === hoje.getMonth());
  if (tipo === "aniversariantes_dia") return Boolean(nascimento && nascimento.getMonth() === hoje.getMonth() && nascimento.getDate() === hoje.getDate());
  if (tipo === "clientes_sem_comprar_dias") {
    const limite = new Date(hoje); limite.setDate(limite.getDate() - Number(automacao.automacao_dias_sem_compra ?? 0));
    return Boolean(ultimaCompra && ultimaCompra <= limite);
  }
  if (tipo === "pos_compra_dias") {
    const esperada = new Date(hoje); esperada.setDate(esperada.getDate() - Number(automacao.automacao_dias_pos_compra ?? 0));
    return Boolean(ultimaCompra && ultimaCompra.getTime() === esperada.getTime());
  }
  return false;
}

function clienteApto(cliente: ClienteAutomacao) {
  const telefone = `${cliente.ddd_celul ?? ""}${cliente.fone_celul ?? ""}`.replace(/\D/g, "");
  return (telefone.length === 10 || telefone.length === 11) && cliente.contato_restrito !== true && cliente.permite_campanha === true;
}

function contaAtendeRegra(conta: ContaAutomacao, automacao: CampanhaAutomatizada) {
  if (conta.dt_baixa || Number(conta.vlr_receb ?? 0) > 0) return false;
  const vencimento = dataCivil(conta.dt_vencto);
  if (!vencimento) return false;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (automacao.tipo_automacao === "contas_a_vencer_dias") {
    const esperada = new Date(hoje); esperada.setDate(esperada.getDate() + Number(automacao.automacao_dias_antes_vencimento ?? 0));
    return vencimento.getTime() === esperada.getTime();
  }
  if (automacao.tipo_automacao === "contas_vencendo_hoje") return vencimento.getTime() === hoje.getTime();
  if (automacao.tipo_automacao === "contas_vencidas_com_carencia") {
    const carencia = Math.max(0, Number(conta.dias_carencia ?? 0));
    if (carencia < 1) return false;
    const limite = new Date(vencimento); limite.setDate(limite.getDate() + carencia);
    return vencimento < hoje && limite >= hoje;
  }
  if (automacao.tipo_automacao === "contas_vencidas") {
    const limite = new Date(vencimento);
    limite.setDate(limite.getDate() + Math.max(0, Number(conta.dias_carencia ?? 0)));
    return vencimento < hoje && limite < hoje;
  }
  return false;
}

function telefoneContaValido(conta: ContaAutomacao) {
  const telefone = String(conta.cliente_telefone ?? "").replace(/\D/g, "");
  return telefone.length === 10 || telefone.length === 11 || ((telefone.length === 12 || telefone.length === 13) && telefone.startsWith("55"));
}

type AutomationIconName = "view" | "pause" | "play" | "stop" | "history" | "close" | "send";

function AutomationIcon({ name }: { name: AutomationIconName }) {
  const paths: Record<AutomationIconName, ReactNode> = {
    view: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function Automacoes() {
  const { usuario } = useAuth();
  const mesAtual = useMemo(periodoMesAtual, []);
  const [automacoes, setAutomacoes] = useState<CampanhaAutomatizada[]>([]);
  const [clientes, setClientes] = useState<ClienteAutomacao[]>([]);
  const [contas, setContas] = useState<ContaAutomacao[]>([]);
  const [itensExecucao, setItensExecucao] = useState<AutomacaoExecucaoItem[]>([]);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [continua, setContinua] = useState("todas");
  const [filtroCard, setFiltroCard] = useState<FiltroCardAutomacao>("padrao");
  const [dataInicial, setDataInicial] = useState(mesAtual.inicio);
  const [dataFinal, setDataFinal] = useState(mesAtual.fim);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<CampanhaAutomatizada | null>(null);
  const [itemForcarEnvio, setItemForcarEnvio] = useState<AutomacaoExecucaoItem | null>(null);
  const [forcandoEnvioId, setForcandoEnvioId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setAutomacoes([]);
      setClientes([]);
      setContas([]);
      setItensExecucao([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);
    const [campanhasResult, clientesResult, contasResult, itensResult] = await Promise.all([
      supabase.from("tab_campanha")
        .select("id, id_empresa, nome, objetivo, mensagem, status, tipo_automacao, automacao_dias_antes_vencimento, automacao_dias_sem_compra, automacao_dias_pos_compra, automacao_repeticao_tipo, automacao_dias_semana, automacao_meses, automacao_horarios, automacao_timezone, publico_dinamico, campanha_continua, termina_em, automacao_status, automacao_ultima_execucao_em, automacao_proxima_execucao_em, automacao_total_envios, automacao_total_erros, data_hora_criacao, data_hora_agendamento, criado_em")
        .eq("id_empresa", usuario.id_empresa).eq("automatizada", true).order("criado_em", { ascending: false }),
      supabase.from("tab_cliente")
        .select("id_cliente, dt_nascto, dt_ultcomp, ddd_celul, fone_celul, permite_campanha, contato_restrito")
        .eq("id_empresa", usuario.id_empresa),
      supabase.from("firebird_contas_receber")
        .select("id_ctarec, id_cliente, dt_vencto, dt_baixa, vlr_receb, cliente_telefone, dias_carencia")
        .eq("id_empresa", usuario.id_empresa),
      supabase.from("tab_automacao_execucao_itens")
        .select("id, id_campanha, cliente_nome, cliente_telefone, documento, status, tentativa_atual, ultima_tentativa_em, proxima_tentativa_em, motivo_bloqueio, erro_envio, criado_em, atualizado_em")
        .eq("id_empresa", usuario.id_empresa)
        .order("atualizado_em", { ascending: false })
        .limit(1000),
    ]);

    if (campanhasResult.error || clientesResult.error || contasResult.error || itensResult.error) {
      setAutomacoes([]);
      setClientes([]);
      setContas([]);
      setItensExecucao([]);
      setErro("Não foi possível carregar as automações.");
    } else {
      setAutomacoes((campanhasResult.data ?? []) as CampanhaAutomatizada[]);
      setClientes((clientesResult.data ?? []) as ClienteAutomacao[]);
      setContas((contasResult.data ?? []) as ContaAutomacao[]);
      setItensExecucao((itensResult.data ?? []) as AutomacaoExecucaoItem[]);
    }
    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => { void carregar(); }, [carregar]);

  const automacoesFiltradas = useMemo(() => {
    const termo = normalizar(busca);
    const inicio = dataInicial ? new Date(`${dataInicial}T00:00:00`) : null;
    const fim = dataFinal ? new Date(`${dataFinal}T00:00:00`) : null;
    if (fim) fim.setDate(fim.getDate() + 1);

    return automacoes.filter((automacao) => {
      if (termo && !normalizar(automacao.nome).includes(termo)) return false;
      if (tipo !== "todos" && automacao.tipo_automacao !== tipo) return false;
      if (filtroCard === "padrao" && statusEfetivo(automacao) !== "ativa" && !automacao.campanha_continua) return false;
      if (status !== "todos" && statusEfetivo(automacao) !== status) return false;
      if (continua === "sim" && !automacao.campanha_continua) return false;
      if (continua === "nao" && automacao.campanha_continua) return false;
      const criadaEm = new Date(automacao.data_hora_criacao || automacao.criado_em);
      if (inicio && criadaEm < inicio) return false;
      if (fim && criadaEm >= fim) return false;
      return true;
    });
  }, [automacoes, busca, continua, dataFinal, dataInicial, filtroCard, status, tipo]);

  const resumo = useMemo(() => {
    const inicio = new Date(`${mesAtual.inicio}T00:00:00`);
    const fim = new Date(`${mesAtual.fim}T00:00:00`);
    fim.setDate(fim.getDate() + 1);
    const automacoesDoMes = automacoes.filter((item) => {
      const criadaEm = new Date(item.data_hora_criacao || item.criado_em);
      return criadaEm >= inicio && criadaEm < fim;
    });
    return {
      total: automacoesDoMes.length,
      ativas: automacoesDoMes.filter((item) => statusEfetivo(item) === "ativa").length,
      continuas: automacoesDoMes.filter((item) => item.campanha_continua && statusEfetivo(item) !== "encerrada").length,
      encerradas: automacoesDoMes.filter((item) => statusEfetivo(item) === "encerrada").length,
      erros: automacoesDoMes.filter((item) => statusEfetivo(item) === "erro").length,
    };
  }, [automacoes, mesAtual.fim, mesAtual.inicio]);

  function obterPrevia(automacao: CampanhaAutomatizada) {
    if (tiposCobranca.has(automacao.tipo_automacao ?? "")) {
      const encontrados = contas.filter((conta) => contaAtendeRegra(conta, automacao));
      const aptos = encontrados.filter((conta) => {
        const cliente = clientes.find((item) => item.id_cliente === conta.id_cliente);
        return telefoneContaValido(conta) && cliente?.contato_restrito !== true && cliente?.permite_campanha === true;
      });
      return { encontrados: encontrados.length, aptos: aptos.length, ignorados: encontrados.length - aptos.length };
    }
    const encontrados = clientes.filter((cliente) => atendeRegra(cliente, automacao));
    const aptos = encontrados.filter(clienteApto);
    return { encontrados: encontrados.length, aptos: aptos.length, ignorados: encontrados.length - aptos.length };
  }

  async function atualizarStatus(automacao: CampanhaAutomatizada, novoStatus: AutomacaoStatus) {
    if (!usuario?.id_empresa) return;
    setErro(null);
    const payload: Record<string, unknown> = { automacao_status: novoStatus };
    if (novoStatus === "encerrada" && !automacao.termina_em) payload.termina_em = new Date().toISOString();
    const { error } = await supabase.from("tab_campanha").update(payload)
      .eq("id", automacao.id).eq("id_empresa", usuario.id_empresa).eq("automatizada", true);
    if (error) setErro("Não foi possível atualizar a automação.");
    else {
      setFeedback(`Automação ${statusLabels[novoStatus].toLowerCase()}.`);
      await carregar();
    }
  }

  function abrirHistorico() {
    window.history.pushState(null, "", "/historico-envios");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function confirmarForcarEnvioAutomacao() {
    if (!usuario?.id_empresa || !itemForcarEnvio) return;
    setErro(null);
    setFeedback(null);
    setForcandoEnvioId(itemForcarEnvio.id);
    try {
      const { data, error } = await supabase.functions.invoke("btzap-force-send-message", {
        body: {
          tipo: "automacao_item",
          id: itemForcarEnvio.id,
          id_empresa: usuario.id_empresa,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message ?? "Não foi possível forçar o envio.");
      setFeedback(data?.message ?? "Envio forçado executado.");
      setItemForcarEnvio(null);
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível forçar o envio.");
    } finally {
      setForcandoEnvioId(null);
    }
  }

  const itensDetalhes = useMemo(() => {
    if (!detalhes) return [];
    return itensExecucao.filter((item) => item.id_campanha === detalhes.id);
  }, [detalhes, itensExecucao]);

  const resumoDetalhes = useMemo(() => ({
    pendentes: itensDetalhes.filter((item) => item.status === "pendente").length,
    enviados: itensDetalhes.filter((item) => item.status === "enviado").length,
    erros: itensDetalhes.filter((item) => item.status === "erro").length,
    cancelados: itensDetalhes.filter((item) => item.status === "cancelado").length,
    proximaTentativa: itensDetalhes
      .filter((item) => item.status === "pendente" && item.proxima_tentativa_em)
      .map((item) => item.proxima_tentativa_em as string)
      .sort()[0] ?? null,
  }), [itensDetalhes]);

  const cards: Array<{ label: string; value: number; help: string; color: string; icon: string; filtro: FiltroCardAutomacao }> = [
    { label: "Ativas", value: resumo.ativas, help: "Em monitoramento", color: "verde", icon: "sent", filtro: "ativa" },
    { label: "Contínuas", value: resumo.continuas, help: "Sem data de término", color: "ciano", icon: "calendar", filtro: "continua" },
    { label: "Encerradas", value: resumo.encerradas, help: "Monitoramento finalizado", color: "laranja", icon: "pending", filtro: "encerrada" },
    { label: "Com erro", value: resumo.erros, help: "Precisam de atenção", color: "vermelho", icon: "error", filtro: "erro" },
    { label: "Total de automações", value: resumo.total, help: "Campanhas monitoradas", color: "azul", icon: "list", filtro: "todos" },
  ];

  function aplicarFiltroCard(filtro: FiltroCardAutomacao) {
    setFiltroCard(filtro);
    setStatus(filtro === "ativa" ? "ativa" : filtro === "encerrada" ? "encerrada" : filtro === "erro" ? "erro" : "todos");
    setContinua(filtro === "continua" ? "sim" : "todas");
  }

  return (
    <main className="page-shell automations-page">
      <GlobalPageHeader title="Automações" subtitle="Gerencie campanhas automatizadas e monitoradas para envio via WhatsApp." icon="automation" actions={
        <button className="secondary-button" type="button" onClick={() => void carregar()} disabled={carregando}>Atualizar</button>
      } />

      <section className="summary-grid automations-summary-grid" aria-label="Resumo de automações">
        {cards.map((card) => (
          <button type="button" className={`summary-card summary-card-${card.color} automation-summary-filter${filtroCard === card.filtro ? " automation-summary-filter-active" : ""}`} key={card.label} onClick={() => aplicarFiltroCard(card.filtro)}>
            <div><span>{card.label}</span><strong>{carregando ? "..." : card.value}</strong><small>{card.help}</small></div>
            <div className="summary-card-icon"><MetricCardIcon type={card.icon} /></div>
          </button>
        ))}
      </section>

      <section className="history-filters-panel automations-filters" aria-label="Filtros de automações">
        <div className="automations-filter-grid">
          <label><span>Buscar</span><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome da campanha" /></label>
          <label><span>Tipo de automação</span><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="todos">Todos</option>{Object.entries(tipoLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(e) => { setStatus(e.target.value); setFiltroCard("todos"); }}><option value="todos">Todos</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada</option><option value="erro">Com erro</option></select></label>
          <label><span>Data inicial</span><input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} /></label>
          <label><span>Data final</span><input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></label>
          <label><span>Campanha contínua</span><select value={continua} onChange={(e) => { setContinua(e.target.value); setFiltroCard("todos"); }}><option value="todas">Todas</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
        </div>
      </section>

      {feedback && <div className="feedback-box feedback-success">{feedback}</div>}
      {erro && <div className="feedback-box feedback-error">{erro}</div>}

      <section className="results-section automations-results">
        <div className="section-title"><h2>Campanhas automatizadas</h2><span>{automacoesFiltradas.length} automação(ões)</span></div>
        {carregando && <div className="state-box">Carregando automações...</div>}
        {!carregando && automacoesFiltradas.length === 0 && <div className="state-box">Nenhuma automação encontrada.</div>}
        {!carregando && automacoesFiltradas.length > 0 && (
          <div className="table-wrap"><table className="automations-table">
            <thead><tr><th>Campanha</th><th>Público</th><th>Público agora</th><th>Status</th><th>Período</th><th>Contínua</th><th>Execuções</th><th>Envios</th><th>Ações</th></tr></thead>
            <tbody>{automacoesFiltradas.map((automacao) => {
              const atual = statusEfetivo(automacao);
              const previa = obterPrevia(automacao);
              return <tr className={`automation-row-card automation-row-card-${atual}`} key={automacao.id}>
                <td><strong>{automacao.nome}</strong><small>{labelAutomacao(automacao)}</small><small className="automation-schedule-label">{labelAgenda(automacao)}</small></td>
                <td><span className="automation-continuous">Dinâmico</span></td>
                <td><div className="automation-card-pair">
                  <div><span>Aptos agora</span><strong>{previa.aptos}</strong></div>
                  <div><span>Ignorados</span><strong>{previa.ignorados}</strong></div>
                </div></td>
                <td><span className={`automation-status automation-status-${atual}`}>{statusLabels[atual]}</span></td>
                <td><div className="automation-card-pair">
                  <div><span>Início</span><strong>{formatarDataHora(automacao.data_hora_agendamento || automacao.data_hora_criacao)}</strong></div>
                  <div><span>Termina em</span><strong>{automacao.campanha_continua ? "-" : formatarDataHora(automacao.termina_em)}</strong></div>
                </div></td>
                <td>{automacao.campanha_continua ? <span className="automation-continuous">Contínua</span> : "Não"}</td>
                <td><div className="automation-card-pair">
                  <div><span>Última execução</span><strong>{formatarDataHora(automacao.automacao_ultima_execucao_em)}</strong></div>
                  <div><span>Próxima execução</span><strong>{formatarDataHora(automacao.automacao_proxima_execucao_em)}</strong></div>
                </div></td>
                <td>{automacao.automacao_total_envios}</td>
                <td><div className="automation-actions">
                  <button type="button" title="Visualizar" onClick={() => setDetalhes(automacao)}><AutomationIcon name="view" /></button>
                  {atual !== "encerrada" && <button type="button" title={atual === "ativa" ? "Pausar" : "Ativar"} onClick={() => void atualizarStatus(automacao, atual === "ativa" ? "pausada" : "ativa")}><AutomationIcon name={atual === "ativa" ? "pause" : "play"} /></button>}
                  {atual !== "encerrada" && <button type="button" title="Encerrar" onClick={() => void atualizarStatus(automacao, "encerrada")}><AutomationIcon name="stop" /></button>}
                  <button type="button" title="Ver histórico" onClick={abrirHistorico}><AutomationIcon name="history" /></button>
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </section>

      {detalhes && <div className="modal-backdrop" role="presentation" onClick={() => setDetalhes(null)}>
        <aside className="automation-details-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <header><div><h2>{detalhes.nome}</h2><span className={`automation-status automation-status-${statusEfetivo(detalhes)}`}>{statusLabels[statusEfetivo(detalhes)]}</span></div><button type="button" onClick={() => setDetalhes(null)} aria-label="Fechar"><AutomationIcon name="close" /></button></header>
          <dl><div><dt>Tipo de automação</dt><dd>{labelAutomacao(detalhes)}</dd></div><div><dt>Agenda</dt><dd>{labelAgenda(detalhes)}</dd></div><div><dt>Fuso horário</dt><dd>{detalhes.automacao_timezone === "America/Sao_Paulo" ? "Brasília" : detalhes.automacao_timezone || "-"}</dd></div><div><dt>Público</dt><dd>Dinâmico</dd></div>{detalhes.status === "cancelada" && <div><dt>Motivo do encerramento</dt><dd>Cancelada pela ação de cancelamento da campanha</dd></div>}{detalhes.tipo_automacao === "contas_a_vencer_dias" && <div><dt>Dias antes do vencimento</dt><dd>{detalhes.automacao_dias_antes_vencimento ?? "-"}</dd></div>}{detalhes.tipo_automacao === "clientes_sem_comprar_dias" && <div><dt>Dias sem comprar</dt><dd>{detalhes.automacao_dias_sem_compra ?? "-"}</dd></div>}{detalhes.tipo_automacao === "pos_compra_dias" && <div><dt>Dias após a compra</dt><dd>{detalhes.automacao_dias_pos_compra ?? "-"}</dd></div>}<div><dt>Aptos agora</dt><dd>{obterPrevia(detalhes).aptos}</dd></div><div><dt>Ignorados agora</dt><dd>{obterPrevia(detalhes).ignorados}</dd></div><div><dt>Início</dt><dd>{formatarDataHora(detalhes.data_hora_agendamento || detalhes.data_hora_criacao)}</dd></div><div><dt>Termina em</dt><dd>{detalhes.campanha_continua ? "Campanha contínua" : formatarDataHora(detalhes.termina_em)}</dd></div><div><dt>Última execução</dt><dd>{formatarDataHora(detalhes.automacao_ultima_execucao_em)}</dd></div><div><dt>Próxima execução</dt><dd>{formatarDataHora(detalhes.automacao_proxima_execucao_em)}</dd></div><div><dt>Total de envios</dt><dd>{detalhes.automacao_total_envios}</dd></div><div><dt>Total de erros</dt><dd>{detalhes.automacao_total_erros}</dd></div></dl>
          <section><h3>Mensagem</h3><p>{detalhes.mensagem || "-"}</p></section>
          <section>
            <h3>Tentativas da automação</h3>
            <div className="automation-attempt-summary">
              <div><span>Pendentes</span><strong>{resumoDetalhes.pendentes}</strong></div>
              <div><span>Enviadas</span><strong>{resumoDetalhes.enviados}</strong></div>
              <div><span>Com erro</span><strong>{resumoDetalhes.erros}</strong></div>
              <div><span>Canceladas</span><strong>{resumoDetalhes.cancelados}</strong></div>
              <div><span>Próxima tentativa</span><strong>{formatarDataHora(resumoDetalhes.proximaTentativa)}</strong></div>
            </div>
            {itensDetalhes.length === 0 ? (
              <p>Nenhuma tentativa registrada para esta automação.</p>
            ) : (
              <div className="automation-attempt-list">
                {itensDetalhes.slice(0, 30).map((item) => (
                  <article className={`automation-attempt-item automation-attempt-${item.status}`} key={item.id}>
                    <div>
                      <strong>{item.cliente_nome || "Cliente não informado"}</strong>
                      <small>{item.documento ? `Documento: ${item.documento}` : item.cliente_telefone || "-"}</small>
                    </div>
                    <div><span>Status</span><strong>{item.status === "pendente" ? "Pendente" : item.status === "enviado" ? "Enviada" : item.status === "cancelado" ? "Cancelada pela campanha" : "Com erro"}</strong></div>
                    <div><span>Tentativa</span><strong>{Number(item.tentativa_atual ?? 0)}</strong></div>
                    <div><span>Última</span><strong>{formatarDataHora(item.ultima_tentativa_em || item.atualizado_em || item.criado_em)}</strong></div>
                    <div><span>Próxima</span><strong>{formatarDataHora(item.proxima_tentativa_em)}</strong></div>
                    <div className="automation-attempt-actions">
                      <span>Ação</span>
                      <button
                        type="button"
                        title="Forçar Envio"
                        disabled={["enviado", "cancelado"].includes(item.status) || forcandoEnvioId === item.id}
                        onClick={() => setItemForcarEnvio(item)}
                      >
                        <AutomationIcon name="send" />
                        Forçar Envio
                      </button>
                    </div>
                    <p>{formatarMotivoTentativa(item.erro_envio || item.motivo_bloqueio)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>}

      {itemForcarEnvio && (
        <div className="modal-backdrop" role="presentation" onClick={() => setItemForcarEnvio(null)}>
          <aside className="force-send-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Forçar Envio</h2>
              <button type="button" onClick={() => setItemForcarEnvio(null)} aria-label="Fechar">
                <AutomationIcon name="close" />
              </button>
            </header>
            <p>
              Ao forçar um envio de mensagem, os parametros de segurança de envio de mensagens serão ignorados, podendo assim acarretar em bloqueio temporario, permanente ou banimento do numero. Deseja realmente fazer o procedimento?
            </p>
            <div className="force-send-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setItemForcarEnvio(null)} disabled={Boolean(forcandoEnvioId)}>
                Não, cancelar
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmarForcarEnvioAutomacao()} disabled={Boolean(forcandoEnvioId)}>
                {forcandoEnvioId ? "Enviando..." : "Sim, forçar envio"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

