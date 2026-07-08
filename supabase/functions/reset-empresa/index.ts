import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

async function compararSegredo(recebido: string, esperado: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(recebido)),
    crypto.subtle.digest("SHA-256", encoder.encode(esperado)),
  ]);
  const aa = new Uint8Array(a); const bb = new Uint8Array(b);
  let diferente = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) diferente |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diferente === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ success: false, message: "Usuário não autenticado." }, 401);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionToken = String(body.session_token ?? "").trim();
    const senha = String(body.senha ?? "");
    const confirmacao = String(body.confirmacao ?? "").trim();
    if (!sessionToken) return jsonResponse({ success: false, message: "Usuário não autenticado." }, 401);
    if (confirmacao !== "LIMPAR") return jsonResponse({ success: false, message: "Confirmação LIMPAR inválida." }, 400);

    const senhaEsperada = Deno.env.get("RESET_EMPRESA_PASSWORD");
    if (!senhaEsperada) return jsonResponse({ success: false, message: "RESET_EMPRESA_PASSWORD não configurada." }, 500);
    if (!(await compararSegredo(senha, senhaEsperada))) {
      return jsonResponse({ success: false, message: "Senha de confirmação inválida." }, 403);
    }

    const supabase = createSupabaseAdmin();
    const sessao = await supabase.rpc("validar_sessao_saas", { p_token: sessionToken });
    if (sessao.error || sessao.data?.success !== true || !sessao.data?.usuario) {
      return jsonResponse({ success: false, message: "Usuário não autenticado." }, 401);
    }
    const usuario = sessao.data.usuario as { id?: string; id_empresa?: string; usuario?: string };
    const empresaId = String(usuario.id_empresa ?? "").trim();
    if (!empresaId) return jsonResponse({ success: false, message: "Empresa logada não encontrada." }, 400);
    const empresaInformada = String(body.empresa_id ?? "").trim();
    if (empresaInformada && empresaInformada !== empresaId) {
      return jsonResponse({ success: false, message: "Você não tem permissão para redefinir esta empresa." }, 403);
    }

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const reset = await supabase.rpc("fn_resetar_empresa_dados", {
      p_empresa_id: empresaId,
      p_usuario_id: usuario.id ?? null,
      p_ip_origem: forwarded,
      p_user_agent: req.headers.get("user-agent"),
    });
    if (reset.error) throw new Error(reset.error.message);
    const relatorio = reset.data as { tabelas_limpas?: Record<string, number>; total_registros_apagados?: number };

    return jsonResponse({
      success: true,
      empresa_id: empresaId,
      tabelas_limpas: relatorio.tabelas_limpas ?? {},
      total_registros_apagados: Number(relatorio.total_registros_apagados ?? 0),
    });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, message: "Erro ao executar limpeza da empresa.", detail: detalhe }, 500);
  }
});
