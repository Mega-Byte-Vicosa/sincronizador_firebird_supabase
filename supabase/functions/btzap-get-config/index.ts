import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const EMPRESA_PADRAO_ID = "00000000-0000-0000-0000-000000000001";

function obterIdEmpresa(payload: Record<string, unknown>) {
  return String(payload.id_empresa || payload.idEmpresa || EMPRESA_PADRAO_ID).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ success: false, message: "Método não permitido." }, 405);
  }

  try {
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const idEmpresa = obterIdEmpresa(payload);
    const supabase = createSupabaseAdmin();

    const { data: config, error } = await supabase
      .from("tab_btzap_config")
      .select("*")
      .eq("id_empresa", idEmpresa)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return jsonResponse({
      success: true,
      config: config ?? null,
      message: config ? "Configuração carregada." : "Nenhuma configuração BTZap cadastrada para esta empresa.",
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: "Erro ao carregar configurações da BTZap.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
