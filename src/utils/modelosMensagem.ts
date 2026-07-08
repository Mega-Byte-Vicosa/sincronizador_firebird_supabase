import { supabase } from "../lib/supabaseClient";
import type { ContaReceber } from "../types/contasReceber";
import type { CategoriaModeloMensagem, ModeloMensagem } from "../types/modeloMensagem";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const origemModeloCobranca = "cobranca";
const origemModeloGeral = "geral";

function dataISO(valor: string | null | undefined) {
  const match = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dataLocal(valor: string) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(data);
}

function hojeISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

function diasCarencia(conta: ContaReceber) {
  const valor = Number(conta.dias_carencia ?? 0);
  return Number.isFinite(valor) && valor >= 0 ? Math.trunc(valor) : 0;
}

function fimCarencia(conta: ContaReceber) {
  const vencimento = dataISO(conta.dt_vencto);
  if (!vencimento) return null;
  const data = dataLocal(vencimento);
  data.setDate(data.getDate() + diasCarencia(conta));
  return data;
}

export function getCategoriaModeloConta(conta: ContaReceber): CategoriaModeloMensagem | null {
  if (conta.dt_baixa || Number(conta.vlr_receb ?? 0) > 0) return null;
  const vencimento = dataISO(conta.dt_vencto);
  if (!vencimento || vencimento >= hojeISO()) return "contas_receber_a_vencer";
  const limite = fimCarencia(conta);
  const limiteISO = limite
    ? `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`
    : vencimento;
  return hojeISO() <= limiteISO ? "contas_receber_carencia" : "contas_receber_vencida";
}

export function calcularValorAtualContaReceber(conta: ContaReceber) {
  const original = Number(conta.vlr_ctarec ?? 0);
  if (getCategoriaModeloConta(conta) !== "contas_receber_vencida") return original;
  const vencimento = dataISO(conta.dt_vencto);
  if (!vencimento) return original;
  const dias = Math.max(0, Math.floor((dataLocal(hojeISO()).getTime() - dataLocal(vencimento).getTime()) / 86400000));
  const multa = original * (Number(conta.perc_multa ?? 0) / 100);
  const taxa = Number(conta.perc_juros ?? 0) / 100;
  const juros = String(conta.tipo_juros ?? "S").trim().toUpperCase() === "C"
    ? original * (Math.pow(1 + taxa, dias) - 1)
    : original * taxa * dias;
  // A carência impede cobrança enquanto estiver vigente. Caso a conta ultrapasse a carência,
  // multa e juros são calculados considerando a data original de vencimento.
  return original + multa + juros;
}

export function prepararCorpoModeloContaReceber(conta: ContaReceber, corpo: string) {
  if (getCategoriaModeloConta(conta) !== "contas_receber_vencida") return corpo;

  return corpo
    .split(/\r?\n/)
    .filter((linha) => !linha.includes("{{valor_original}}"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function aplicarVariaveisModelo(texto: string, variaveis: Record<string, string>) {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => variaveis[chave] ?? "");
}

export function montarVariaveisContaReceber(
  conta: ContaReceber,
  empresa?: { nome?: string | null; telefone?: string | null },
) {
  const vencimento = dataISO(conta.dt_vencto);
  const limite = fimCarencia(conta);
  const valorAtual = calcularValorAtualContaReceber(conta);
  const diasAtraso = vencimento
    ? String(Math.max(0, Math.floor((dataLocal(hojeISO()).getTime() - dataLocal(vencimento).getTime()) / 86400000)))
    : "0";
  const cliente = conta.cliente_nome || "cliente";
  const documento = conta.documento || String(conta.id_ctarec);
  const dataVencimento = vencimento ? formatarData(dataLocal(vencimento)) : "";
  const valorFormatado = moeda.format(valorAtual);
  const empresaNome = empresa?.nome || "Nossa empresa";

  return {
    nome: cliente,
    cliente,
    cliente_nome: cliente,
    empresa: empresaNome,
    empresa_nome: empresaNome,
    documento,
    numero_documento: documento,
    data_vencimento: dataVencimento,
    vencimento: dataVencimento,
    data_final_carencia: limite ? formatarData(limite) : "",
    dias_carencia: String(diasCarencia(conta)),
    dias_atraso: diasAtraso,
    valor_original: moeda.format(Number(conta.vlr_ctarec ?? 0)),
    valor: valorFormatado,
    valor_atual: valorFormatado,
    data_envio: formatarData(new Date()),
    link_pagamento: "",
    telefone_empresa: empresa?.telefone || "",
  };
}

function normalizarTituloModelo(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function getChaveModeloMensagem(modelo: ModeloMensagem) {
  return modelo.chave || `${modelo.origem_modelo || origemModeloCobranca}:${modelo.id}`;
}

export function selecionarModeloPadraoContaReceber(conta: ContaReceber, modelos: ModeloMensagem[]) {
  const categoria = getCategoriaModeloConta(conta);
  const contem = (modelo: ModeloMensagem, termos: string[]) => {
    const titulo = normalizarTituloModelo(modelo.nome);
    return termos.some((termo) => titulo.includes(termo));
  };

  if (categoria === "contas_receber_carencia") {
    return modelos.find((modelo) => contem(modelo, ["carencia"])) ?? null;
  }

  if (categoria === "contas_receber_a_vencer") {
    return modelos.find((modelo) => contem(modelo, ["a vencer"])) ?? null;
  }

  if (categoria === "contas_receber_vencida") {
    return modelos.find((modelo) => contem(modelo, ["vencida", "vencido"])) ?? null;
  }

  return null;
}

export function montarMensagemModeloContaReceber(
  conta: ContaReceber,
  modelo: ModeloMensagem,
  empresa?: { nome?: string | null; telefone?: string | null },
) {
  return aplicarVariaveisModelo(
    prepararCorpoModeloContaReceber(conta, modelo.corpo),
    montarVariaveisContaReceber(conta, empresa),
  );
}

export async function buscarModelosMensagem(idEmpresa: string, categoria?: CategoriaModeloMensagem) {
  let consulta = supabase
    .from("tab_modelos_mensagem")
    .select("id, id_empresa, nome, categoria, canal, assunto, corpo, ativo, padrao")
    .eq("id_empresa", idEmpresa)
    .eq("ativo", true);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  const { data, error } = await consulta.order("padrao", { ascending: false }).order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((modelo) => ({
    ...modelo,
    origem_modelo: origemModeloCobranca,
    chave: `${origemModeloCobranca}:${modelo.id}`,
  })) as ModeloMensagem[];
}

export async function buscarTodosModelosMensagemAtivos(idEmpresa: string) {
  const [modelosGerais, modelosCobranca] = await Promise.all([
    supabase
      .from("tab_modelos_msg")
      .select("id, id_empresa, modelo_msg_titulo, modelo_msg, ativo, modelo_global, criado_em, atualizado_em")
      .eq("ativo", true)
      .or(`modelo_global.eq.true,id_empresa.eq.${idEmpresa}`)
      .order("modelo_global", { ascending: false })
      .order("modelo_msg_titulo", { ascending: true }),
    buscarModelosMensagem(idEmpresa),
  ]);

  if (modelosGerais.error) throw modelosGerais.error;

  const gerais = (modelosGerais.data ?? []).map((modelo) => ({
    id: modelo.id,
    id_empresa: modelo.id_empresa,
    nome: modelo.modelo_msg_titulo,
    categoria: modelo.modelo_global ? "global" : "empresa",
    canal: "whatsapp",
    assunto: null,
    corpo: modelo.modelo_msg,
    ativo: modelo.ativo,
    padrao: false,
    criado_em: modelo.criado_em,
    atualizado_em: modelo.atualizado_em,
    origem_modelo: origemModeloGeral,
    chave: `${origemModeloGeral}:${modelo.id}`,
    modelo_global: modelo.modelo_global,
  })) as ModeloMensagem[];

  return [...modelosCobranca, ...gerais];
}
