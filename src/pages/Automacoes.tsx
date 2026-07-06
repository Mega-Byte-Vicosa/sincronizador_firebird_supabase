import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { supabase } from "../lib/supabaseClient";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

type AutomacaoStatus = "inativa" | "ativa" | "pausada" | "encerrada" | "erro";

interface CampanhaAutomatizada {
  id: string;
  id_empresa: string;
  nome: string;
  objetivo: string | null;
  mensagem: string | null;
  tipo_automacao: string | null;
  automacao_dias_carencia: number | null;
  automacao_dias_antes_vencimento: number | null;
  automacao_dias_sem_compra: number | null;
  automacao_dias_pos_compra: number | null;
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
    const limite = new Date(vencimento); limite.setDate(limite.getDate() + Number(automacao.automacao_dias_carencia ?? 0));
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

type AutomationIconName = "view" | "pause" | "play" | "stop" | "history" | "close";

function AutomationIcon({ name }: { name: AutomationIconName }) {
  const paths: Record<AutomationIconName, ReactNode> = {
    view: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function Automacoes() {
  const { usuario } = useAuth();
  const mesAtual = useMemo(periodoMesAtual, []);
  const [automacoes, setAutomacoes] = useState<CampanhaAutomatizada[]>([]);
  const [clientes, setClientes] = useState<ClienteAutomacao[]>([]);
  const [contas, setContas] = useState<ContaAutomacao[]>([]);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [continua, setContinua] = useState("todas");
  const [dataInicial, setDataInicial] = useState(mesAtual.inicio);
  const [dataFinal, setDataFinal] = useState(mesAtual.fim);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<CampanhaAutomatizada | null>(null);

  const carregar = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setAutomacoes([]);
      setClientes([]);
      setContas([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);
    const [campanhasResult, clientesResult, contasResult] = await Promise.all([
      supabase.from("tab_campanha")
        .select("id, id_empresa, nome, objetivo, mensagem, tipo_automacao, automacao_dias_carencia, automacao_dias_antes_vencimento, automacao_dias_sem_compra, automacao_dias_pos_compra, publico_dinamico, campanha_continua, termina_em, automacao_status, automacao_ultima_execucao_em, automacao_proxima_execucao_em, automacao_total_envios, automacao_total_erros, data_hora_criacao, data_hora_agendamento, criado_em")
        .eq("id_empresa", usuario.id_empresa).eq("automatizada", true).order("criado_em", { ascending: false }),
      supabase.from("tab_cliente")
        .select("id_cliente, dt_nascto, dt_ultcomp, ddd_celul, fone_celul, permite_campanha, contato_restrito")
        .eq("id_empresa", usuario.id_empresa),
      supabase.from("firebird_contas_receber")
        .select("id_ctarec, id_cliente, dt_vencto, dt_baixa, vlr_receb, cliente_telefone, dias_carencia")
        .eq("id_empresa", usuario.id_empresa),
    ]);

    if (campanhasResult.error || clientesResult.error || contasResult.error) {
      setAutomacoes([]);
      setClientes([]);
      setContas([]);
      setErro("Não foi possível carregar as automações.");
    } else {
      setAutomacoes((campanhasResult.data ?? []) as CampanhaAutomatizada[]);
      setClientes((clientesResult.data ?? []) as ClienteAutomacao[]);
      setContas((contasResult.data ?? []) as ContaAutomacao[]);
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
      if (status !== "todos" && statusEfetivo(automacao) !== status) return false;
      if (continua === "sim" && !automacao.campanha_continua) return false;
      if (continua === "nao" && automacao.campanha_continua) return false;
      const criadaEm = new Date(automacao.data_hora_criacao || automacao.criado_em);
      if (inicio && criadaEm < inicio) return false;
      if (fim && criadaEm >= fim) return false;
      return true;
    });
  }, [automacoes, busca, continua, dataFinal, dataInicial, status, tipo]);

  const resumo = useMemo(() => ({
    total: automacoes.length,
    ativas: automacoes.filter((item) => statusEfetivo(item) === "ativa").length,
    continuas: automacoes.filter((item) => item.campanha_continua && statusEfetivo(item) !== "encerrada").length,
    encerradas: automacoes.filter((item) => statusEfetivo(item) === "encerrada").length,
    erros: automacoes.filter((item) => statusEfetivo(item) === "erro").length,
  }), [automacoes]);

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

  const cards = [
    { label: "Total de automações", value: resumo.total, help: "Campanhas monitoradas", color: "azul", icon: "list" },
    { label: "Ativas", value: resumo.ativas, help: "Em monitoramento", color: "verde", icon: "sent" },
    { label: "Contínuas", value: resumo.continuas, help: "Sem data de término", color: "ciano", icon: "calendar" },
    { label: "Encerradas", value: resumo.encerradas, help: "Monitoramento finalizado", color: "laranja", icon: "pending" },
    { label: "Com erro", value: resumo.erros, help: "Precisam de atenção", color: "vermelho", icon: "error" },
  ];

  return (
    <main className="page-shell automations-page">
      <GlobalPageHeader title="Automações" subtitle="Gerencie campanhas automatizadas e monitoradas para envio via WhatsApp." icon="automation" actions={
        <button className="secondary-button" type="button" onClick={() => void carregar()} disabled={carregando}>Atualizar</button>
      } />

      <section className="summary-grid automations-summary-grid" aria-label="Resumo de automações">
        {cards.map((card) => (
          <article className={`summary-card summary-card-${card.color}`} key={card.label}>
            <div><span>{card.label}</span><strong>{carregando ? "..." : card.value}</strong><small>{card.help}</small></div>
            <div className="summary-card-icon"><MetricCardIcon type={card.icon} /></div>
          </article>
        ))}
      </section>

      <section className="history-filters-panel automations-filters" aria-label="Filtros de automações">
        <div className="automations-filter-grid">
          <label><span>Buscar</span><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome da campanha" /></label>
          <label><span>Tipo de automação</span><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="todos">Todos</option>{Object.entries(tipoLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="todos">Todos</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada</option><option value="erro">Com erro</option></select></label>
          <label><span>Data inicial</span><input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} /></label>
          <label><span>Data final</span><input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></label>
          <label><span>Campanha contínua</span><select value={continua} onChange={(e) => setContinua(e.target.value)}><option value="todas">Todas</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
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
                <td><strong>{automacao.nome}</strong><small>{labelAutomacao(automacao)}</small></td>
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
          <dl><div><dt>Tipo de automação</dt><dd>{labelAutomacao(detalhes)}</dd></div><div><dt>Público</dt><dd>Dinâmico</dd></div>{detalhes.tipo_automacao === "contas_vencidas_com_carencia" && <div><dt>Dias de carência</dt><dd>{detalhes.automacao_dias_carencia ?? "-"}</dd></div>}{detalhes.tipo_automacao === "contas_a_vencer_dias" && <div><dt>Dias antes do vencimento</dt><dd>{detalhes.automacao_dias_antes_vencimento ?? "-"}</dd></div>}{detalhes.tipo_automacao === "clientes_sem_comprar_dias" && <div><dt>Dias sem comprar</dt><dd>{detalhes.automacao_dias_sem_compra ?? "-"}</dd></div>}{detalhes.tipo_automacao === "pos_compra_dias" && <div><dt>Dias após a compra</dt><dd>{detalhes.automacao_dias_pos_compra ?? "-"}</dd></div>}<div><dt>Aptos agora</dt><dd>{obterPrevia(detalhes).aptos}</dd></div><div><dt>Ignorados agora</dt><dd>{obterPrevia(detalhes).ignorados}</dd></div><div><dt>Início</dt><dd>{formatarDataHora(detalhes.data_hora_agendamento || detalhes.data_hora_criacao)}</dd></div><div><dt>Termina em</dt><dd>{detalhes.campanha_continua ? "Campanha contínua" : formatarDataHora(detalhes.termina_em)}</dd></div><div><dt>Total de envios</dt><dd>{detalhes.automacao_total_envios}</dd></div><div><dt>Total de erros</dt><dd>{detalhes.automacao_total_erros}</dd></div></dl>
          <section><h3>Mensagem</h3><p>{detalhes.mensagem || "-"}</p></section>
        </aside>
      </div>}
    </main>
  );
}
