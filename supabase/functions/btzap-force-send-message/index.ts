import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendBtzapMediaMessage, sendBtzapMessage, validateBtzapConfig, type BtzapConfig } from "../_shared/btzapClient.ts";
import { extrairMensagemIdExterno } from "../_shared/btzapMessageStatus.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizarTipoEnvio } from "../_shared/whatsappSendGuard.ts";

type TipoForcado = "automacao_item" | "mensagem_programada";

interface ForceSendPayload {
  tipo: TipoForcado;
  id: string;
  id_empresa: string;
}

interface BtzapResult {
  success: boolean;
  message: string;
  retorno?: unknown;
  payload?: unknown;
  status?: number;
  detail?: string;
}

function normalizarTelefoneBrasil(valor: string | null | undefined) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

function tipoMidia(arquivoTipo?: unknown, arquivoUrl?: unknown): "image" | "video" | null {
  const tipo = String(arquivoTipo ?? "").toLowerCase();
  const url = String(arquivoUrl ?? "").split("?")[0].split("#")[0].toLowerCase();
  if (tipo.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(url)) return "image";
  if (tipo.startsWith("video/") || /\.mp4$/.test(url)) return "video";
  return null;
}

async function obterConfig(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string) {
  const { data, error } = await supabase
    .from("tab_btzap_config")
    .select("*")
    .eq("id_empresa", idEmpresa)
    .eq("ativo", true)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Configuração BTZap ativa não encontrada para esta empresa.");

  const config = data as BtzapConfig;
  const erro = validateBtzapConfig(config);
  if (erro) throw new Error(erro);

  return config;
}

async function enviarBtzap(
  config: BtzapConfig,
  telefone: string,
  mensagem: string,
  arquivoUrl?: unknown,
  arquivoTipo?: unknown,
): Promise<BtzapResult> {
  const url = String(arquivoUrl ?? "").trim();
  const tipo = tipoMidia(arquivoTipo, url);
  const result = url && tipo
    ? await sendBtzapMediaMessage(config, { phone: telefone, type: tipo, file: url, caption: mensagem })
    : await sendBtzapMessage(config, { phone: telefone, message: mensagem });

  return result as BtzapResult;
}

async function obterContaOrigem(supabase: ReturnType<typeof createSupabaseAdmin>, mensagem: Record<string, unknown>) {
  if (mensagem.origem_modulo !== "CONTA_RECEBER" || !mensagem.id_origem) {
    return { id_ctarec: null, documento: mensagem.documento_origem ?? null, cliente_id: null };
  }

  const idCtarec = Number(mensagem.id_origem);
  if (!Number.isFinite(idCtarec)) return { id_ctarec: null, documento: mensagem.documento_origem ?? null, cliente_id: null };

  const { data, error } = await supabase
    .from("firebird_contas_receber")
    .select("id_ctarec, documento, id_cliente")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_ctarec", idCtarec)
    .maybeSingle();

  if (error) throw error;
  return {
    id_ctarec: data?.id_ctarec ?? idCtarec,
    documento: data?.documento ?? mensagem.documento_origem ?? null,
    cliente_id: data?.id_cliente ?? null,
  };
}

async function obterMidiaCampanha(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string, idCampanha: unknown) {
  if (!idCampanha) return null;
  const { data, error } = await supabase
    .from("tab_campanha")
    .select("arquivo_url, arquivo_nome, arquivo_tipo")
    .eq("id_empresa", idEmpresa)
    .eq("id", String(idCampanha))
    .maybeSingle();
  if (error) throw error;
  return data as { arquivo_url?: string | null; arquivo_nome?: string | null; arquivo_tipo?: string | null } | null;
}

async function registrarHistorico(supabase: ReturnType<typeof createSupabaseAdmin>, payload: Record<string, unknown>, idExistente?: string | null) {
  const query = idExistente
    ? await supabase.from("tab_whatsapp_envios").update(payload).eq("id", idExistente).select("id").single()
    : await supabase.from("tab_whatsapp_envios").insert(payload).select("id").single();
  if (query.error) throw query.error;
  return query.data?.id as string;
}

async function forcarMensagemProgramada(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string, id: string) {
  const { data: mensagem, error } = await supabase
    .from("tb_msg_programadas")
    .select("*")
    .eq("id_empresa", idEmpresa)
    .eq("id_msg_programada", id)
    .maybeSingle();
  if (error) throw error;
  if (!mensagem) throw new Error("Mensagem programada não encontrada.");
  if (["ENVIADO", "ENVIADA", "CANCELADO", "CANCELADA"].includes(String(mensagem.status ?? "").toUpperCase())) {
    throw new Error("Esta mensagem não pode ser forçada porque já foi enviada ou cancelada.");
  }

  const telefone = normalizarTelefoneBrasil(mensagem.destinatario_telefone);
  const texto = String(mensagem.mensagem ?? "").trim();
  if (!telefone) throw new Error("Telefone do destinatário inválido ou não informado.");
  if (!texto) throw new Error("Mensagem vazia. Envio forçado cancelado.");

  const config = await obterConfig(supabase, idEmpresa);
  const midia = mensagem.origem_modulo === "CAMPANHA" ? await obterMidiaCampanha(supabase, idEmpresa, mensagem.id_origem) : null;
  const requestPayload = {
    phone: telefone,
    message: texto,
    arquivo_url: midia?.arquivo_url ?? null,
    arquivo_nome: midia?.arquivo_nome ?? null,
    arquivo_tipo: midia?.arquivo_tipo ?? null,
    envio_forcado: true,
  };

  const result = await enviarBtzap(config, telefone, texto, midia?.arquivo_url, midia?.arquivo_tipo);
  const agora = new Date().toISOString();
  const sucesso = result.success;
  const conta = await obterContaOrigem(supabase, mensagem);
  const mensagemId = sucesso ? extrairMensagemIdExterno(result.retorno) : null;
  const tipoEnvio = normalizarTipoEnvio(
    mensagem.tipo_envio || (mensagem.origem_modulo === "CONTA_RECEBER" ? "cobranca" : mensagem.origem_modulo === "CAMPANHA" ? "campanha_promocao" : "mensagem_programada"),
  );

  const historicoPayload = {
    id_empresa: idEmpresa,
    id_ctarec: conta.id_ctarec,
    cliente_id: conta.cliente_id == null ? null : String(conta.cliente_id),
    cliente_nome: mensagem.destinatario_nome || null,
    cliente_telefone: telefone,
    origem: mensagem.origem_modulo === "CAMPANHA" ? "Campanha de Promocao" : "Mensagem Programada",
    documento: conta.documento,
    mensagem: texto,
    status: sucesso ? "enviado" : "erro",
    tipo_envio: tipoEnvio,
    categoria_envio: tipoEnvio,
    operacao_envio: "envio_forcado",
    provider: "btzap",
    erro: sucesso ? "OK" : result.message,
    ultima_tentativa_em: agora,
    proxima_tentativa_em: null,
    processado_em: sucesso ? agora : null,
    enviado_em: sucesso ? agora : null,
    mensagem_id_externo: mensagemId,
    btzap_message_id: mensagemId,
    status_entrega: sucesso ? "ENVIADO_API" : "FALHOU",
    enviado_api_em: sucesso ? agora : null,
    falhou_em: sucesso ? null : agora,
    request_payload: requestPayload,
    response_payload: result.retorno ?? result,
    webhook_ultimo_evento: result.retorno ?? null,
    origem_envio: "MENSAGEM_PROGRAMADA",
    origem_modulo: mensagem.origem_modulo,
    id_msg_programada: mensagem.id_msg_programada,
    id_origem: mensagem.id_origem ? String(mensagem.id_origem) : null,
    modelo_id: mensagem.modelo_id ?? null,
    envio_forcado: true,
    envio_forcado_em: agora,
    envio_forcado_motivo: "Parâmetros de segurança ignorados por confirmação manual.",
  };

  const historicoId = await registrarHistorico(supabase, historicoPayload);

  const { error: updateError } = await supabase
    .from("tb_msg_programadas")
    .update({
      status: sucesso ? "ENVIADO" : "ERRO",
      enviado: sucesso,
      data_hora_envio: sucesso ? agora : null,
      erro_envio: sucesso ? "OK" : result.message,
      motivo_bloqueio: sucesso ? null : "erro_btzap",
      motivo_pendencia: null,
      proxima_tentativa_em: null,
      processando_em: null,
      historico_envio_id: historicoId,
      ultima_tentativa_em: agora,
      tentativa_atual: Number(mensagem.tentativa_atual ?? 0) + 1,
      tentativas_envio: Number(mensagem.tentativas_envio ?? 0) + 1,
    })
    .eq("id_empresa", idEmpresa)
    .eq("id_msg_programada", mensagem.id_msg_programada);
  if (updateError) throw updateError;

  return { success: sucesso, message: sucesso ? "Mensagem enviada com envio forçado." : result.message, historicoId };
}

async function recalcularTotaisAutomacao(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string, idCampanha: string) {
  const [enviados, erros] = await Promise.all([
    supabase.from("tab_automacao_execucao_itens").select("id", { count: "exact", head: true }).eq("id_empresa", idEmpresa).eq("id_campanha", idCampanha).eq("status", "enviado"),
    supabase.from("tab_automacao_execucao_itens").select("id", { count: "exact", head: true }).eq("id_empresa", idEmpresa).eq("id_campanha", idCampanha).eq("status", "erro"),
  ]);
  if (enviados.error) throw enviados.error;
  if (erros.error) throw erros.error;
  await supabase.from("tab_campanha").update({
    automacao_total_envios: enviados.count ?? 0,
    automacao_total_erros: erros.count ?? 0,
  }).eq("id_empresa", idEmpresa).eq("id", idCampanha);
}

async function forcarItemAutomacao(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string, id: string) {
  const { data: item, error } = await supabase
    .from("tab_automacao_execucao_itens")
    .select("*")
    .eq("id_empresa", idEmpresa)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error("Item de automação não encontrado.");
  if (item.status === "enviado") throw new Error("Este item de automação já foi enviado.");

  const { data: campanha, error: campanhaError } = await supabase
    .from("tab_campanha")
    .select("id, id_empresa, nome, tipo_automacao, arquivo_url, arquivo_nome, arquivo_tipo")
    .eq("id_empresa", idEmpresa)
    .eq("id", item.id_campanha)
    .maybeSingle();
  if (campanhaError) throw campanhaError;
  if (!campanha) throw new Error("Campanha da automação não encontrada.");

  const telefone = normalizarTelefoneBrasil(item.cliente_telefone);
  const texto = String(item.mensagem ?? item.request_payload?.message ?? "").trim();
  if (!telefone) throw new Error("Telefone do destinatário inválido ou não informado.");
  if (!texto) throw new Error("Mensagem vazia. Envio forçado cancelado.");

  const config = await obterConfig(supabase, idEmpresa);
  const arquivoUrl = item.request_payload?.arquivo_url ?? campanha.arquivo_url;
  const arquivoTipo = item.request_payload?.arquivo_tipo ?? campanha.arquivo_tipo;
  const requestPayload = {
    ...(typeof item.request_payload === "object" && item.request_payload ? item.request_payload : {}),
    phone: telefone,
    message: texto,
    arquivo_url: arquivoUrl ?? null,
    arquivo_tipo: arquivoTipo ?? null,
    envio_forcado: true,
  };

  const result = await enviarBtzap(config, telefone, texto, arquivoUrl, arquivoTipo);
  const agora = new Date().toISOString();
  const sucesso = result.success;
  const mensagemId = sucesso ? extrairMensagemIdExterno(result.retorno) : null;
  const tipoEnvio = item.tipo_automacao?.startsWith("aniversariantes") ? "aniversario" : normalizarTipoEnvio(campanha.tipo_automacao ? "campanha_promocao" : "campanha_promocao");

  const historicoPayload = {
    id_empresa: idEmpresa,
    cliente_id: item.cliente_id == null ? null : String(item.cliente_id),
    cliente_nome: item.cliente_nome ?? null,
    cliente_telefone: telefone,
    origem: "Automação",
    documento: item.documento ?? null,
    mensagem: texto,
    status: sucesso ? "enviado" : "erro",
    tipo_envio: tipoEnvio,
    categoria_envio: tipoEnvio,
    operacao_envio: "envio_forcado",
    provider: "btzap",
    erro: sucesso ? "OK" : result.message,
    ultima_tentativa_em: agora,
    proxima_tentativa_em: null,
    processado_em: sucesso ? agora : null,
    enviado_em: sucesso ? agora : null,
    mensagem_id_externo: mensagemId,
    btzap_message_id: mensagemId,
    status_entrega: sucesso ? "ENVIADO_API" : "FALHOU",
    enviado_api_em: sucesso ? agora : null,
    falhou_em: sucesso ? null : agora,
    request_payload: requestPayload,
    response_payload: result.retorno ?? result,
    webhook_ultimo_evento: result.retorno ?? null,
    origem_envio: "CAMPANHA_AUTOMATIZADA",
    origem_modulo: "AUTOMACAO",
    id_origem: item.id_campanha,
    envio_forcado: true,
    envio_forcado_em: agora,
    envio_forcado_motivo: "Parâmetros de segurança ignorados por confirmação manual.",
  };

  const historicoId = await registrarHistorico(supabase, historicoPayload, item.historico_envio_id ?? null);
  const { error: updateError } = await supabase
    .from("tab_automacao_execucao_itens")
    .update({
      status: sucesso ? "enviado" : "erro",
      tentativa_atual: Number(item.tentativa_atual ?? 0) + 1,
      ultima_tentativa_em: agora,
      proxima_tentativa_em: null,
      motivo_bloqueio: sucesso ? null : "erro_btzap",
      erro_envio: sucesso ? "OK" : result.message,
      historico_envio_id: historicoId,
      request_payload: requestPayload,
      response_payload: result.retorno ?? result,
    })
    .eq("id_empresa", idEmpresa)
    .eq("id", item.id);
  if (updateError) throw updateError;

  await recalcularTotaisAutomacao(supabase, idEmpresa, item.id_campanha);
  return { success: sucesso, message: sucesso ? "Item de automação enviado com envio forçado." : result.message, historicoId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  try {
    const payload = await req.json() as ForceSendPayload;
    const tipo = payload.tipo;
    const id = String(payload.id ?? "").trim();
    const idEmpresa = String(payload.id_empresa ?? "").trim();

    if (!["automacao_item", "mensagem_programada"].includes(tipo)) {
      return jsonResponse({ success: false, message: "Tipo de envio forçado inválido." }, 400);
    }
    if (!id || !idEmpresa) return jsonResponse({ success: false, message: "ID e empresa são obrigatórios." }, 400);

    const supabase = createSupabaseAdmin();
    const result = tipo === "automacao_item"
      ? await forcarItemAutomacao(supabase, idEmpresa, id)
      : await forcarMensagemProgramada(supabase, idEmpresa, id);

    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, message }, 500);
  }
});
