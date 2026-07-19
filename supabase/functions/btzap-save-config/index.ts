import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function obterIdEmpresa(payload: Record<string, unknown>) {
  return String(payload.id_empresa || payload.idEmpresa || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  try {
    const payload = await req.json().catch(() => ({}));
    const idEmpresa = obterIdEmpresa(payload);
    const nomeInstancia = String(payload.nome_instancia ?? "").trim();
    const urlServidor = String(payload.url_servidor ?? "").trim();
    const tokenInstancia = String(payload.token_instancia ?? "").trim();
    const endpoint_envio_texto = String(payload.endpoint_envio_texto || "/send/text").trim();
    const endpoint_envio_media = String(payload.endpoint_envio_media || "/send/media").trim();
    const metodo_envio_texto = String(payload.metodo_envio_texto || "POST").trim().toUpperCase();
    const formato_payload = String(payload.formato_payload || "btzap").trim();
    const ativo = Boolean(payload.ativo);

    if (!idEmpresa) {
      return jsonResponse({ success: false, message: "Empresa da sessão não identificada." }, 400);
    }

    if (!nomeInstancia || !urlServidor) {
      return jsonResponse({ success: false, message: "Nome da instância e URL do servidor são obrigatórios." }, 400);
    }

    const supabase = createSupabaseAdmin();
    const { data: currentConfig, error: selectError } = await supabase
      .from("tab_btzap_config")
      .select("id, token_instancia")
      .eq("id_empresa", idEmpresa)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    const configData: Record<string, unknown> = {
      id_empresa: idEmpresa,
      nome_instancia: nomeInstancia,
      url_servidor: urlServidor,
      endpoint_envio_texto,
      endpoint_envio_media,
      metodo_envio_texto,
      formato_payload,
      ativo,
      atualizado_em: new Date().toISOString(),
    };

    if (tokenInstancia) configData.token_instancia = tokenInstancia;

    if (currentConfig?.id !== undefined) {
      const { error } = await supabase
        .from("tab_btzap_config")
        .update(configData)
        .eq("id", currentConfig.id)
        .eq("id_empresa", idEmpresa);
      if (error) throw error;
    } else {
      if (!tokenInstancia) {
        return jsonResponse({ success: false, message: "Token da instância é obrigatório para cadastrar a configuração BTZap desta empresa." }, 400);
      }

      const { error } = await supabase.from("tab_btzap_config").insert({
        ...configData,
        token_instancia: tokenInstancia,
        criado_em: new Date().toISOString(),
      });
      if (error) throw error;
    }

    return jsonResponse({
      success: true,
      message: "Configurações salvas com sucesso.",
      token_configurado: Boolean(tokenInstancia || currentConfig?.token_instancia),
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: "Erro ao salvar configurações da BTZap.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
