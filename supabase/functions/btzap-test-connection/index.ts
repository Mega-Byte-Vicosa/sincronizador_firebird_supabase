import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { testBtzapConnection } from "../_shared/btzapClient.ts";
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
    if (!idEmpresa) {
      return jsonResponse({ success: false, message: "Empresa da sessão não identificada." }, 400);
    }

    const supabase = createSupabaseAdmin();

    const { data: config, error } = await supabase
      .from("tab_btzap_config")
      .select("*")
      .eq("id_empresa", idEmpresa)
      .eq("ativo", true)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!config) return jsonResponse({ success: false, message: "Nenhuma configuração BTZap cadastrada para esta empresa." });

    const result = await testBtzapConnection(config);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: "Não foi possível validar a conexão BTZap.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
