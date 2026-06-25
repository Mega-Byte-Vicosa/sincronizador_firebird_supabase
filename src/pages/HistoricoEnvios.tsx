import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { WhatsappEnvio } from "../types/whatsappEnvio";
import { formatarDataHora } from "./ContasAReceber";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { useAuth } from "../auth/AuthContext";

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
  status: "enviado",
};

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

function getStatusClass(status: string | null) {
  const statusNormalizado = String(status ?? "").trim().toLowerCase();

  if (statusNormalizado === "enviado") return "history-status history-status-enviado";
  if (statusNormalizado === "erro") return "history-status history-status-erro";
  if (statusNormalizado === "enviando") return "history-status history-status-enviando";
  if (statusNormalizado === "cancelado") return "history-status history-status-cancelado";
  if (statusNormalizado === "pendente") return "history-status history-status-pendente";

  return "history-status history-status-pendente";
}

function getStatusEntrega(status: string | null | undefined) {
  const normalizado = String(status ?? "").trim().toUpperCase();
  if (normalizado === "ENVIADO_API") return { label: "Enviado pela API", className: "delivery-status-api" };
  if (normalizado === "ENTREGUE") return { label: "Entregue ao cliente", className: "delivery-status-delivered" };
  if (normalizado === "LIDO") return { label: "Lida pelo cliente", className: "delivery-status-read" };
  if (normalizado === "FALHOU") return { label: "Falhou", className: "delivery-status-failed" };
  return { label: "Não informado", className: "delivery-status-unknown" };
}

function renderStatusEntrega(envio: WhatsappEnvio) {
  const status = getStatusEntrega(envio.status_entrega);
  const datas = [
    envio.enviado_api_em && `Enviado API: ${formatarDataHora(envio.enviado_api_em)}`,
    envio.entregue_em && `Entregue: ${formatarDataHora(envio.entregue_em)}`,
    envio.lido_em && `Lido: ${formatarDataHora(envio.lido_em)}`,
    envio.falhou_em && `Falhou: ${formatarDataHora(envio.falhou_em)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="history-delivery-status">
      <span className={`delivery-status-badge ${status.className}`}>{status.label}</span>
      {datas.length > 0 && <small title={datas.join("\n")}>{datas.join(" · ")}</small>}
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

function origemCompativel(origem: string | null, origemSelecionada: string) {
  if (origemSelecionada === "todas") return true;

  const origemNormalizada = normalizarOpcao(origem);
  const aliases: Record<string, string[]> = {
    contas_receber: ["contasareceber", "contasreceber"],
    aniversariantes: ["aniversariantes"],
    campanhas_promocao: ["campanhadepromocao", "campanhasdepromocao", "campanhaspromocao", "campanhapromocao"],
    mensagem_programada: ["mensagemprogramada"],
    manual: ["manual"],
  };

  return (aliases[origemSelecionada] ?? [origemSelecionada]).includes(origemNormalizada);
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
    } else if (!origemCompativel(envio.origem, filtros.origem)) {
      return false;
    }
    if (filtros.tipoEnvio !== "todos" && normalizarTexto(envio.tipo_envio) !== filtros.tipoEnvio) return false;
    if (filtros.status !== "todos" && normalizarTexto(envio.status) !== filtros.status) return false;

    return true;
  });
}

function formatarOrigemHistorico(envio: WhatsappEnvio) {
  if (envio.origem_envio === "MENSAGEM_PROGRAMADA") {
    const modulo = envio.origem_modulo === "CONTA_RECEBER" ? "Conta a Receber" : mostrarValor(envio.origem_modulo);
    return `Mensagem Programada / ${modulo}`;
  }

  return mostrarValor(envio.origem);
}

export function HistoricoEnvios() {
  const { usuario } = useAuth();
  const [envios, setEnvios] = useState<WhatsappEnvio[]>([]);
  const [filtros, setFiltros] = useState<FiltrosHistorico>(filtrosIniciais);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarEnvios = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setEnvios([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);

    const { data, error } = await supabase
      .from("tab_whatsapp_envios")
      .select("*")
      .eq("id_empresa", usuario.id_empresa)
      .order("criado_em", { ascending: false });

    if (error) {
      setEnvios([]);
      setErro(error.message);
    } else {
      setEnvios((data ?? []) as WhatsappEnvio[]);
    }

    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => {
    void carregarEnvios();
  }, [carregarEnvios]);

  const enviosFiltrados = useMemo(() => filtrarEnvios(envios, filtros), [envios, filtros]);
  const temFiltrosAtivos = filtrosAtivos(filtros);

  const resumo = useMemo(
    () => ({
      enviadosHoje: enviosFiltrados.filter((envio) => envio.status === "enviado").length,
      erros: enviosFiltrados.filter((envio) => envio.status === "erro").length,
      pendentes: enviosFiltrados.filter((envio) => envio.status === "pendente").length,
      total: enviosFiltrados.length,
    }),
    [enviosFiltrados],
  );

  const cards = [
    { label: "Mensagens enviadas", value: resumo.enviadosHoje, icon: "sent", color: "success", help: "Envios concluidos" },
    { label: "Mensagens com erro", value: resumo.erros, icon: "error", color: "danger", help: "Falhas registradas" },
    { label: "Mensagens pendentes", value: resumo.pendentes, icon: "pending", color: "warning", help: "Aguardando envio" },
    { label: "Total de envios", value: resumo.total, icon: "list", color: "primary", help: "Registros filtrados" },
  ];

  return (
    <main className="history-page">
      <header className="dashboard-header">
        <div>
          <h1>Histórico de Envio de Mensagens</h1>
          <p>Acompanhe os envios e reenvios de mensagens realizados para clientes.</p>
        </div>
        <button className="secondary-button" type="button" onClick={carregarEnvios} disabled={carregando}>
          Atualizar
        </button>
      </header>

      <section className="dashboard-card-grid" aria-label="Resumo de envios">
        {cards.map((card) => (
          <article className={`dashboard-card dashboard-card-with-icon metric-card metric-card-${card.color}`} key={card.label}>
            <div>
              <span>{card.label}</span>
              <strong>{carregando ? "..." : card.value}</strong>
              <small>{card.help}</small>
            </div>
            <div className="dashboard-card-icon" aria-hidden="true"><MetricCardIcon type={card.icon} /></div>
          </article>
        ))}
      </section>

      <section className="history-filters-panel" aria-label="Filtros do historico">
        <div className="panel-title history-filters-title">
          <h2>Filtros</h2>
          <span>Resultados: {enviosFiltrados.length}</span>
        </div>

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
              <option value="envio">Envio</option>
              <option value="reenvio">Reenvio</option>
              <option value="teste">Teste</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={filtros.status} onChange={(event) => setFiltros({ ...filtros, status: event.target.value })}>
              <option value="todos">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="erro">Erro</option>
              <option value="enviando">Enviando</option>
              <option value="pendente">Pendente</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>

        </div>
      </section>

      <section className="results-section">
        <div className="section-title">
          <h2>Historico de envios</h2>
          <span>Resultados: {enviosFiltrados.length}</span>
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
                <th>Status de entrega</th>
                <th>Mensagem</th>
                <th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {!carregando && !erro && enviosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={10}>
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
                    <span className={getStatusClass(envio.status)}>{mostrarValor(envio.status)}</span>
                  </td>
                  <td>{renderStatusEntrega(envio)}</td>
                  <td>
                    <span className="history-message-cell" title={mostrarValor(envio.mensagem)}>
                      {resumirMensagem(envio.mensagem)}
                    </span>
                  </td>
                  <td>
                    <span className="history-error-cell" title={mostrarValor(envio.erro)}>
                      {resumirErro(envio.erro)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
