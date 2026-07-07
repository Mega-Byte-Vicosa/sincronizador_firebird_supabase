import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendBtzapMessage, validateBtzapConfig } from "../_shared/btzapClient.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizarTipoEnvio, processarEnvioWhatsApp } from "../_shared/whatsappSendGuard.ts";

function textoErro(valor: unknown) { return valor instanceof Error ? valor.message : typeof valor === "string" ? valor : JSON.stringify(valor); }
function telefoneNormalizado(valor: unknown) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55") ? digitos : null;
}

function mensagemBloqueio(motivo: unknown) {
  const mensagens: Record<string, string> = {
    bloqueado_fora_horario: "Envio bloqueado fora do horário permitido.",
    aguardando_horario_permitido: "Envio aguardando a próxima janela permitida.",
    bloqueado_limite_diario: "Envio bloqueado porque o limite diário foi atingido.",
    bloqueado_limite_minuto: "Envio aguardando o limite por minuto.",
    bloqueado_frequencia_cliente: "Envio bloqueado pela frequência mínima do cliente.",
    bloqueado_feriado: "Envio bloqueado em feriado.",
    bloqueado_dia_nao_permitido: "Envio bloqueado em dia não permitido.",
    aguardando_intervalo: "Envio aguardando o intervalo de segurança entre mensagens.",
    falha_sem_parametro_whats: "Nenhum parâmetro WhatsApp ativo foi encontrado para esta empresa.",
  };
  return mensagens[String(motivo)] || "Envio aguardando uma regra permitida.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl) throw new Error("Variável de ambiente SUPABASE_URL não configurada.");
    if (!serviceRoleKey) throw new Error("Variável de ambiente SUPABASE_SERVICE_ROLE_KEY não configurada.");
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const empresaId = String(body.empresa_id || body.id_empresa || body.idEmpresa || "").trim();
    const idCtarec = Number(body.id_ctarec || 0) || null;
    let clienteId = body.cliente_id == null ? null : String(body.cliente_id);
    let telefone = telefoneNormalizado(body.telefone);
    let mensagem = String(body.mensagem ?? "").trim();
    const tipoEnvio = normalizarTipoEnvio(String(body.categoria_envio || body.tipo_envio || (idCtarec ? "cobranca" : "geral")));
    const operacaoEnvio = String(body.operacao_envio || "envio");
    const tentativaAtual = Number(body.tentativa_atual ?? (operacaoEnvio === "reenvio" ? 1 : 0));
    let conta: Record<string, any> | null = null;

    if (!empresaId) return jsonResponse({ success: false, message: "Empresa da sessão não identificada." }, 400);
    if (idCtarec) {
      const result = await supabase.from("firebird_contas_receber").select("*").eq("id_empresa", empresaId).eq("id_ctarec", idCtarec).single();
      if (result.error) throw result.error;
      conta = result.data; clienteId = String(conta.id_cliente ?? clienteId ?? "") || null;
      telefone = telefone || telefoneNormalizado(conta.cliente_telefone);
      if (conta.id_cliente != null) {
        const permissao = await supabase.from("tab_cliente").select("permite_cobranca_aviso, contato_restrito").eq("id_empresa", empresaId).eq("id_cliente", conta.id_cliente).maybeSingle();
        if (permissao.error) throw permissao.error;
        if (permissao.data?.contato_restrito || permissao.data?.permite_cobranca_aviso === false) {
          return jsonResponse({ success: false, bloqueado: true, motivo: "cancelado_optout", message: "Cliente não permite cobranças e avisos." });
        }
      }
    }
    if (!telefone) return jsonResponse({ success: false, motivo: "cancelado_numero_invalido", message: "Telefone inválido ou não informado." }, 400);
    if (!mensagem) return jsonResponse({ success: false, message: "Mensagem não pode estar vazia." }, 400);

    const resultado = await processarEnvioWhatsApp({
      supabase, empresaId, tipoEnvio, clienteId, telefone, mensagem,
      origem: String(body.origem || (idCtarec ? "Contas a Receber" : "Envio manual")),
      referenciaId: body.referencia_id == null ? idCtarec : String(body.referencia_id), tentativaAtual,
      enviarBtzap: async () => {
        const configResult = await supabase.from("tab_btzap_config").select("*").eq("id_empresa", empresaId).eq("ativo", true).maybeSingle();
        if (configResult.error) throw configResult.error;
        if (!configResult.data) throw new Error("Nenhuma configuração BTZap ativa foi encontrada para esta empresa.");
        const erroConfig = validateBtzapConfig(configResult.data); if (erroConfig) throw new Error(erroConfig);
        const retorno = await sendBtzapMessage(configResult.data, { phone: telefone!, message: mensagem });
        if (!retorno.success) throw new Error(retorno.message);
        return "retorno" in retorno ? retorno.retorno : retorno;
      },
    });

    if (!resultado.enviado) return jsonResponse({ success: false, bloqueado: true, motivo: resultado.motivo, proximaTentativaEm: resultado.proximaTentativaEm, proxima_tentativa_em: resultado.proximaTentativaEm, message: resultado.motivo === "erro_btzap" ? resultado.detalhe : mensagemBloqueio(resultado.motivo) });
    if (conta && idCtarec) {
      const agora = new Date().toISOString();
      const reenvio = operacaoEnvio === "reenvio";
      const total = Number(conta.whatsapp_total_envios ?? 0) + 1;
      const reenvios = Number(conta.whatsapp_total_reenvios ?? 0) + (reenvio ? 1 : 0);
      await supabase.from("firebird_contas_receber").update({
        whatsapp_status: "enviado", whatsapp_primeiro_envio_em: conta.whatsapp_primeiro_envio_em || agora,
        whatsapp_ultimo_envio_em: agora, whatsapp_total_envios: total, whatsapp_ultimo_reenvio_em: reenvio ? agora : conta.whatsapp_ultimo_reenvio_em,
        whatsapp_total_reenvios: reenvios, whatsapp_ultimo_erro: null, whatsapp_ultimo_tipo: reenvio ? "reenvio" : "envio",
        whatsapp_ultimo_envio_id: resultado.historicoId, whatsapp_status_exibicao: reenvio ? `Reenviado ${reenvios}` : "Enviado",
      }).eq("id_empresa", empresaId).eq("id_ctarec", idCtarec);
    }
    return jsonResponse({ success: true, message: "Mensagem enviada com sucesso.", envio_id: resultado.historicoId });
  } catch (error) {
    const detail = textoErro(error);
    return jsonResponse({ success: false, message: "A Edge Function não conseguiu processar a solicitação.", error: detail, detail, details: detail }, 500);
  }
});
