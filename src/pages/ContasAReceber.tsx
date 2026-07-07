import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ContaReceber } from "../types/contasReceber";
import { ProgramarMensagemContaReceberModal } from "./MensagensProgramadas";
import { montarMensagemCobrancaWhatsapp } from "../utils/mensagemCobranca";
import { useAuth } from "../auth/AuthContext";
import type { ModeloMensagem } from "../types/modeloMensagem";
import { aplicarVariaveisModelo, buscarModelosMensagem, getCategoriaModeloConta, montarVariaveisContaReceber, prepararCorpoModeloContaReceber } from "../utils/modelosMensagem";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

type TipoConta = "Todos" | "N" | "C" | "D" | "E";
type OutroFiltro = "Vencidas e vencendo hoje" | "Todos" | "Vencendo hoje" | "A vencer" | "Em carência" | "Vencidas" | "Recebidas";
type StatusConta = "recebida" | "vencendo_hoje" | "em_carencia" | "vencida" | "a_vencer";

interface ResumoContas {
  contasListadas: number;
  valorTotal: number;
  qtdVencidas: number;
  valorVencido: number;
  qtdAVencer: number;
  valorAVencer: number;
}

type ResumoCardIcone = "lista" | "valor" | "alerta" | "valor-alerta" | "calendario" | "valor-futuro";
type ResumoCardCor = "azul" | "verde" | "vermelho" | "laranja" | "ciano";

interface ResumoCardProps {
  titulo: string;
  valor: string;
  subtitulo: string;
  icone: ResumoCardIcone;
  cor: ResumoCardCor;
}

interface RevisaoWhatsapp {
  conta: ContaReceber;
  tipoEnvio: "envio" | "reenvio";
  telefone: string;
  mensagem: string;
  erro: string | null;
  enviando: boolean;
  modelos: ModeloMensagem[];
  modeloSelecionado: string;
  carregandoModelos: boolean;
}

type WhatsappReviewIconType = "message" | "user" | "phone" | "file" | "money" | "calendar" | "send" | "close";

interface MensagemProgramadaConta {
  id_origem: string | null;
  status: string;
  executar_em: string | null;
}

interface AgendamentoConta {
  status: string;
  total: number;
  proximoEnvio: string | null;
}

type AgendamentosPorConta = Record<string, AgendamentoConta>;

const prioridadeAgendamento: Record<string, number> = {
  ERRO: 1,
  AGENDADO: 2,
  PROCESSANDO: 3,
  PENDENTE: 4,
  ENVIADO: 5,
};

function normalizarStatusAgendamento(status: string) {
  const normalizado = status.trim().toUpperCase();
  if (normalizado === "AGENDADA") return "AGENDADO";
  if (normalizado === "ENVIADA") return "ENVIADO";
  return normalizado;
}

function montarMapaAgendamentos(mensagens: MensagemProgramadaConta[]) {
  const grupos = new Map<string, MensagemProgramadaConta[]>();

  for (const mensagem of mensagens) {
    if (!mensagem.id_origem) continue;
    const status = normalizarStatusAgendamento(mensagem.status);
    if (!(status in prioridadeAgendamento)) continue;
    const idOrigem = String(mensagem.id_origem);
    grupos.set(idOrigem, [...(grupos.get(idOrigem) ?? []), { ...mensagem, status }]);
  }

  return Array.from(grupos.entries()).reduce<AgendamentosPorConta>((mapa, [idOrigem, registros]) => {
    const ordenados = [...registros].sort(
      (a, b) => prioridadeAgendamento[a.status] - prioridadeAgendamento[b.status],
    );
    const proximos = registros
      .filter((registro) => ["AGENDADO", "PROCESSANDO", "PENDENTE"].includes(registro.status) && registro.executar_em)
      .sort((a, b) => String(a.executar_em).localeCompare(String(b.executar_em)));

    mapa[idOrigem] = {
      status: ordenados[0].status,
      total: registros.length,
      proximoEnvio: proximos[0]?.executar_em ?? null,
    };
    return mapa;
  }, {});
}

function renderAgendamentoConta(agendamento: AgendamentoConta | undefined) {
  if (!agendamento) return <span className="receivable-schedule-badge schedule-none">Sem agendamento</span>;

  const configuracao = {
    ERRO: ["Erro no envio", "schedule-error"],
    AGENDADO: ["Agendado", "schedule-scheduled"],
    PROCESSANDO: ["Processando", "schedule-processing"],
    PENDENTE: ["Pendente", "schedule-pending"],
    ENVIADO: ["Enviado", "schedule-sent"],
  }[agendamento.status] ?? [agendamento.status, "schedule-none"];
  const proximoEnvio = agendamento.proximoEnvio ? formatarDataHora(agendamento.proximoEnvio) : "-";
  const tooltip = `Total de agendamentos: ${agendamento.total}\nPróximo envio: ${proximoEnvio}\nStatus: ${agendamento.status}`;

  return (
    <span className={`receivable-schedule-badge ${configuracao[1]}`} title={tooltip}>
      {configuracao[0]}
    </span>
  );
}

const tipoContaLegenda: Record<Exclude<TipoConta, "Todos">, string> = {
  N: "N - Nota fiscal",
  C: "C - Cupom",
  D: "D - Diversa",
  E: "E - NF eletrônica",
};

function ResumoCardIcon({ tipo }: { tipo: ResumoCardIcone }) {
  if (tipo === "lista") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </svg>
    );
  }

  if (tipo === "alerta") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.5 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }

  if (tipo === "calendario") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v3" />
        <path d="M17 3v3" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
        <path d="M9 15h6" />
      </svg>
    );
  }

  if (tipo === "valor-alerta") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M16.5 7.5c-.7-1.1-1.9-1.7-3.5-1.7h-2c-1.8 0-3.2 1-3.2 2.5 0 1.6 1.3 2.2 2.9 2.6l3.8.8c1.6.4 2.9 1 2.9 2.6s-1.4 2.7-3.3 2.7h-2.5c-1.8 0-3.1-.7-3.8-1.9" />
        <path d="M19 5v4" />
        <path d="M19 13h.01" />
      </svg>
    );
  }

  if (tipo === "valor-futuro") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M16.5 7.5c-.7-1.1-1.9-1.7-3.5-1.7h-2c-1.8 0-3.2 1-3.2 2.5 0 1.6 1.3 2.2 2.9 2.6l3.8.8c1.6.4 2.9 1 2.9 2.6s-1.4 2.7-3.3 2.7h-2.5c-1.8 0-3.1-.7-3.8-1.9" />
        <path d="M18 4h3v3" />
        <path d="m21 4-4 4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M17 7.5c-.7-1.2-2-2-3.8-2H10c-2 0-3.5 1.2-3.5 2.9 0 1.8 1.4 2.6 3.2 3l4.5 1c1.8.4 3.3 1.2 3.3 3 0 1.8-1.5 3.1-3.6 3.1h-3.1c-2 0-3.4-.8-4.2-2.1" />
    </svg>
  );
}

function ResumoCard({ titulo, valor, subtitulo, icone, cor }: ResumoCardProps) {
  return (
    <article className={`summary-card summary-card-${cor}`}>
      <div>
        <span>{titulo}</span>
        <strong>{valor}</strong>
        <small>{subtitulo}</small>
      </div>
      <div className="summary-card-icon">
        <ResumoCardIcon tipo={icone} />
      </div>
    </article>
  );
}

function WhatsappReviewIcon({ tipo }: { tipo: WhatsappReviewIconType }) {
  if (tipo === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (tipo === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 16.9v2.8a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4 2 2 0 0 1 4.1 2h2.8a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.8 9.6a16 16 0 0 0 6.6 6.6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 1.8Z" />
      </svg>
    );
  }

  if (tipo === "file") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }

  if (tipo === "money") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M17 7.5c-.7-1.2-2-2-3.8-2H10c-2 0-3.5 1.2-3.5 2.9 0 1.8 1.4 2.6 3.2 3l4.5 1c1.8.4 3.3 1.2 3.3 3 0 1.8-1.5 3.1-3.6 3.1h-3.1c-2 0-3.4-.8-4.2-2.1" />
      </svg>
    );
  }

  if (tipo === "calendar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v3" />
        <path d="M17 3v3" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (tipo === "send") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    );
  }

  if (tipo === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8Z" />
    </svg>
  );
}

function WhatsappReviewInfoCard({ icon, label, value }: { icon: WhatsappReviewIconType; label: string; value: string }) {
  return (
    <div className="whatsapp-review-info-card">
      <div>
        <span className="whatsapp-review-info-icon">
          <WhatsappReviewIcon tipo={icon} />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value || "-"}</strong>
    </div>
  );
}

const camposClienteDetalhes = [
  ["ID Cliente", "id_cliente"],
  ["Nome", "cliente_nome"],
  ["Status", "cliente_status"],
  ["Telefone", "cliente_telefone"],
  ["E-mail", "cliente_email"],
] as const;

const camposVendedorDetalhes = [
  ["ID Vendedor", "id_vendedor"],
  ["Código Vendedor", "vendedor_codigo"],
  ["Nome", "vendedor_nome"],
  ["Apelido", "vendedor_apelido"],
  ["Status", "vendedor_status"],
  ["Telefone", "vendedor_telefone"],
  ["E-mail", "vendedor_email"],
] as const;

const camposRecebimentoDetalhes = [
  ["Data da baixa", "dt_baixa"],
  ["Hora da baixa", "hr_baixa"],
  ["Valor recebido", "vlr_receb"],
] as const;

const camposContaDetalhes = [
  "id_ctarec",
  "documento",
  "historico",
  "dt_emissao",
  "dt_vencto",
  "dt_vencto_orig",
  "vlr_ctarec",
  "tip_ctarec",
  "id_portador",
  "id_venda",
  "id_vendedor",
  "id_conta",
  "id_ctapla_origem",
  "id_tipo_cliente",
  "inv_referencia",
  "nsu_cartao",
  "txid_qrcode_pix",
  "id_bank_account",
  "ignora_concil_cartao",
  "id_conversao",
  "receb_aut",
  "id_debx",
  "id_cartao_operadora",
  "observacao",
  "sincronizado_em",
] as const;

const moedaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function valorVazio(valor: unknown) {
  return valor === null || valor === undefined || valor === "";
}

function transformarErroEmTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Error) return valor.message;

  if (Array.isArray(valor)) {
    return valor
      .map((item) => transformarErroEmTexto(item))
      .filter(Boolean)
      .join(" | ");
  }

  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    const camposPrioritarios = ["message", "error", "detail", "details", "description", "retorno", "body"];

    const mensagens = camposPrioritarios
      .map((campo) => transformarErroEmTexto(objeto[campo]))
      .filter(Boolean);

    if (mensagens.length > 0) {
      return [...new Set(mensagens)].join(" | ");
    }

    try {
      return JSON.stringify(valor);
    } catch {
      return "Erro desconhecido.";
    }
  }

  return String(valor);
}

function montarMensagemErroWhatsapp(data: unknown) {
  const texto = transformarErroEmTexto(data);
  const textoLower = texto.toLowerCase();

  if (textoLower.includes("not on whatsapp") || textoLower.includes("is not on whatsapp")) {
    return "Não foi possível enviar: este número não possui WhatsApp ou está inválido.";
  }

  if (textoLower.includes("token") || textoLower.includes("unauthorized") || textoLower.includes("401")) {
    return "Não foi possível enviar: token ou autenticação do BTZap inválida.";
  }

  if (textoLower.includes("instance") || textoLower.includes("instância") || textoLower.includes("disconnected")) {
    return "Não foi possível enviar: a instância do WhatsApp/BTZap pode estar desconectada.";
  }

  return texto || "Não foi possível enviar a mensagem WhatsApp.";
}

function hojeISO(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

async function detalharErroEdgeFunction(error: unknown) {
  const erro = error as { message?: string; context?: unknown; name?: string } | null;
  const partes = [erro?.message || "Falha ao chamar a Edge Function."];
  const context = erro?.context;
  if (context instanceof Response) {
    partes.push(`HTTP ${context.status}${context.statusText ? ` ${context.statusText}` : ""}`);
    try {
      const corpo = await context.clone().text();
      if (corpo) partes.push(montarMensagemErroWhatsapp(corpo));
    } catch {
      // Mantém ao menos status e mensagem original.
    }
  } else if (context) {
    partes.push(transformarErroEmTexto(context));
  }
  return [...new Set(partes.filter(Boolean))].join(" | ");
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

function normalizarDataISO(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const match = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizarData(data: string | null | undefined) {
  return normalizarDataISO(data);
}

function parseISODateLocal(dataISO: string): Date {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatISODateLocal(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function adicionarDiasISO(dataISO: string, dias: number): string {
  const data = parseISODateLocal(dataISO);
  data.setDate(data.getDate() + dias);
  return formatISODateLocal(data);
}

function calcularDiferencaDias(dataInicialISO: string, dataFinalISO: string): number {
  const inicio = parseISODateLocal(dataInicialISO);
  const fim = parseISODateLocal(dataFinalISO);
  return Math.floor((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000));
}

function getDiasCarencia(conta: ContaReceber): number {
  const valor = numeroSeguro(conta.dias_carencia);
  return valor >= 0 ? Math.trunc(valor) : 0;
}

function numeroSeguro(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function getDataFinalCarenciaISO(conta: ContaReceber): string | null {
  const vencimentoISO = normalizarDataISO(conta.dt_vencto);
  return vencimentoISO ? adicionarDiasISO(vencimentoISO, getDiasCarencia(conta)) : null;
}

export function formatarMoeda(valor: number | null | undefined) {
  return moedaFormatter.format(Number(valor ?? 0));
}

export function formatarData(valor: string | null | undefined) {
  if (!valor) return "-";

  const [data] = valor.split("T");
  const partes = data.split("-");

  if (partes.length !== 3) return "-";

  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarHora(valor: string | null | undefined) {
  if (!valor) return "-";

  const somenteHora = valor.includes("T") ? valor.split("T")[1] : valor;
  const [hora = "", minuto = "", segundo = ""] = somenteHora.split(":");

  if (!hora || !minuto) return "-";

  return segundo ? `${hora}:${minuto}:${segundo.slice(0, 2)}` : `${hora}:${minuto}`;
}

export function calcularResumo(contas: ContaReceber[]): ResumoContas {
  return contas.reduce<ResumoContas>(
    (resumo, conta) => {
      const valor = Number(conta.vlr_ctarec ?? 0);
      const status = getStatusConta(conta);

      resumo.contasListadas += 1;
      resumo.valorTotal += valor;

      if (status === "vencida") {
        resumo.qtdVencidas += 1;
        resumo.valorVencido += valor;
      } else if (status === "a_vencer" || status === "vencendo_hoje" || status === "em_carencia") {
        resumo.qtdAVencer += 1;
        resumo.valorAVencer += valor;
      }

      return resumo;
    },
    {
      contasListadas: 0,
      valorTotal: 0,
      qtdVencidas: 0,
      valorVencido: 0,
      qtdAVencer: 0,
      valorAVencer: 0,
    },
  );
}

function normalizarBusca(valor: unknown) {
  return String(valor ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function isRecebida(conta: ContaReceber) {
  return normalizarData(conta.dt_baixa) !== null || Number(conta.vlr_receb ?? 0) > 0;
}

function contaEstaRecebida(conta: ContaReceber): boolean {
  return isRecebida(conta);
}

function getStatusConta(conta: ContaReceber): StatusConta {
  if (contaEstaRecebida(conta)) return "recebida";
  const vencimentoISO = normalizarDataISO(conta.dt_vencto);
  if (!vencimentoISO) return "a_vencer";
  const hoje = hojeISO();
  if (vencimentoISO === hoje) return "vencendo_hoje";
  if (vencimentoISO > hoje) return "a_vencer";
  const dataFinalCarenciaISO = getDataFinalCarenciaISO(conta);
  if (dataFinalCarenciaISO && hoje <= dataFinalCarenciaISO) return "em_carencia";
  return "vencida";
}

function contaEstaVencidaForaDaCarencia(conta: ContaReceber): boolean {
  return getStatusConta(conta) === "vencida";
}

function getStatusLabel(conta: ContaReceber) {
  const status = getStatusConta(conta);

  if (status === "recebida") return "Recebida";
  if (status === "vencendo_hoje") return "Vencendo hoje";
  if (status === "em_carencia") return "Em carência";
  if (status === "vencida") return "Vencida";

  return "A vencer";
}

function getStatusClass(conta: ContaReceber) {
  return `status-badge status-${getStatusConta(conta)}`;
}

function atendeOutroFiltro(conta: ContaReceber, outroFiltro: OutroFiltro) {
  const status = getStatusConta(conta);
  if (outroFiltro === "Vencidas e vencendo hoje") {
    return status === "vencida" || status === "em_carencia" || status === "vencendo_hoje";
  }
  if (outroFiltro === "Todos") return true;
  if (outroFiltro === "Recebidas") return status === "recebida";
  if (outroFiltro === "Vencendo hoje") return status === "vencendo_hoje";
  if (outroFiltro === "Em carência") return status === "em_carencia";
  if (outroFiltro === "Vencidas") return status === "vencida";
  return status === "a_vencer";
}

function calcularValorAtual(conta: ContaReceber): number {
  const valorOriginal = numeroSeguro(conta.vlr_ctarec);
  if (!contaEstaVencidaForaDaCarencia(conta)) return valorOriginal;

  const vencimentoISO = normalizarDataISO(conta.dt_vencto);
  if (!vencimentoISO) return valorOriginal;
  const diasJuros = calcularDiferencaDias(vencimentoISO, hojeISO());
  if (diasJuros <= 0) return valorOriginal;

  const percMulta = numeroSeguro(conta.perc_multa);
  const percJuros = numeroSeguro(conta.perc_juros);
  const tipoJuros = String(conta.tipo_juros ?? "S").trim().toUpperCase();
  const multa = valorOriginal * (percMulta / 100);
  const taxaJuros = percJuros / 100;

  // A carência impede cobrança enquanto estiver vigente. Caso a conta ultrapasse a carência,
  // multa e juros são calculados considerando a data original de vencimento.
  const juros = tipoJuros === "C"
    ? valorOriginal * (Math.pow(1 + taxaJuros, diasJuros) - 1)
    : valorOriginal * taxaJuros * diasJuros;
  return valorOriginal + multa + juros;
}

function deveMostrarValorAtual(conta: ContaReceber): boolean {
  return getStatusConta(conta) === "vencida";
}

function formatarPercentualParametro(valor: number | null | undefined): string {
  const numero = numeroSeguro(valor);
  return `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`;
}

function formatarTipoJuros(valor: string | null | undefined): string {
  return String(valor ?? "S").trim().toUpperCase() === "C" ? "Composto" : "Simples";
}

function formatarValorCampo(conta: ContaReceber, campo: keyof ContaReceber) {
  const valor = conta[campo];

  if (valorVazio(valor)) return "-";
  if (campo === "vlr_ctarec" || campo === "vlr_receb") return formatarMoeda(Number(valor));
  if (campo === "dt_emissao" || campo === "dt_vencto" || campo === "dt_vencto_orig" || campo === "dt_baixa") {
    return formatarData(String(valor));
  }
  if (campo === "hr_baixa") return formatarHora(String(valor));
  if (campo === "sincronizado_em") return formatarDataHora(String(valor));
  if (campo === "tip_ctarec" && typeof valor === "string") {
    return tipoContaLegenda[valor as Exclude<TipoConta, "Todos">] ?? valor;
  }
  if (campo === "cliente_status" && typeof valor === "string") {
    if (valor === "A") return "Ativo";
    if (valor === "I") return "Inativo";
  }

  return String(valor);
}

function formatarClienteTabela(conta: ContaReceber) {
  const nomeCliente = valorVazio(conta.cliente_nome) ? "Cliente não encontrado" : conta.cliente_nome;

  return (
    <span className="entity-cell">
      <strong>{nomeCliente}</strong>
      <span>ID: {valorVazio(conta.id_cliente) ? "-" : conta.id_cliente}</span>
    </span>
  );
}

function formatarVendedorTabela(conta: ContaReceber) {
  const nomeVendedor = valorVazio(conta.vendedor_nome) ? "Vendedor não encontrado" : conta.vendedor_nome;

  return (
    <span className="entity-cell">
      <strong>{nomeVendedor}</strong>
      <span>ID: {valorVazio(conta.id_vendedor) ? "-" : conta.id_vendedor}</span>
    </span>
  );
}

function formatarSincronizadoTabela(conta: ContaReceber) {
  if (!conta.sincronizado_em) return "-";

  const data = new Date(conta.sincronizado_em);
  if (Number.isNaN(data.getTime())) return "-";

  return (
    <span className="sync-cell">
      <span>{formatarData(conta.sincronizado_em)}</span>
      <span>
        {new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(data)}
      </span>
    </span>
  );
}

function jaHouveEnvioWhatsapp(conta: ContaReceber) {
  return (
    conta.whatsapp_status === "enviado" ||
    Boolean(conta.whatsapp_primeiro_envio_em) ||
    Number(conta.whatsapp_total_envios ?? 0) > 0
  );
}

function getWhatsappStatusLabel(conta: ContaReceber) {
  if (conta.whatsapp_status === "erro") return "Erro no envio";

  const totalEnvios = Number(conta.whatsapp_total_envios ?? 0);
  const totalReenvios = Number(conta.whatsapp_total_reenvios ?? 0);

  if (conta.whatsapp_status_exibicao) return conta.whatsapp_status_exibicao;
  if (totalEnvios === 1 && totalReenvios === 0) return "Enviado";
  if (totalReenvios > 0) return `Reenviado ${totalReenvios}`;
  if (jaHouveEnvioWhatsapp(conta)) return "Enviado";

  return "Não enviado";
}

function getWhatsappStatusClass(conta: ContaReceber) {
  if (conta.whatsapp_status === "erro") return "whatsapp-status whatsapp-status-erro";
  if (
    Number(conta.whatsapp_total_reenvios ?? 0) > 0 ||
    String(conta.whatsapp_status_exibicao ?? "").toLowerCase().startsWith("reenviado")
  ) {
    return "whatsapp-status whatsapp-status-reenviado";
  }
  if (jaHouveEnvioWhatsapp(conta)) return "whatsapp-status whatsapp-status-enviado";

  return "whatsapp-status";
}

function renderAcoesTabela(
  conta: ContaReceber,
  abrirRevisao: (conta: ContaReceber, tipoEnvio: "envio" | "reenvio") => void,
  abrirProgramacao: (conta: ContaReceber) => void,
) {
  const semTelefone = valorVazio(conta.cliente_telefone);
  const jaHouveEnvio = jaHouveEnvioWhatsapp(conta);
  const title = semTelefone
    ? "Informar telefone antes de enviar"
    : "Enviar mensagem WhatsApp.";

  return (
    <div className="actions-stack" title={title}>
      <div className="actions-cell">
        <button
          type="button"
          className="table-icon-button"
          disabled={jaHouveEnvio}
          aria-label="Enviar WhatsApp"
        title={jaHouveEnvio ? "Mensagem já enviada. Use Reenviar." : "Enviar WhatsApp"}
        onClick={(event) => {
          event.stopPropagation();
          abrirRevisao(conta, "envio");
        }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 12.5 20 5l-4.5 14-4-6-6 4 3.5-5.5L4 12.5Z" />
          </svg>
        </button>
        <button
          type="button"
          className="table-icon-button"
          disabled={!jaHouveEnvio}
          aria-label="Reenviar WhatsApp"
        title={jaHouveEnvio ? "Reenviar WhatsApp" : "Faça o primeiro envio antes de reenviar."}
        onClick={(event) => {
          event.stopPropagation();
          abrirRevisao(conta, "reenvio");
        }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M17.5 7.5A7 7 0 1 0 19 12h-2.1a4.9 4.9 0 1 1-1.05-3.04L13 11.8h7V4.9l-2.5 2.6Z" />
          </svg>
        </button>
        <button
          type="button"
          className="table-icon-button"
          aria-label="Programar Mensagem"
          title="Programar Mensagem"
          onClick={(event) => {
            event.stopPropagation();
            abrirProgramacao(conta);
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 3v3" />
            <path d="M17 3v3" />
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M4 10h16" />
            <path d="M12 14v4" />
            <path d="M10 16h4" />
          </svg>
        </button>
      </div>
      <span className={getWhatsappStatusClass(conta)}>{getWhatsappStatusLabel(conta)}</span>
    </div>
  );
}

function criarColunasTabela(
  abrirRevisao: (conta: ContaReceber, tipoEnvio: "envio" | "reenvio") => void,
  abrirProgramacao: (conta: ContaReceber) => void,
  agendamentos: AgendamentosPorConta,
) {
  return [
  {
    titulo: "Documento",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "documento"),
  },
  {
    titulo: "Cliente",
    render: (conta: ContaReceber) => formatarClienteTabela(conta),
  },
  {
    titulo: "Telefone",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "cliente_telefone"),
  },
  {
    titulo: "Histórico",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "historico"),
  },
  {
    titulo: "Emissão",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "dt_emissao"),
  },
  {
    titulo: "Vencimento",
    render: (conta: ContaReceber) => (
      <span className="vencimento-cell">
        <span>{formatarValorCampo(conta, "dt_vencto")}</span>
        <span className={getStatusClass(conta)}>{getStatusLabel(conta)}</span>
      </span>
    ),
  },
  {
    titulo: "Valor",
    render: (conta: ContaReceber) => (
      <div>{formatarValorCampo(conta, "vlr_ctarec")}{deveMostrarValorAtual(conta) && <div className="receivable-current-value"><span>Valor Atual</span><strong>{formatarMoeda(calcularValorAtual(conta))}</strong></div>}</div>
    ),
  },
  {
    titulo: "Data baixa",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "dt_baixa"),
  },
  {
    titulo: "Hora baixa",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "hr_baixa"),
  },
  {
    titulo: "Valor recebido",
    render: (conta: ContaReceber) => formatarValorCampo(conta, "vlr_receb"),
  },
  {
    titulo: "Vendedor",
    render: (conta: ContaReceber) => formatarVendedorTabela(conta),
  },
  {
    titulo: "Agendamento",
    render: (conta: ContaReceber) => renderAgendamentoConta(agendamentos[String(conta.id_ctarec)]),
  },
  {
    titulo: "Ações",
    render: (conta: ContaReceber) => renderAcoesTabela(conta, abrirRevisao, abrirProgramacao),
  },
  {
    titulo: "Sincronizado em",
    render: (conta: ContaReceber) => formatarSincronizadoTabela(conta),
  },
  ];
}

export function ContasAReceber() {
  const { usuario } = useAuth();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [agendamentos, setAgendamentos] = useState<AgendamentosPorConta>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [vencimentoDe, setVencimentoDe] = useState(getPrimeiroDiaMesAtual);
  const [vencimentoAte, setVencimentoAte] = useState(getUltimoDiaMesAtual);
  const [tipoConta, setTipoConta] = useState<TipoConta>("Todos");
  const [outroFiltro, setOutroFiltro] = useState<OutroFiltro>("Vencidas e vencendo hoje");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [resumo, setResumo] = useState<ResumoContas>({ contasListadas: 0, valorTotal: 0, qtdVencidas: 0, valorVencido: 0, qtdAVencer: 0, valorAVencer: 0 });
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [contaProgramacao, setContaProgramacao] = useState<ContaReceber | null>(null);
  const [revisaoWhatsapp, setRevisaoWhatsapp] = useState<RevisaoWhatsapp | null>(null);
  const [feedbackWhatsapp, setFeedbackWhatsapp] = useState<string | null>(null);

  const carregarAgendamentos = useCallback(async (contasCarregadas: ContaReceber[]) => {
    if (!usuario?.id_empresa) {
      setAgendamentos({});
      return;
    }

    const ids = contasCarregadas.map((conta) => String(conta.id_ctarec));
    if (ids.length === 0) {
      setAgendamentos({});
      return;
    }

    const { data, error } = await supabase
      .from("tb_msg_programadas")
      .select("id_origem, status, executar_em")
      .eq("id_empresa", usuario.id_empresa)
      .eq("origem_modulo", "CONTA_RECEBER")
      .eq("ativo", true)
      .in("id_origem", ids);

    if (error) throw error;
    setAgendamentos(montarMapaAgendamentos((data ?? []) as MensagemProgramadaConta[]));
  }, [usuario?.id_empresa]);

  const carregarContas = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    if (!usuario?.id_empresa) {
      setContas([]);
      setAgendamentos({});
      setCarregando(false);
      return;
    }

    const { data, error } = await supabase.rpc("fn_contas_receber_consulta", {
      p_id_empresa: usuario.id_empresa,
      p_busca: busca.trim() || null,
      p_vencimento_de: vencimentoDe || null,
      p_vencimento_ate: vencimentoAte || null,
      p_tipo_conta: tipoConta === "Todos" ? null : tipoConta,
      p_status: outroFiltro,
      p_pagina: paginaAtual,
      p_tamanho_pagina: 50,
    });

    if (error) {
      setContas([]);
      setAgendamentos({});
      setTotalRegistros(0);
      setErro(error.message);
    } else {
      const resposta = (data ?? {}) as { items?: ContaReceber[]; total?: number; resumo?: ResumoContas };
      const contasCarregadas = resposta.items ?? [];
      setContas(contasCarregadas);
      setTotalRegistros(Number(resposta.total ?? 0));
      setResumo(resposta.resumo ?? { contasListadas: 0, valorTotal: 0, qtdVencidas: 0, valorVencido: 0, qtdAVencer: 0, valorAVencer: 0 });
      try {
        await carregarAgendamentos(contasCarregadas);
      } catch (errorAgendamento) {
        setAgendamentos({});
        setErro(errorAgendamento instanceof Error ? errorAgendamento.message : "Erro ao carregar agendamentos.");
      }
    }

    setCarregando(false);
  }, [busca, carregarAgendamentos, outroFiltro, paginaAtual, tipoConta, usuario?.id_empresa, vencimentoAte, vencimentoDe]);

  useEffect(() => {
    void carregarContas();
  }, [carregarContas]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, outroFiltro, tipoConta, vencimentoAte, vencimentoDe]);

  const contasFiltradas = contas;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / 50));

  function abrirDetalhes(conta: ContaReceber) {
    setContaSelecionada(conta);
  }

  function fecharDetalhes() {
    setContaSelecionada(null);
  }

  function abrirModalProgramarMensagemContaReceber(conta: ContaReceber) {
    setFeedbackWhatsapp(null);
    setContaProgramacao(conta);
  }

  function fecharModalProgramarMensagemContaReceber() {
    setContaProgramacao(null);
  }

  function salvarMensagemProgramadaContaReceber(mensagem: string) {
    setContaProgramacao(null);
    setFeedbackWhatsapp(mensagem);
    void carregarAgendamentos(contas).catch((error) => {
      setErro(error instanceof Error ? error.message : "Erro ao atualizar agendamentos.");
    });
  }

  async function abrirRevisaoWhatsapp(conta: ContaReceber, tipoEnvio: "envio" | "reenvio") {
    if (tipoEnvio === "reenvio" && !jaHouveEnvioWhatsapp(conta)) {
      setFeedbackWhatsapp("Essa conta ainda não teve o primeiro envio. Use Enviar WhatsApp.");
      return;
    }

    if (tipoEnvio === "envio" && jaHouveEnvioWhatsapp(conta)) {
      setFeedbackWhatsapp("Mensagem já enviada. Use Reenviar.");
      return;
    }

    setFeedbackWhatsapp(null);
    setRevisaoWhatsapp({
      conta,
      tipoEnvio,
      telefone: conta.cliente_telefone ?? "",
      mensagem: montarMensagemCobrancaWhatsapp(conta),
      erro: null,
      enviando: false,
      modelos: [],
      modeloSelecionado: "",
      carregandoModelos: true,
    });

    const categoria = getCategoriaModeloConta(conta);
    if (!categoria || !usuario?.id_empresa) {
      setRevisaoWhatsapp((atual) => atual ? { ...atual, carregandoModelos: false } : atual);
      return;
    }

    try {
      const modelos = await buscarModelosMensagem(usuario.id_empresa, categoria);
      setRevisaoWhatsapp((atual) => atual?.conta.id_ctarec === conta.id_ctarec
        ? { ...atual, modelos, carregandoModelos: false }
        : atual);
    } catch (error) {
      setRevisaoWhatsapp((atual) => atual?.conta.id_ctarec === conta.id_ctarec
        ? { ...atual, carregandoModelos: false, erro: error instanceof Error ? error.message : "Não foi possível carregar os modelos." }
        : atual);
    }
  }

  function selecionarModeloWhatsapp(idModelo: string) {
    if (!revisaoWhatsapp) return;
    const modelo = revisaoWhatsapp.modelos.find((item) => item.id === idModelo);
    const mensagem = modelo
      ? aplicarVariaveisModelo(prepararCorpoModeloContaReceber(revisaoWhatsapp.conta, modelo.corpo), montarVariaveisContaReceber(revisaoWhatsapp.conta, {
          nome: usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social,
        }))
      : revisaoWhatsapp.mensagem;
    setRevisaoWhatsapp({ ...revisaoWhatsapp, modeloSelecionado: idModelo, mensagem, erro: null });
  }

  function fecharRevisaoWhatsapp() {
    setRevisaoWhatsapp(null);
  }

  async function confirmarEnvioWhatsapp() {
    if (!revisaoWhatsapp) return;

    const telefoneEnvio = revisaoWhatsapp.telefone.trim();

    if (valorVazio(telefoneEnvio)) {
      setRevisaoWhatsapp({ ...revisaoWhatsapp, erro: "Cliente sem telefone cadastrado." });
      return;
    }

    if (!revisaoWhatsapp.mensagem.trim()) {
      setRevisaoWhatsapp({ ...revisaoWhatsapp, erro: "Mensagem não pode estar vazia." });
      return;
    }

    setRevisaoWhatsapp({ ...revisaoWhatsapp, erro: null, enviando: true });

    const { data, error } = await supabase.functions.invoke("btzap-send-message", {
      body: {
        empresa_id: usuario?.id_empresa,
        id_ctarec: revisaoWhatsapp.conta.id_ctarec,
        tipo_envio: "cobranca",
        operacao_envio: revisaoWhatsapp.tipoEnvio,
        cliente_id: revisaoWhatsapp.conta.id_cliente,
        telefone: telefoneEnvio,
        mensagem: revisaoWhatsapp.mensagem,
        origem: "contas_a_receber",
        referencia_id: revisaoWhatsapp.conta.id_ctarec,
      },
    });

    if (error) {
      const detalhe = await detalharErroEdgeFunction(error);
      console.error("Erro invoke btzap-send-message:", error, detalhe);
      setRevisaoWhatsapp({
        ...revisaoWhatsapp,
        enviando: false,
        erro: `Erro na Edge Function btzap-send-message: ${detalhe}. Verifique o deploy e os logs da função se o problema continuar.`,
      });
      return;
    }

    if (data?.success === false) {
      setRevisaoWhatsapp({
        ...revisaoWhatsapp,
        enviando: false,
        erro: montarMensagemErroWhatsapp(data),
      });
      return;
    }

    setRevisaoWhatsapp(null);
    setFeedbackWhatsapp(data?.message ?? "Mensagem enviada com sucesso.");
    await carregarContas();
  }

  const colunasTabela = criarColunasTabela(
    abrirRevisaoWhatsapp,
    abrirModalProgramarMensagemContaReceber,
    agendamentos,
  );

  const cards: ResumoCardProps[] = [
    {
      titulo: "Contas listadas",
      valor: String(resumo.contasListadas),
      subtitulo: "Total filtrado",
      icone: "lista",
      cor: "azul",
    },
    {
      titulo: "Valor total",
      valor: formatarMoeda(resumo.valorTotal),
      subtitulo: "Soma das contas listadas",
      icone: "valor",
      cor: "verde",
    },
    {
      titulo: "Qtd. vencidas",
      valor: String(resumo.qtdVencidas),
      subtitulo: "Contas em atraso",
      icone: "alerta",
      cor: "vermelho",
    },
    {
      titulo: "Valor vencido",
      valor: formatarMoeda(resumo.valorVencido),
      subtitulo: "Total em atraso",
      icone: "valor-alerta",
      cor: "laranja",
    },
    {
      titulo: "Qtd. a vencer",
      valor: String(resumo.qtdAVencer),
      subtitulo: "Contas futuras",
      icone: "calendario",
      cor: "azul",
    },
    {
      titulo: "Valor a vencer",
      valor: formatarMoeda(resumo.valorAVencer),
      subtitulo: "Total futuro",
      icone: "valor-futuro",
      cor: "ciano",
    },
  ];

  return (
    <main className="page-shell">
      <GlobalPageHeader title="Contas a Receber" subtitle="Gerencie e acompanhe suas contas a receber sincronizadas do Clipp." icon="receipt" actions={
        <button className="primary-button" type="button" onClick={carregarContas} disabled={carregando}>Atualizar tela</button>
      } />

      <section className="summary-grid" aria-label="Resumo de contas a receber">
        {cards.map((card) => (
          <ResumoCard key={card.titulo} {...card} />
        ))}
      </section>

      <section className="filters-panel" aria-label="Filtros">
        <label>
          <span>Busca</span>
          <input
            type="search"
            placeholder="Buscar por cliente, documento, telefone ou vencimento..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </label>

        <label>
          <span>Vencimento de</span>
          <input type="date" value={vencimentoDe} onChange={(event) => setVencimentoDe(event.target.value)} />
        </label>

        <label>
          <span>Vencimento até</span>
          <input type="date" value={vencimentoAte} onChange={(event) => setVencimentoAte(event.target.value)} />
        </label>

        <label>
          <span>Tipo da conta</span>
          <select value={tipoConta} onChange={(event) => setTipoConta(event.target.value as TipoConta)}>
            <option value="Todos">Todos</option>
            <option value="N">N</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
          </select>
        </label>

        <label>
          <span>Vencimento</span>
          <select value={outroFiltro} onChange={(event) => setOutroFiltro(event.target.value as OutroFiltro)}>
            <option value="Vencidas e vencendo hoje">Vencidas e vencendo hoje</option>
            <option value="Todos">Todos</option>
            <option value="Vencendo hoje">Vencendo hoje</option>
            <option value="A vencer">A vencer</option>
            <option value="Em carência">Em carência</option>
            <option value="Vencidas">Vencidas</option>
            <option value="Recebidas">Recebidas</option>
          </select>
        </label>
      </section>

      {feedbackWhatsapp && <div className="feedback-box feedback-success">{feedbackWhatsapp}</div>}

      <section className="results-section">
        <div className="section-title">
          <h2>Resultados</h2>
          <span>{totalRegistros} registro(s)</span>
        </div>

        {carregando && <div className="state-box">Carregando contas a receber...</div>}

        {!carregando && erro && (
          <div className="state-box state-box-error">Erro ao carregar contas a receber.</div>
        )}

        {!carregando && !erro && contasFiltradas.length === 0 && (
          <div className="state-box">Nenhuma conta encontrada.</div>
        )}

        {!carregando && !erro && contasFiltradas.length > 0 && (
          <>
          <div className="receivables-desktop-list" data-columns={colunasTabela.length}>
            <div className="receivables-list-heading" aria-hidden="true">
              <span>Conta e cliente</span>
              <span>Financeiro</span>
              <span>Recebimento</span>
              <span>Responsavel</span>
              <span>Agendamento</span>
              <span>Acoes</span>
              <span>Sincronizado</span>
            </div>
            {contasFiltradas.map((conta) => (
              <article
                key={conta.id_ctarec}
                className={`receivable-row-card status-row-${getStatusConta(conta)}`}
                onClick={() => abrirDetalhes(conta)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") abrirDetalhes(conta);
                }}
                tabIndex={0}
              >
                <div className="receivable-account-cell">
                  <span className="receivable-document">Documento {formatarValorCampo(conta, "documento")}</span>
                  <div className="receivable-account-title">
                    <strong>{valorVazio(conta.cliente_nome) ? "Cliente nao encontrado" : conta.cliente_nome}</strong>
                    <span className={getStatusClass(conta)}>{getStatusLabel(conta)}</span>
                  </div>
                  <span>{formatarValorCampo(conta, "cliente_telefone")}</span>
                  <small>{formatarValorCampo(conta, "historico")}</small>
                </div>

                <div className="receivable-financial-cell">
                  <dl>
                    <div><dt>Emissao</dt><dd>{formatarValorCampo(conta, "dt_emissao")}</dd></div>
                    <div><dt>Vencimento</dt><dd>{formatarValorCampo(conta, "dt_vencto")}</dd></div>
                  </dl>
                  <div className="receivable-amount">
                    <span>Valor</span>
                    <strong>{formatarValorCampo(conta, "vlr_ctarec")}</strong>
                    {deveMostrarValorAtual(conta) && <div className="receivable-current-value"><span>Valor Atual</span><strong>{formatarMoeda(calcularValorAtual(conta))}</strong></div>}
                  </div>
                </div>

                <div className="receivable-payment-cell">
                  <dl>
                    <div><dt>Data da baixa</dt><dd>{formatarValorCampo(conta, "dt_baixa")}</dd></div>
                    <div><dt>Hora</dt><dd>{formatarValorCampo(conta, "hr_baixa")}</dd></div>
                    <div><dt>Valor recebido</dt><dd>{formatarValorCampo(conta, "vlr_receb")}</dd></div>
                  </dl>
                </div>

                <div className="receivable-owner-cell">
                  {formatarVendedorTabela(conta)}
                </div>

                <div className="receivable-schedule-cell">
                  {renderAgendamentoConta(agendamentos[String(conta.id_ctarec)])}
                </div>

                <div className="receivable-actions-cell" onClick={(event) => event.stopPropagation()}>
                  {renderAcoesTabela(conta, abrirRevisaoWhatsapp, abrirModalProgramarMensagemContaReceber)}
                </div>

                <div className="receivable-sync-cell">
                  {formatarSincronizadoTabela(conta)}
                </div>
              </article>
            ))}
          </div>
          <div className="receivables-mobile-list" aria-label="Contas a receber">
            {contasFiltradas.map((conta) => (
              <article
                className={`receivable-mobile-card status-row-${getStatusConta(conta)}`}
                key={conta.id_ctarec}
                onClick={() => abrirDetalhes(conta)}
              >
                <div className="receivable-mobile-header">
                  <div>
                    <strong>{valorVazio(conta.cliente_nome) ? "Cliente nao encontrado" : conta.cliente_nome}</strong>
                    <span>Documento {formatarValorCampo(conta, "documento")}</span>
                  </div>
                  <span className={getStatusClass(conta)}>{getStatusLabel(conta)}</span>
                </div>
                <dl className="receivable-mobile-details">
                  <div><dt>Valor</dt><dd>{formatarValorCampo(conta, "vlr_ctarec")}</dd></div>
                  {deveMostrarValorAtual(conta) && <div><dt>Valor Atual</dt><dd>{formatarMoeda(calcularValorAtual(conta))}</dd></div>}
                  <div><dt>Vencimento</dt><dd>{formatarValorCampo(conta, "dt_vencto")}</dd></div>
                  <div><dt>Telefone</dt><dd>{formatarValorCampo(conta, "cliente_telefone")}</dd></div>
                  <div><dt>Tipo</dt><dd>{formatarValorCampo(conta, "tip_ctarec")}</dd></div>
                  <div className="receivable-mobile-schedule">
                    <dt>Agendamento</dt>
                    <dd>{renderAgendamentoConta(agendamentos[String(conta.id_ctarec)])}</dd>
                  </div>
                </dl>
                <div className="receivable-mobile-actions" onClick={(event) => event.stopPropagation()}>
                  {renderAcoesTabela(conta, abrirRevisaoWhatsapp, abrirModalProgramarMensagemContaReceber)}
                </div>
              </article>
            ))}
          </div>
          <nav className="receivables-pagination" aria-label="Paginação de contas a receber">
            <button className="secondary-button" type="button" onClick={() => setPaginaAtual((pagina) => Math.max(1, pagina - 1))} disabled={paginaAtual <= 1 || carregando}>Anterior</button>
            <span>Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong></span>
            <button className="secondary-button" type="button" onClick={() => setPaginaAtual((pagina) => Math.min(totalPaginas, pagina + 1))} disabled={paginaAtual >= totalPaginas || carregando}>Próxima</button>
          </nav>
          </>
        )}
      </section>

      {contaSelecionada && (
        <div className="modal-backdrop" role="presentation" onClick={fecharDetalhes}>
          <aside
            className="details-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detalhes-conta-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="details-header">
              <div>
                <h2 id="detalhes-conta-titulo">Detalhes da conta</h2>
                <p>Registro somente leitura</p>
              </div>
              <button className="secondary-button" type="button" onClick={fecharDetalhes}>
                Fechar
              </button>
            </div>

            <section className="details-section">
              <h3>Dados do Cliente</h3>
              <dl className="details-grid">
                {camposClienteDetalhes.map(([rotulo, campo]) => (
                  <div key={campo}>
                    <dt>{rotulo}</dt>
                    <dd>{formatarValorCampo(contaSelecionada, campo)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="details-section">
              <h3>Dados do Vendedor</h3>
              <dl className="details-grid">
                {camposVendedorDetalhes.map(([rotulo, campo]) => (
                  <div key={campo}>
                    <dt>{rotulo}</dt>
                    <dd>{formatarValorCampo(contaSelecionada, campo)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="details-section">
              <h3>Dados de Recebimento</h3>
              <dl className="details-grid">
                {camposRecebimentoDetalhes.map(([rotulo, campo]) => (
                  <div key={campo}>
                    <dt>{rotulo}</dt>
                    <dd>{formatarValorCampo(contaSelecionada, campo)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="details-section">
              <h3>Dados da Conta a Receber</h3>
              <dl className="details-grid">
                {camposContaDetalhes.map((campo) => (
                  <div key={campo}>
                    <dt>{campo}</dt>
                    <dd>{formatarValorCampo(contaSelecionada, campo)}</dd>
                  </div>
                ))}
                <div><dt>Perc. multa</dt><dd>{formatarPercentualParametro(contaSelecionada.perc_multa)}</dd></div>
                <div><dt>Tipo juros</dt><dd>{formatarTipoJuros(contaSelecionada.tipo_juros)}</dd></div>
                <div><dt>Perc. juros</dt><dd>{formatarPercentualParametro(contaSelecionada.perc_juros)}</dd></div>
                <div><dt>Dias carência</dt><dd>{getDiasCarencia(contaSelecionada)}</dd></div>
                {deveMostrarValorAtual(contaSelecionada) && <div><dt>Valor atual</dt><dd>{formatarMoeda(calcularValorAtual(contaSelecionada))}</dd></div>}
              </dl>
            </section>
          </aside>
        </div>
      )}

      {contaProgramacao && (
        <ProgramarMensagemContaReceberModal
          conta={contaProgramacao}
          onClose={fecharModalProgramarMensagemContaReceber}
          onSaved={salvarMensagemProgramadaContaReceber}
        />
      )}

      {revisaoWhatsapp && (
        <div className="whatsapp-review-backdrop" role="presentation" onClick={fecharRevisaoWhatsapp}>
          <section
            className="whatsapp-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revisao-whatsapp-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="whatsapp-review-shell">
              <header className="whatsapp-review-header">
                <div className="whatsapp-review-title">
                  <span className="whatsapp-review-title-icon">
                    <WhatsappReviewIcon tipo="message" />
                  </span>
                  <div>
                    <h2 id="revisao-whatsapp-titulo">Revisar mensagem WhatsApp</h2>
                    <p>Confirme os dados antes do envio para o cliente</p>
                  </div>
                </div>
                <button
                  className="whatsapp-review-close"
                  type="button"
                  onClick={fecharRevisaoWhatsapp}
                  disabled={revisaoWhatsapp.enviando}
                  aria-label="Fechar"
                >
                  <WhatsappReviewIcon tipo="close" />
                </button>
              </header>

              <div className="whatsapp-review-content">
                <label className="whatsapp-review-message-card">
                  <span>Modelo de cobrança</span>
                  <select
                    value={revisaoWhatsapp.modeloSelecionado}
                    onChange={(event) => selecionarModeloWhatsapp(event.target.value)}
                    disabled={revisaoWhatsapp.enviando || revisaoWhatsapp.carregandoModelos}
                  >
                    <option value="">{revisaoWhatsapp.carregandoModelos ? "Carregando modelos..." : "Mensagem padrão atual"}</option>
                    {revisaoWhatsapp.modelos.map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nome}</option>)}
                  </select>
                  <small>A mensagem preenchida pelo modelo continua editável antes do envio.</small>
                </label>
                <div className="whatsapp-review-grid">
                  <WhatsappReviewInfoCard icon="user" label="Cliente" value={revisaoWhatsapp.conta.cliente_nome ?? "-"} />

                  <div className="whatsapp-review-info-card whatsapp-review-phone-card">
                    <div>
                      <span className="whatsapp-review-info-icon">
                        <WhatsappReviewIcon tipo="phone" />
                      </span>
                      <span>Telefone</span>
                    </div>
                    <input
                      value={revisaoWhatsapp.telefone}
                      onChange={(event) =>
                        setRevisaoWhatsapp({
                          ...revisaoWhatsapp,
                          telefone: event.target.value,
                          erro: null,
                        })
                      }
                      disabled={revisaoWhatsapp.enviando}
                      placeholder="Informe o telefone"
                    />
                  </div>

                  <WhatsappReviewInfoCard icon="file" label="Documento" value={revisaoWhatsapp.conta.documento ?? "-"} />
                  <WhatsappReviewInfoCard icon="money" label="Valor" value={formatarMoeda(revisaoWhatsapp.conta.vlr_ctarec)} />
                  <WhatsappReviewInfoCard icon="calendar" label="Vencimento" value={formatarData(revisaoWhatsapp.conta.dt_vencto)} />
                </div>

                <label className="whatsapp-review-message-card">
                  <span>
                    <span className="whatsapp-review-info-icon">
                      <WhatsappReviewIcon tipo="message" />
                    </span>
                    Mensagem editável
                  </span>
                  <textarea
                    value={revisaoWhatsapp.mensagem}
                    onChange={(event) =>
                      setRevisaoWhatsapp({
                        ...revisaoWhatsapp,
                        mensagem: event.target.value,
                        erro: null,
                      })
                    }
                    disabled={revisaoWhatsapp.enviando}
                  />
                </label>

                {revisaoWhatsapp.erro && <div className="feedback-box feedback-error">{revisaoWhatsapp.erro}</div>}
              </div>

              <footer className="whatsapp-review-footer">
                <button
                  className="whatsapp-review-secondary"
                  type="button"
                  onClick={fecharRevisaoWhatsapp}
                  disabled={revisaoWhatsapp.enviando}
                >
                  <WhatsappReviewIcon tipo="close" />
                  Cancelar
                </button>
                <button
                  className="whatsapp-review-primary"
                  type="button"
                  onClick={confirmarEnvioWhatsapp}
                  disabled={revisaoWhatsapp.enviando}
                >
                  <WhatsappReviewIcon tipo="send" />
                  {revisaoWhatsapp.enviando ? "Enviando..." : "Confirmar envio"}
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
