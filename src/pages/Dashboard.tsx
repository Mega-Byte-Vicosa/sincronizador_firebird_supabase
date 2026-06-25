import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ContaReceber } from "../types/contasReceber";
import { formatarDataHora, formatarMoeda } from "./ContasAReceber";

type DashboardCardIcon = "clientes" | "valor" | "vencendo" | "recebidas";

interface DashboardResumo {
  clientesEmAtraso: number;
  valorEmAtraso: number;
  vencendoHoje: number;
  valorVencendoHoje: number;
  recebidas: number;
  vencidas: number;
  aVencer: number;
}

interface BtzapConfigDashboard {
  id: number;
  nome_instancia: string | null;
  url_servidor: string | null;
  token_instancia: string | null;
  ativo: boolean | null;
  endpoint_envio_texto: string | null;
  metodo_envio_texto: string | null;
  formato_payload: string | null;
  atualizado_em: string | null;
}

interface WhatsappEnvioDashboard {
  id: number;
  status: string | null;
  criado_em: string | null;
  enviado_em: string | null;
}

interface MonitoramentoWhatsapp {
  status: string;
  statusClass: string;
  enviadosHoje: number;
  falhasHoje: number;
  ultimaAtualizacao: string;
}

const monitoramentoInicial: MonitoramentoWhatsapp = {
  status: "Nao configurado",
  statusClass: "dashboard-whatsapp-status-error",
  enviadosHoje: 0,
  falhasHoje: 0,
  ultimaAtualizacao: "-",
};

function DashboardIcon({ tipo }: { tipo: DashboardCardIcon }) {
  if (tipo === "clientes") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 19v-1.4c0-1.5-1.2-2.7-2.7-2.7H6.7C5.2 14.9 4 16.1 4 17.6V19" />
        <circle cx="10" cy="8" r="3" />
        <path d="M20 19v-1.3c0-1.3-.8-2.4-2-2.8" />
        <path d="M16.7 5.2a3 3 0 0 1 0 5.6" />
      </svg>
    );
  }

  if (tipo === "valor") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M17 7.5c-.7-1.2-2-2-3.8-2H10c-2 0-3.5 1.2-3.5 2.9 0 1.8 1.4 2.6 3.2 3l4.5 1c1.8.4 3.3 1.2 3.3 3 0 1.8-1.5 3.1-3.6 3.1h-3.1c-2 0-3.4-.8-4.2-2.1" />
      </svg>
    );
  }

  if (tipo === "vencendo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v3" />
        <path d="M17 3v3" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
        <path d="M12 14v3" />
        <path d="M12 17h3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="m8 15 2 2 5-5" />
    </svg>
  );
}

function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function normalizarData(data: string | null | undefined) {
  if (!data) return null;
  return data.split("T")[0] || null;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isSameDate(dateA: Date | null, dateB: Date) {
  if (!dateA) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isContaEmAberto(conta: ContaReceber) {
  return !conta.dt_baixa && safeNumber(conta.vlr_receb) <= 0;
}

function isDataDentroDoMes(date: Date | null, mesSelecionado: Date) {
  if (!date) return false;
  const inicioMes = getInicioMes(mesSelecionado);
  const fimMes = getFimMes(mesSelecionado);

  return date >= inicioMes && date < fimMes;
}

function getInicioMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function getFimMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth() + 1, 1);
}

function formatarMesAno(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(data);
}

function isRecebida(conta: ContaReceber) {
  return Boolean(conta.dt_baixa) || Number(conta.vlr_receb || 0) > 0;
}

function valorPreenchido(valor: string | null | undefined) {
  return Boolean(String(valor ?? "").trim());
}

function calcularStatusWhatsapp(config: BtzapConfigDashboard | null) {
  if (!config) {
    return {
      status: "Nao configurado",
      statusClass: "dashboard-whatsapp-status-error",
    };
  }

  if (config.ativo === false) {
    return {
      status: "Desativado",
      statusClass: "dashboard-whatsapp-status-muted",
    };
  }

  const semConfiguracaoBase =
    !valorPreenchido(config.nome_instancia) ||
    !valorPreenchido(config.url_servidor) ||
    !valorPreenchido(config.token_instancia);

  if (semConfiguracaoBase) {
    return {
      status: "Nao configurado",
      statusClass: "dashboard-whatsapp-status-error",
    };
  }

  if (!valorPreenchido(config.endpoint_envio_texto)) {
    return {
      status: "Configuracao incompleta",
      statusClass: "dashboard-whatsapp-status-warning",
    };
  }

  return {
    status: "Configurado",
    statusClass: "dashboard-whatsapp-status-ok",
  };
}

function dataEstaHoje(valor: string | null | undefined) {
  return normalizarData(valor) === hojeISO();
}

function isContaVencidaNoPeriodo(conta: ContaReceber, inicioMes: Date, fimMes: Date) {
  if (isRecebida(conta)) return false;

  const vencimento = parseDateOnly(conta.dt_vencto);
  if (!vencimento) return false;

  const hojeData = new Date();
  const hojePuro = new Date(hojeData.getFullYear(), hojeData.getMonth(), hojeData.getDate());

  return vencimento >= inicioMes && vencimento < fimMes && vencimento < hojePuro;
}

function getContasVencidasNoMes(contas: ContaReceber[], mesSelecionado: Date) {
  const inicioMes = getInicioMes(mesSelecionado);
  const fimMes = getFimMes(mesSelecionado);

  return contas.filter((conta) => isContaVencidaNoPeriodo(conta, inicioMes, fimMes));
}

function calcularClientesEmAtraso(contas: ContaReceber[], mesSelecionado: Date) {
  const clientes = new Set<string>();

  getContasVencidasNoMes(contas, mesSelecionado).forEach((conta) => {
    const chave = conta.id_cliente ? `id:${conta.id_cliente}` : `nome:${conta.cliente_nome ?? "sem-cliente"}`;
    clientes.add(chave);
  });

  return clientes.size;
}

function calcularValorEmAtraso(contas: ContaReceber[], mesSelecionado: Date) {
  return getContasVencidasNoMes(contas, mesSelecionado).reduce(
    (total, conta) => total + safeNumber(conta.vlr_ctarec),
    0,
  );
}

function calcularRecebidasNoMes(contas: ContaReceber[], mesSelecionado: Date) {
  const contasRecebidasMes = contas.filter((conta) => isDataDentroDoMes(parseDateOnly(conta.dt_baixa), mesSelecionado));

  return {
    quantidade: contasRecebidasMes.length,
    valorTotal: contasRecebidasMes.reduce((total, conta) => total + safeNumber(conta.vlr_receb), 0),
  };
}

function calcularDashboard(contas: ContaReceber[]): DashboardResumo {
  const hojeData = new Date();
  const hoje = new Date(hojeData.getFullYear(), hojeData.getMonth(), hojeData.getDate());
  const hojeTexto = hojeISO();

  return contas.reduce<DashboardResumo>(
    (resumo, conta) => {
      const vencimento = normalizarData(conta.dt_vencto);
      const recebida = isRecebida(conta);

      if (recebida) {
        resumo.recebidas += 1;
        return resumo;
      }

      if (isSameDate(parseDateOnly(conta.dt_vencto), hoje) && isContaEmAberto(conta)) {
        resumo.vencendoHoje += 1;
        resumo.valorVencendoHoje += safeNumber(conta.vlr_ctarec);
      } else if (vencimento !== null && vencimento < hojeTexto) {
        resumo.clientesEmAtraso += 1;
        resumo.vencidas += 1;
        resumo.valorEmAtraso += safeNumber(conta.vlr_ctarec);
      } else if (vencimento !== null && vencimento > hojeTexto) {
        resumo.aVencer += 1;
      }

      return resumo;
    },
    {
      clientesEmAtraso: 0,
      valorEmAtraso: 0,
      vencendoHoje: 0,
      valorVencendoHoje: 0,
      recebidas: 0,
      vencidas: 0,
      aVencer: 0,
    },
  );
}

export function Dashboard() {
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState(() => getInicioMes(new Date()));
  const [mesRecebidasSelecionado, setMesRecebidasSelecionado] = useState(() => getInicioMes(new Date()));
  const [monitoramentoWhatsapp, setMonitoramentoWhatsapp] = useState<MonitoramentoWhatsapp>(monitoramentoInicial);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarMonitoramentoWhatsapp = useCallback(async () => {
    try {
      const hoje = new Date();
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
      const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString();

      const { data: config, error: configError } = await supabase
        .from("tab_btzap_config")
        .select(
          "id, nome_instancia, url_servidor, token_instancia, ativo, endpoint_envio_texto, metodo_envio_texto, formato_payload, atualizado_em",
        )
        .eq("id", 1)
        .maybeSingle();

      if (configError) throw configError;

      const { data: enviosHoje, error: enviosError } = await supabase
        .from("tab_whatsapp_envios")
        .select("id, status, criado_em, enviado_em")
        .gte("criado_em", inicioHoje)
        .lt("criado_em", fimHoje);

      if (enviosError) throw enviosError;

      const configBtzap = (config ?? null) as BtzapConfigDashboard | null;
      const envios = (enviosHoje ?? []) as WhatsappEnvioDashboard[];
      const statusCalculado = calcularStatusWhatsapp(configBtzap);

      setMonitoramentoWhatsapp({
        ...statusCalculado,
        enviadosHoje: envios.filter(
          (envio) => envio.status === "enviado" && dataEstaHoje(envio.enviado_em || envio.criado_em),
        ).length,
        falhasHoje: envios.filter((envio) => envio.status === "erro" && dataEstaHoje(envio.criado_em)).length,
        ultimaAtualizacao: configBtzap?.atualizado_em ? formatarDataHora(configBtzap.atualizado_em) : "-",
      });
    } catch (error) {
      console.error("Erro ao carregar monitoramento WhatsApp:", error);
      setMonitoramentoWhatsapp({
        status: "Erro ao validar",
        statusClass: "dashboard-whatsapp-status-error",
        enviadosHoje: 0,
        falhasHoje: 0,
        ultimaAtualizacao: "-",
      });
    }
  }, []);

  const carregarDashboard = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    const [{ data, error }] = await Promise.all([
      supabase.from("firebird_contas_receber").select("*"),
      carregarMonitoramentoWhatsapp(),
    ]);

    if (error) {
      setContas([]);
      setErro(error.message);
    } else {
      setContas((data ?? []) as ContaReceber[]);
    }

    setCarregando(false);
  }, [carregarMonitoramentoWhatsapp]);

  useEffect(() => {
    void carregarDashboard();
  }, [carregarDashboard]);

  const resumo = useMemo(() => calcularDashboard(contas), [contas]);
  const clientesEmAtrasoMes = useMemo(
    () => calcularClientesEmAtraso(contas, mesSelecionado),
    [contas, mesSelecionado],
  );
  const valorEmAtrasoMes = useMemo(() => calcularValorEmAtraso(contas, mesSelecionado), [contas, mesSelecionado]);
  const mesSelecionadoLabel = formatarMesAno(mesSelecionado);
  const recebidasMes = useMemo(
    () => calcularRecebidasNoMes(contas, mesRecebidasSelecionado),
    [contas, mesRecebidasSelecionado],
  );
  const quantidadeRecebidasMes = recebidasMes.quantidade;
  const valorRecebidasMes = recebidasMes.valorTotal;
  const mesRecebidasSelecionadoLabel = formatarMesAno(mesRecebidasSelecionado);
  const totalStatus = Math.max(1, resumo.vencidas + resumo.vencendoHoje + resumo.aVencer + resumo.recebidas);

  const barras: Array<[string, number, string]> = [
    ["Vencidas", resumo.vencidas, "bar-red"],
    ["Vencendo hoje", resumo.vencendoHoje, "bar-blue"],
    ["A vencer", resumo.aVencer, "bar-dark"],
    ["Recebidas", resumo.recebidas, "bar-green"],
  ];

  function irMesAnterior() {
    setMesSelecionado((mesAtual) => getInicioMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1)));
  }

  function irProximoMes() {
    setMesSelecionado((mesAtual) => getInicioMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1)));
  }

  function irMesRecebidasAnterior() {
    setMesRecebidasSelecionado((mesAtual) => getInicioMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1)));
  }

  function irProximoMesRecebidas() {
    setMesRecebidasSelecionado((mesAtual) => getInicioMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1)));
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral dos clientes, contas e campanhas</p>
        </div>
        <button className="secondary-button" type="button" onClick={carregarDashboard} disabled={carregando}>
          Atualizar painel
        </button>
      </header>

      {erro && <div className="state-box state-box-error">Erro ao carregar indicadores do dashboard.</div>}

      <section className="dashboard-card-grid" aria-label="Indicadores principais">
        <article className="dashboard-card dashboard-card-with-icon dashboard-card-clientes">
          <div>
            <span>Clientes em atraso</span>
            <div className="dashboard-month-nav" aria-label="Mes selecionado">
              <button className="dashboard-month-button dashboard-month-button-prev" type="button" onClick={irMesAnterior} aria-label="Mes anterior" />
              <strong>{mesSelecionadoLabel}</strong>
              <button className="dashboard-month-button dashboard-month-button-next" type="button" onClick={irProximoMes} aria-label="Proximo mes" />
            </div>
            <strong>{carregando ? "..." : clientesEmAtrasoMes}</strong>
          </div>
          <div className="dashboard-card-icon">
            <DashboardIcon tipo="clientes" />
          </div>
        </article>

        <article className="dashboard-card dashboard-card-with-icon dashboard-card-valor">
          <div>
            <span>Valor em atraso</span>
            <small>{mesSelecionadoLabel}</small>
            <strong>{carregando ? "..." : formatarMoeda(valorEmAtrasoMes)}</strong>
          </div>
          <div className="dashboard-card-icon">
            <DashboardIcon tipo="valor" />
          </div>
        </article>

        <article className="dashboard-card dashboard-card-with-icon dashboard-card-vencendo">
          <div>
            <span>Vencendo hoje</span>
            <strong>{carregando ? "..." : resumo.vencendoHoje}</strong>
            <small className="dashboard-card-total">
              Total: {carregando ? "..." : formatarMoeda(resumo.valorVencendoHoje)}
            </small>
          </div>
          <div className="dashboard-card-icon">
            <DashboardIcon tipo="vencendo" />
          </div>
        </article>

        <article className="dashboard-card dashboard-card-with-icon dashboard-card-recebidas">
          <div>
            <span>Recebidas</span>
            <div className="dashboard-month-nav" aria-label="Mes selecionado para recebidas">
              <button
                className="dashboard-month-button dashboard-month-button-prev"
                type="button"
                onClick={irMesRecebidasAnterior}
                aria-label="Mes anterior"
              />
              <strong>{mesRecebidasSelecionadoLabel}</strong>
              <button
                className="dashboard-month-button dashboard-month-button-next"
                type="button"
                onClick={irProximoMesRecebidas}
                aria-label="Proximo mes"
              />
            </div>
            <strong>{carregando ? "..." : quantidadeRecebidasMes}</strong>
            <small className="dashboard-card-total">
              Total: {carregando ? "..." : formatarMoeda(valorRecebidasMes)}
            </small>
          </div>
          <div className="dashboard-card-icon">
            <DashboardIcon tipo="recebidas" />
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-panel">
          <div className="panel-title">
            <h2>Resumo de contas</h2>
            <span>{contas.length} registro(s)</span>
          </div>
          <div className="bar-list">
            {barras.map(([label, value, className]) => (
              <div className="bar-row" key={label}>
                <div className="bar-row-header">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <div className="bar-track">
                  <span className={String(className)} style={{ width: `${(Number(value) / totalStatus) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="panel-title">
            <h2>Proximas acoes</h2>
          </div>
          <ul className="action-list">
            <li>Enviar lembrete para clientes em atraso</li>
            <li>Preparar campanha para aniversariantes</li>
            <li>Criar promocao para clientes ativos</li>
            <li>Revisar configuracao do WhatsApp</li>
          </ul>
        </article>

        <article className="dashboard-panel whatsapp-panel">
          <div className="panel-title">
            <h2>Monitoramento WhatsApp</h2>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`dashboard-whatsapp-status ${monitoramentoWhatsapp.statusClass}`}>
                  {monitoramentoWhatsapp.status}
                </span>
              </dd>
            </div>
            <div>
              <dt>Mensagens enviadas hoje</dt>
              <dd>{monitoramentoWhatsapp.enviadosHoje}</dd>
            </div>
            <div>
              <dt>Falhas de envio</dt>
              <dd>{monitoramentoWhatsapp.falhasHoje}</dd>
            </div>
            <div>
              <dt>Ultima atualizacao</dt>
              <dd>{monitoramentoWhatsapp.ultimaAtualizacao}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
