import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { extrairDadosInstancia, montarEndpoint, validateInstanceConfig } from "../_shared/btzapInstance.ts";

const EMPRESA_PADRAO_ID = "00000000-0000-0000-0000-000000000001";

function obterIdEmpresa(payload: Record<string, unknown>) {
  return String(payload.id_empresa || payload.idEmpresa || EMPRESA_PADRAO_ID).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Metodo nao permitido." }, 405);

  try {
    const payload = await req.json().catch(() => ({}));
    const idEmpresa = obterIdEmpresa(payload);
    const phone = String(payload.phone ?? "").trim();
    const supabase = createSupabaseAdmin();

    const { data: config, error: configError } = await supabase
      .from("tab_btzap_config")
      .select("*")
      .eq("id_empresa", idEmpresa)
      .eq("ativo", true)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError) throw configError;

    const validationError = validateInstanceConfig(config);
    if (validationError) return jsonResponse({ success: false, message: validationError });

    const endpoint = montarEndpoint(config.url_servidor, config.endpoint_conectar_instancia, "/instance/connect");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: config.token_instancia,
      },
      body: JSON.stringify(phone ? { phone } : {}),
    });

    const text = await response.text();
    const responseBody = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return jsonResponse({
        success: false,
        message: "Nao foi possivel conectar a instancia BTZap.",
        error: `Erro BTZap HTTP ${response.status}. Retorno: ${text}`,
      });
    }

    const dados = extrairDadosInstancia(responseBody);
    const agora = new Date().toISOString();
    const statusUpdate: Record<string, unknown> = {
      ultimo_status_instancia: dados.status,
      ultimo_status_em: agora,
      ultimo_profile_name: dados.profileName,
      ultimo_profile_pic_url: dados.profilePicUrl,
      ultimo_connected: dados.connected,
      ultimo_logged_in: dados.loggedIn,
      atualizado_em: agora,
    };

    if (dados.qrcode) {
      statusUpdate.ultimo_qrcode_em = agora;
    }

    const { error: updateError } = await supabase
      .from("tab_btzap_config")
      .update(statusUpdate)
      .eq("id", config.id)
      .eq("id_empresa", idEmpresa);
    if (updateError) throw updateError;

    return jsonResponse({
      success: true,
      lastStatusAt: agora,
      lastQrCodeAt: dados.qrcode ? agora : null,
      ...dados,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: "Erro ao gerar QR Code da BTZap.",
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
