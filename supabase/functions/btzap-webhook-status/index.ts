import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { extrairMensagemIdExterno, extrairStatusEvento, normalizarStatusEntrega } from "../_shared/btzapMessageStatus.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, message: "Payload JSON inválido." }, 400);
  }

  const mensagemIdExterno = extrairMensagemIdExterno(body);
  if (!mensagemIdExterno) {
    return jsonResponse({
      success: false,
      message: "ID externo da mensagem não informado no webhook.",
      payload: body,
    }, 400);
  }

  const statusRecebido = extrairStatusEvento(body);
  const statusEntrega = normalizarStatusEntrega(statusRecebido);
  const supabase = createSupabaseAdmin();
  const { data: envios, error: selectError } = await supabase
    .from("tab_whatsapp_envios")
    .select("id, id_empresa, status_entrega")
    .eq("mensagem_id_externo", mensagemIdExterno);

  if (selectError) {
    return jsonResponse({ success: false, message: "Não foi possível consultar o envio.", error: selectError.message }, 400);
  }

  if (!envios?.length) {
    return jsonResponse({
      success: false,
      message: "Nenhum envio encontrado com este mensagem_id_externo.",
      mensagem_id_externo: mensagemIdExterno,
    });
  }

  const agora = new Date().toISOString();
  const prioridade: Record<string, number> = { ENVIADO_API: 1, ENTREGUE: 2, LIDO: 3, FALHOU: 4 };
  let atualizados = 0;

  for (const envio of envios) {
    const atualizacao: Record<string, unknown> = { webhook_ultimo_evento: body };
    const statusAtual = String(envio.status_entrega ?? "").toUpperCase();

    if (statusEntrega && (prioridade[statusEntrega] ?? 0) >= (prioridade[statusAtual] ?? 0)) {
      atualizacao.status_entrega = statusEntrega;
    }
    if (statusEntrega === "ENVIADO_API") atualizacao.enviado_api_em = agora;
    if (statusEntrega === "ENTREGUE") atualizacao.entregue_em = agora;
    if (statusEntrega === "LIDO") atualizacao.lido_em = agora;
    if (statusEntrega === "FALHOU") atualizacao.falhou_em = agora;

    const { error: updateError } = await supabase
      .from("tab_whatsapp_envios")
      .update(atualizacao)
      .eq("id", envio.id)
      .eq("id_empresa", envio.id_empresa);

    if (updateError) {
      return jsonResponse({ success: false, message: "Não foi possível atualizar o status de entrega.", error: updateError.message }, 400);
    }
    atualizados += 1;
  }

  return jsonResponse({
    success: true,
    mensagem_id_externo: mensagemIdExterno,
    status_recebido: statusRecebido,
    status_entrega: statusEntrega ?? "NAO_MAPEADO",
    registros_atualizados: atualizados,
  });
});
