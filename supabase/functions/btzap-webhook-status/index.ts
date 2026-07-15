import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  extrairErroEvento,
  extrairMensagemIdExterno,
  extrairStatusEvento,
  extrairTimestampEvento,
  extrairTipoEvento,
  normalizarStatusEntrega,
} from "../_shared/btzapMessageStatus.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function eventoPodeAtualizarStatus(tipoEvento: string | null, statusEntrega: string | null) {
  if (statusEntrega) return true;
  if (!tipoEvento) return false;
  const tipo = tipoEvento.trim().toLowerCase();
  return [
    "messages_update",
    "message_update",
    "messages.update",
    "message.update",
    "status",
    "update",
  ].includes(tipo);
}

function valorTexto(valor: unknown) {
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  if (typeof valor === "number") return String(valor);
  return null;
}

function valoresTexto(valor: unknown) {
  if (Array.isArray(valor)) return valor.map(valorTexto).filter(Boolean) as string[];
  const texto = valorTexto(valor);
  return texto ? [texto] : [];
}

function normalizePhone(value: unknown) {
  const texto = valorTexto(value);
  if (!texto) return null;
  const numeros = texto.replace(/\D/g, "");
  return numeros || null;
}

function phoneVariants(value: unknown) {
  const telefone = normalizePhone(value);
  if (!telefone) return [];

  const variantes = [telefone];
  if (telefone.startsWith("55") && telefone.length === 13 && telefone[4] === "9") {
    variantes.push(`${telefone.slice(0, 4)}${telefone.slice(5)}`);
  }
  if (telefone.startsWith("55") && telefone.length === 12) {
    variantes.push(`${telefone.slice(0, 4)}9${telefone.slice(4)}`);
  }

  return variantes;
}

function payloadObjeto(payload: unknown) {
  return payload && typeof payload === "object" ? payload as Record<string, any> : {};
}

function extractEvento(payload: unknown) {
  const body = payloadObjeto(payload);
  return valorTexto(body.EventType)
    ?? valorTexto(body.type)
    ?? valorTexto(body.eventType)
    ?? valorTexto(body.event)
    ?? valorTexto(body.data?.event)
    ?? valorTexto(body.data?.type)
    ?? extrairTipoEvento(payload);
}

function extractStatus(payload: unknown) {
  const body = payloadObjeto(payload);
  const statusRecebido = [
    body.state,
    body.event?.Type,
    body.event?.type,
    body.event?.status,
    body.event?.ack,
    body.status,
    body.ack,
    body.data?.status,
    body.data?.ack,
    body.update?.status,
    body.update?.ack,
    body.message?.status,
    body.data?.message?.status,
    extrairStatusEvento(payload),
  ].map(valorTexto).find(Boolean) ?? null;

  const valor = String(statusRecebido ?? "").trim().toLowerCase();
  if (["delivered", "delivery", "entregue", "entrega", "2", "3"].includes(valor)) return "ENTREGUE";
  if (["read", "viewed", "played", "lido", "visualizado", "4"].includes(valor)) return "LIDO";
  if (["failed", "error", "erro", "undelivered", "-1"].includes(valor)) return "ERRO";
  const statusNormalizado = normalizarStatusEntrega(statusRecebido);
  return statusNormalizado === "FALHOU" ? "ERRO" : statusNormalizado;
}

function extractMessageIds(payload: unknown) {
  const body = payloadObjeto(payload);
  const ids = [
    ...valoresTexto(body.event?.MessageIDs),
    ...valoresTexto(body.event?.messageIds),
    ...valoresTexto(body.event?.message_ids),
    ...valoresTexto(body.MessageIDs),
    ...valoresTexto(body.messageIds),
    ...valoresTexto(body.message_ids),
    ...valoresTexto(body.messageId),
    ...valoresTexto(body.message_id),
    ...valoresTexto(body.id),
    ...valoresTexto(body.data?.messageId),
    ...valoresTexto(body.data?.message_id),
    ...valoresTexto(body.data?.id),
    ...valoresTexto(body.key?.id),
    ...valoresTexto(body.data?.key?.id),
    ...valoresTexto(body.result?.id),
    ...valoresTexto(body.message?.id),
    ...valoresTexto(body.data?.message?.id),
    ...valoresTexto(body.update?.messageId),
    ...valoresTexto(body.update?.message_id),
    ...valoresTexto(extrairMensagemIdExterno(payload)),
  ];
  return [...new Set(ids)];
}

function extractPhones(payload: unknown) {
  const body = payloadObjeto(payload);
  const telefones = [
    body.event?.Chat,
    body.event?.chatid,
    body.event?.Sender,
    body.event?.sender_pn,
    body.owner,
    body.chat,
    body.sender,
    body.data?.chat,
    body.data?.sender,
  ].flatMap(phoneVariants);
  return [...new Set(telefones)];
}

function sanitizeWebhookPayload(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizeWebhookPayload);
  if (!valor || typeof valor !== "object") return valor;

  const sanitizado: Record<string, unknown> = {};
  for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
    const chaveNormalizada = chave.toLowerCase();
    if (
      chaveNormalizada.includes("secret") ||
      chaveNormalizada.includes("token") ||
      chaveNormalizada.includes("headers") ||
      chaveNormalizada.includes("authorization")
    ) {
      sanitizado[chave] = "[removido]";
      continue;
    }
    sanitizado[chave] = sanitizeWebhookPayload(conteudo);
  }
  return sanitizado;
}

async function registrarWebhookLog(args: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  payload: unknown;
  evento: string | null;
  statusExtraido: string | null;
  messageIdExtraido: string | null;
  statusHttp: number;
  processado: boolean;
  motivo: string;
}) {
  const { error } = await args.supabase.from("tab_btzap_webhook_logs").insert({
    evento: args.evento,
    status_extraido: args.statusExtraido,
    message_id_extraido: args.messageIdExtraido,
    status_http: args.statusHttp,
    processado: args.processado,
    motivo: args.motivo,
    payload: sanitizeWebhookPayload(args.payload),
  });

  if (error) {
    console.log("BTZap webhook log nao salvo", { motivo: error.message });
  }

  console.log("BTZap webhook recebido", {
    evento: args.evento,
    statusExtraido: args.statusExtraido,
    messageIdExtraido: args.messageIdExtraido,
    processado: args.processado,
    motivo: args.motivo,
  });
}

function montarAtualizacaoStatus(args: {
  envio: any;
  statusEntrega: string;
  agora: string;
  payloadSanitizado: unknown;
  body: unknown;
}) {
  const atualizacao: Record<string, unknown> = {
    webhook_ultimo_evento: args.payloadSanitizado,
    webhook_payload: args.payloadSanitizado,
    ultimo_webhook_em: args.agora,
  };

  if (args.statusEntrega === "ENTREGUE") {
    if (String(args.envio.status_entrega ?? "").toUpperCase() !== "LIDO") {
      atualizacao.status_entrega = "ENTREGUE";
    }
    atualizacao.entregue_em = args.envio.entregue_em ?? args.agora;
  }

  if (args.statusEntrega === "LIDO") {
    atualizacao.status_entrega = "LIDO";
    atualizacao.entregue_em = args.envio.entregue_em ?? args.agora;
    atualizacao.lido_em = args.envio.lido_em ?? args.agora;
    atualizacao.visualizado_em = args.envio.visualizado_em ?? args.agora;
  }

  if (args.statusEntrega === "ERRO") {
    atualizacao.status = "erro";
    atualizacao.status_entrega = "ERRO";
    atualizacao.falhou_em = args.agora;
    atualizacao.erro = extrairErroEvento(args.body) ?? "Erro tecnico retornado pelo BTZap/WhatsApp.";
  }

  return atualizacao;
}

async function atualizarEnvios(args: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  envios: any[];
  statusEntrega: string;
  agora: string;
  payloadSanitizado: unknown;
  body: unknown;
}) {
  let atualizados = 0;

  for (const envio of args.envios) {
    const statusHistorico = String(envio.status ?? "").trim().toLowerCase();
    if (statusHistorico === "pendente") continue;
    if (args.statusEntrega === "ERRO" && statusHistorico === "pendente") continue;

    const atualizacao = montarAtualizacaoStatus({
      envio,
      statusEntrega: args.statusEntrega,
      agora: args.agora,
      payloadSanitizado: args.payloadSanitizado,
      body: args.body,
    });

    const { error } = await args.supabase
      .from("tab_whatsapp_envios")
      .update(atualizacao)
      .eq("id", envio.id)
      .eq("id_empresa", envio.id_empresa);

    if (error) return { atualizados, error };
    atualizados += 1;
  }

  return { atualizados, error: null };
}

async function buscarEnviosPorMensagemIds(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagemIdsExternos: string[],
) {
  if (!mensagemIdsExternos.length) {
    return { envios: [], error: null };
  }

  const [porMensagemId, porBtzapId] = await Promise.all([
    supabase
      .from("tab_whatsapp_envios")
      .select("id, id_empresa, status, erro, status_entrega, entregue_em, lido_em, visualizado_em")
      .in("mensagem_id_externo", mensagemIdsExternos),
    supabase
      .from("tab_whatsapp_envios")
      .select("id, id_empresa, status, erro, status_entrega, entregue_em, lido_em, visualizado_em")
      .in("btzap_message_id", mensagemIdsExternos),
  ]);

  return {
    envios: [
      ...(porMensagemId.data ?? []),
      ...(porBtzapId.data ?? []),
    ].filter((envio, index, lista) => lista.findIndex((item) => item.id === envio.id) === index),
    error: porMensagemId.error ?? porBtzapId.error,
  };
}

async function buscarCandidatoLeituraPorTelefone(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  telefonesExtraidos: string[],
) {
  if (!telefonesExtraidos.length) {
    return { envios: [], error: null };
  }

  const limiteFallback = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("tab_whatsapp_envios")
    .select("id, id_empresa, status, erro, status_entrega, entregue_em, lido_em, visualizado_em, criado_em")
    .in("cliente_telefone", telefonesExtraidos)
    .eq("status", "enviado")
    .or("erro.eq.OK,erro.is.null")
    .gte("criado_em", limiteFallback)
    .or("status_entrega.in.(ENTREGUE,ENVIADO_API,ENVIADO,LIDO),status_entrega.is.null")
    .or("lido_em.is.null,visualizado_em.is.null")
    .order("entregue_em", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false })
    .limit(1);

  return { envios: data ?? [], error };
}

async function aplicarLeituraPorIdOuTelefone(args: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  mensagemIdsExternos: string[];
  telefonesExtraidos: string[];
  agora: string;
  payloadSanitizado: unknown;
  body: unknown;
}) {
  const buscaPorId = await buscarEnviosPorMensagemIds(args.supabase, args.mensagemIdsExternos);
  if (buscaPorId.error) return { atualizados: 0, error: buscaPorId.error, motivo: "erro ao consultar envio" };

  if (buscaPorId.envios.length) {
    const resultado = await atualizarEnvios({
      supabase: args.supabase,
      envios: buscaPorId.envios,
      statusEntrega: "LIDO",
      agora: args.agora,
      payloadSanitizado: args.payloadSanitizado,
      body: args.body,
    });

    return {
      ...resultado,
      motivo: resultado.atualizados > 0 ? "leitura atualizada por ID" : "registro nao atualizado",
    };
  }

  const buscaPorTelefone = await buscarCandidatoLeituraPorTelefone(args.supabase, args.telefonesExtraidos);
  if (buscaPorTelefone.error) return { atualizados: 0, error: buscaPorTelefone.error, motivo: "erro ao consultar envio" };

  if (!buscaPorTelefone.envios.length) {
    return { atualizados: 0, error: null, motivo: "registro de leitura não encontrado" };
  }

  const resultado = await atualizarEnvios({
    supabase: args.supabase,
    envios: buscaPorTelefone.envios,
    statusEntrega: "LIDO",
    agora: args.agora,
    payloadSanitizado: args.payloadSanitizado,
    body: args.body,
  });

  return {
    ...resultado,
    motivo: resultado.atualizados > 0 ? "leitura atualizada por fallback telefone/chat" : "registro nao atualizado",
  };
}

async function reprocessarLogsLidoRecentes(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const limiteLogs = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: logs, error } = await supabase
    .from("tab_btzap_webhook_logs")
    .select("id, payload, message_id_extraido")
    .eq("status_extraido", "LIDO")
    .eq("processado", false)
    .gte("criado_em", limiteLogs)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error || !logs?.length) return;

  for (const log of logs) {
    const payload = payloadObjeto(log.payload) ?? {};
    const idsDoLog = String(log.message_id_extraido ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const mensagemIdsExternos = [...new Set([...idsDoLog, ...extractMessageIds(payload)])];
    const telefonesExtraidos = extractPhones(payload);
    const agora = new Date().toISOString();
    const resultado = await aplicarLeituraPorIdOuTelefone({
      supabase,
      mensagemIdsExternos,
      telefonesExtraidos,
      agora,
      payloadSanitizado: sanitizeWebhookPayload(payload),
      body: payload,
    });

    if (resultado.error) continue;

    if (resultado.atualizados > 0) {
      await supabase
        .from("tab_btzap_webhook_logs")
        .update({
          processado: true,
          motivo: "leitura reprocessada e atualizada",
          status_http: 200,
        })
        .eq("id", log.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Metodo nao permitido." }, 405);

  const expectedSecret = Deno.env.get("BTZAP_WEBHOOK_SECRET");
  const url = new URL(req.url);
  const receivedSecret = url.searchParams.get("secret");

  if (!expectedSecret) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "BTZAP_WEBHOOK_SECRET não configurado",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    let payloadNaoAutorizado: unknown = null;
    try {
      payloadNaoAutorizado = await req.clone().json();
    } catch {
      payloadNaoAutorizado = null;
    }

    const evento = extractEvento(payloadNaoAutorizado);
    const statusExtraido = extractStatus(payloadNaoAutorizado);
    const messageIdExtraido = extractMessageIds(payloadNaoAutorizado).join(",") || null;
    await registrarWebhookLog({
      supabase: createSupabaseAdmin(),
      payload: payloadNaoAutorizado,
      evento,
      statusExtraido,
      messageIdExtraido,
      statusHttp: 403,
      processado: false,
      motivo: "Webhook não autorizado",
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: "Webhook não autorizado",
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, message: "Payload JSON invalido." }, 400);
  }

  const mensagemIdsExternos = extractMessageIds(body);
  const mensagemIdExterno = mensagemIdsExternos[0] ?? null;
  const messageIdsExtraidos = mensagemIdsExternos.join(",") || null;
  const telefonesExtraidos = extractPhones(body);
  const tipoEvento = extractEvento(body);
  const statusEntrega = extractStatus(body);
  const supabase = createSupabaseAdmin();
  const agora = extrairTimestampEvento(body) ?? new Date().toISOString();
  const payloadSanitizado = sanitizeWebhookPayload(body);
  await reprocessarLogsLidoRecentes(supabase);

  if (!eventoPodeAtualizarStatus(tipoEvento, statusEntrega)) {
    const eventoMessagesIgnorado = String(tipoEvento ?? "").trim().toLowerCase() === "messages";
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: false,
      motivo: eventoMessagesIgnorado ? "evento messages ignorado para confirmação" : "status não mapeado",
    });

    return jsonResponse({
      success: true,
      ignored: true,
      message: "Evento sem atualizacao de entrega/leitura mapeada.",
      event: tipoEvento,
      status_recebido: statusEntrega,
    });
  }

  if (!mensagemIdsExternos.length && !telefonesExtraidos.length) {
    const motivoSemIdentificacao = statusEntrega === "ENTREGUE"
      ? "entrega não confirmada: ID não encontrado"
      : "messageId não encontrado";
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: false,
      motivo: motivoSemIdentificacao,
    });

    return jsonResponse({
      success: true,
      ignored: true,
      message: "ID externo da mensagem nao informado no webhook. Nenhum registro foi atualizado.",
      event: tipoEvento,
      status_recebido: statusEntrega,
      status_entrega: statusEntrega ?? "NAO_MAPEADO",
    });
  }

  let selectError: any = null;
  let envios: any[] = [];

  if (mensagemIdsExternos.length) {
    const buscaPorId = await buscarEnviosPorMensagemIds(supabase, mensagemIdsExternos);
    selectError = buscaPorId.error;
    envios = buscaPorId.envios;
  }

  if (selectError) {
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 400,
      processado: false,
      motivo: "erro ao consultar envio",
    });

    return jsonResponse({ success: false, message: "Nao foi possivel consultar o envio.", error: selectError.message }, 400);
  }

  if (envios.length) {
    const resultadoAtualizacao = await atualizarEnvios({
      supabase,
      envios,
      statusEntrega,
      agora,
      payloadSanitizado,
      body,
    });

    if (resultadoAtualizacao.error) {
      await registrarWebhookLog({
        supabase,
        payload: body,
        evento: tipoEvento,
        statusExtraido: statusEntrega,
        messageIdExtraido: messageIdsExtraidos,
        statusHttp: 400,
        processado: false,
        motivo: "erro ao atualizar registro",
      });

      return jsonResponse({ success: false, message: "Nao foi possivel atualizar o status de entrega.", error: resultadoAtualizacao.error.message }, 400);
    }

    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: resultadoAtualizacao.atualizados > 0,
      motivo: resultadoAtualizacao.atualizados > 0
        ? statusEntrega === "LIDO"
          ? "leitura atualizada por ID"
          : statusEntrega === "ENTREGUE"
          ? "entrega atualizada por ID"
          : "registro atualizado por ID"
        : "registro nao atualizado",
    });

    return jsonResponse({
      success: true,
      mensagem_id_externo: mensagemIdExterno,
      event: tipoEvento,
      status_recebido: statusEntrega,
      status_entrega: statusEntrega ?? "NAO_MAPEADO",
      registros_atualizados: resultadoAtualizacao.atualizados,
    });
  }

  if (
    statusEntrega === "ERRO" ||
    statusEntrega === "ENTREGUE" ||
    !telefonesExtraidos.length ||
    statusEntrega !== "LIDO"
  ) {
    const motivoNaoEncontrado = statusEntrega === "LIDO"
      ? "registro de leitura não encontrado"
      : statusEntrega === "ENTREGUE"
      ? "entrega não confirmada: ID não encontrado"
      : "registro não encontrado";
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: false,
      motivo: motivoNaoEncontrado,
    });

    return jsonResponse({
      success: true,
      ignored: true,
      message: statusEntrega === "LIDO"
        ? "registro de leitura não encontrado"
        : statusEntrega === "ENTREGUE"
        ? "entrega não confirmada: ID não encontrado"
        : "Nenhum envio encontrado com este mensagem_id_externo. Nenhum registro foi atualizado.",
      mensagem_id_externo: mensagemIdExterno,
      status_recebido: statusEntrega,
      status_entrega: statusEntrega ?? "NAO_MAPEADO",
    });
  }

  const limiteFallback = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  let queryFallback = supabase
    .from("tab_whatsapp_envios")
    .select("id, id_empresa, status, erro, status_entrega, entregue_em, lido_em, visualizado_em, criado_em")
    .in("cliente_telefone", telefonesExtraidos)
    .eq("status", "enviado")
    .or("erro.eq.OK,erro.is.null")
    .gte("criado_em", limiteFallback)
    .or("status_entrega.in.(ENTREGUE,ENVIADO_API,ENVIADO,LIDO),status_entrega.is.null");

  if (statusEntrega === "LIDO") {
    queryFallback = queryFallback
      .or("lido_em.is.null,visualizado_em.is.null")
      .order("entregue_em", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false })
      .limit(1);
  }

  const { data: candidatosFallback, error: fallbackError } = await queryFallback;

  if (fallbackError) {
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 400,
      processado: false,
      motivo: "erro ao consultar envio",
    });

    return jsonResponse({ success: false, message: "Nao foi possivel consultar o envio.", error: fallbackError.message }, 400);
  }

  const candidatosUnicos = (candidatosFallback ?? [])
    .filter((envio, index, lista) => lista.findIndex((item) => item.id === envio.id) === index);

  if (statusEntrega !== "LIDO" && candidatosUnicos.length !== 1) {
    const motivo = candidatosUnicos.length > 1
      ? "fallback ambiguo: multiplos registros candidatos"
      : statusEntrega === "LIDO" ? "registro de leitura não encontrado" : "registro nao encontrado";

    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: false,
      motivo,
    });

    return jsonResponse({
      success: true,
      ignored: true,
      message: motivo,
      mensagem_id_externo: mensagemIdExterno,
      status_recebido: statusEntrega,
      status_entrega: statusEntrega ?? "NAO_MAPEADO",
    });
  }

  if (statusEntrega === "LIDO" && candidatosUnicos.length === 0) {
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 200,
      processado: false,
      motivo: "registro de leitura não encontrado",
    });

    return jsonResponse({
      success: true,
      ignored: true,
      message: "registro de leitura não encontrado",
      mensagem_id_externo: mensagemIdExterno,
      status_recebido: statusEntrega,
      status_entrega: statusEntrega ?? "NAO_MAPEADO",
    });
  }

  const resultadoFallback = await atualizarEnvios({
    supabase,
    envios: candidatosUnicos,
    statusEntrega,
    agora,
    payloadSanitizado,
    body,
  });

  if (resultadoFallback.error) {
    await registrarWebhookLog({
      supabase,
      payload: body,
      evento: tipoEvento,
      statusExtraido: statusEntrega,
      messageIdExtraido: messageIdsExtraidos,
      statusHttp: 400,
      processado: false,
      motivo: "erro ao atualizar registro",
    });

    return jsonResponse({ success: false, message: "Nao foi possivel atualizar o status de entrega.", error: resultadoFallback.error.message }, 400);
  }

  await registrarWebhookLog({
    supabase,
    payload: body,
    evento: tipoEvento,
    statusExtraido: statusEntrega,
    messageIdExtraido: messageIdsExtraidos,
    statusHttp: 200,
    processado: resultadoFallback.atualizados > 0,
    motivo: resultadoFallback.atualizados > 0
      ? statusEntrega === "LIDO" ? "leitura atualizada por fallback telefone/chat" : "registro atualizado por fallback telefone/horario"
      : "registro nao atualizado",
  });

  return jsonResponse({
    success: true,
    mensagem_id_externo: mensagemIdExterno,
    event: tipoEvento,
    status_recebido: statusEntrega,
    status_entrega: statusEntrega ?? "NAO_MAPEADO",
    registros_atualizados: resultadoFallback.atualizados,
    fallback: "telefone_horario",
  });
});
