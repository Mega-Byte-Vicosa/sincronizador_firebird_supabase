import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendBtzapMessage, validateBtzapConfig } from "../_shared/btzapClient.ts";
import { extrairMensagemIdExterno } from "../_shared/btzapMessageStatus.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const EMPRESA_PADRAO_ID = "00000000-0000-0000-0000-000000000001";


function transformarErroEmTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Error) return valor.message;

  if (Array.isArray(valor)) {
    return valor.map((item) => transformarErroEmTexto(item)).filter(Boolean).join(" | ");
  }

  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    const camposPrioritarios = ["message", "error", "detail", "details", "description", "retorno", "body"];
    const mensagens = camposPrioritarios.map((campo) => transformarErroEmTexto(objeto[campo])).filter(Boolean);

    if (mensagens.length > 0) return [...new Set(mensagens)].join(" | ");

    try {
      return JSON.stringify(valor);
    } catch {
      return "Erro desconhecido.";
    }
  }

  return String(valor);
}

function criarMensagemAmigavelBtzap(erro: string) {
  const texto = erro.toLowerCase();

  if (texto.includes("not on whatsapp") || texto.includes("is not on whatsapp")) {
    return "Não foi possível enviar: este número não possui WhatsApp ou está inválido.";
  }

  if (texto.includes("token") || texto.includes("unauthorized") || texto.includes("401")) {
    return "Não foi possível enviar: token ou autenticação do BTZap inválida.";
  }

  if (texto.includes("instance") || texto.includes("instância") || texto.includes("disconnected")) {
    return "Não foi possível enviar: a instância do WhatsApp/BTZap pode estar desconectada.";
  }

  return erro || "Não foi possível enviar a mensagem WhatsApp.";
}


function obterIdEmpresa(payload: Record<string, unknown>) {
  return String(payload.id_empresa || payload.idEmpresa || EMPRESA_PADRAO_ID).trim();
}

function formatarData(valor: string | null) {
  if (!valor) return "-";
  const [data] = valor.split("T");
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "-";
}

function formatarMoeda(valor: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor ?? 0));
}

function montarMensagem(conta: Record<string, any>) {
  const saudacao = conta.cliente_nome ? `Olá, ${conta.cliente_nome}! Tudo bem?` : "Olá! Tudo bem?";

  return `${saudacao}

Identificamos uma conta em aberto referente ao documento ${conta.documento ?? "-"}, com vencimento em ${formatarData(
    conta.dt_vencto,
  )}, no valor de ${formatarMoeda(conta.vlr_ctarec)}.

Caso já tenha realizado o pagamento, por favor desconsidere esta mensagem.

Atenciosamente,
Mega Byte`;
}

function jaHouveEnvioWhatsapp(conta: Record<string, any>) {
  return (
    conta.whatsapp_status === "enviado" ||
    Boolean(conta.whatsapp_primeiro_envio_em) ||
    Number(conta.whatsapp_total_envios ?? 0) > 0
  );
}

async function registrarHistorico(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  idEmpresa: string,
  conta: Record<string, any>,
  tipoEnvio: string,
  mensagem: string,
  status: string,
  erro: string | null,
  responsePayload: unknown,
) {
  const agora = new Date().toISOString();
  const sucesso = status === "enviado";
  const { data, error } = await supabase
    .from("tab_whatsapp_envios")
    .insert({
      id_empresa: idEmpresa,
      id_ctarec: conta.id_ctarec,
      cliente_nome: conta.cliente_nome,
      cliente_telefone: conta.cliente_telefone,
      origem: "Contas a Receber",
      documento: conta.documento,
      mensagem,
      status,
      tipo_envio: tipoEnvio,
      erro,
      enviado_em: sucesso ? agora : null,
      mensagem_id_externo: extrairMensagemIdExterno(responsePayload),
      status_entrega: sucesso ? "ENVIADO_API" : "FALHOU",
      enviado_api_em: sucesso ? agora : null,
      falhou_em: sucesso ? null : agora,
      response_payload: responsePayload,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  const supabase = createSupabaseAdmin();
  let idEmpresa = EMPRESA_PADRAO_ID;
  let conta: Record<string, any> | null = null;
  let tipoEnvio = "envio";
  let mensagem = "";
  let responsePayload: unknown = null;

  try {
    const payload = await req.json().catch(() => ({}));
    idEmpresa = obterIdEmpresa(payload);
    const idCtarec = Number(payload.id_ctarec);
    tipoEnvio = payload.tipo_envio === "reenvio" ? "reenvio" : "envio";
    const telefonePayload = String(payload.telefone ?? "").trim();
    const mensagemPayload = String(payload.mensagem ?? "").trim();

    if (!idEmpresa) return jsonResponse({ success: false, message: "Empresa da sessão não identificada." }, 400);
    if (!idCtarec) return jsonResponse({ success: false, message: "Conta a receber inválida." }, 400);
    if (!mensagemPayload) return jsonResponse({ success: false, message: "Mensagem não pode estar vazia." }, 400);

    const { data: contaData, error: contaError } = await supabase
      .from("firebird_contas_receber")
      .select("*")
      .eq("id_empresa", idEmpresa)
      .eq("id_ctarec", idCtarec)
      .single();

    if (contaError) throw contaError;
    conta = contaData;
    mensagem = mensagemPayload || montarMensagem(conta);

    if (tipoEnvio === "reenvio" && !jaHouveEnvioWhatsapp(conta)) {
      return jsonResponse({
        success: false,
        message: "Essa conta ainda não teve o primeiro envio. Use Enviar WhatsApp.",
      });
    }

    if (tipoEnvio === "envio" && jaHouveEnvioWhatsapp(conta)) {
      return jsonResponse({
        success: false,
        message: "Mensagem já enviada. Use Reenviar.",
      });
    }

    if (!telefonePayload && !conta.cliente_telefone) {
      throw new Error("Cliente sem telefone cadastrado.");
    }

    conta.cliente_telefone = telefonePayload || conta.cliente_telefone;

const { data: config, error: configError } = await supabase
  .from("tab_btzap_config")
  .select("*")
  .eq("id_empresa", idEmpresa)
  .eq("ativo", true)
  .maybeSingle();

if (configError) {
  return new Response(
    JSON.stringify({
      success: false,
      message: `Erro ao buscar configuração BTZap: ${configError.message}`,
    }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

if (!config) {
  return new Response(
    JSON.stringify({
      success: false,
      message: "Nenhuma configuração BTZap ativa foi encontrada para esta empresa. Acesse Configurações e salve a configuração do BTZap para a empresa logada.",
    }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
    if (configError) throw configError;

    const configErrorMessage = validateBtzapConfig(config);
    if (configErrorMessage) throw new Error(configErrorMessage);

    const result = await sendBtzapMessage(config, {
      phone: conta.cliente_telefone,
      message: mensagem,
    });
    responsePayload = "retorno" in result ? result.retorno ?? null : null;

    if (!result.success) throw new Error(transformarErroEmTexto(result.message));

    const envioId = await registrarHistorico(supabase, idEmpresa, conta, tipoEnvio, mensagem, "enviado", null, responsePayload);
    const agora = new Date().toISOString();
    const totalEnviosAtual = Number(conta.whatsapp_total_envios ?? 0);
    const totalReenviosAtual = Number(conta.whatsapp_total_reenvios ?? 0);
    const novoTotalEnvios = totalEnviosAtual + 1;
    const novoTotalReenvios = tipoEnvio === "reenvio" ? totalReenviosAtual + 1 : totalReenviosAtual;
    const statusExibicao = tipoEnvio === "reenvio" ? `Reenviado ${novoTotalReenvios}` : "Enviado";

    const { error: updateError } = await supabase
      .from("firebird_contas_receber")
      .update({
        whatsapp_status: "enviado",
        whatsapp_primeiro_envio_em: conta.whatsapp_primeiro_envio_em || agora,
        whatsapp_ultimo_envio_em: agora,
        whatsapp_total_envios: novoTotalEnvios,
        whatsapp_ultimo_reenvio_em: tipoEnvio === "reenvio" ? agora : conta.whatsapp_ultimo_reenvio_em,
        whatsapp_total_reenvios: novoTotalReenvios,
        whatsapp_ultimo_erro: null,
        whatsapp_ultimo_tipo: tipoEnvio,
        whatsapp_ultimo_envio_id: envioId,
        whatsapp_status_exibicao: statusExibicao,
      })
      .eq("id_empresa", idEmpresa)
      .eq("id_ctarec", idCtarec);

    if (updateError) throw updateError;

    return jsonResponse({ success: true, message: "Mensagem enviada com sucesso." });
  } catch (error) {
    const errorMessage = transformarErroEmTexto(error);
    const friendlyMessage = criarMensagemAmigavelBtzap(errorMessage);

    if (conta) {
      try {
        const envioId = await registrarHistorico(
          supabase,
          idEmpresa,
          conta,
          tipoEnvio,
          mensagem || montarMensagem(conta),
          "erro",
          errorMessage,
          responsePayload,
        );
        await supabase
          .from("firebird_contas_receber")
          .update({
            whatsapp_status: "erro",
            whatsapp_ultimo_erro: errorMessage,
            whatsapp_ultimo_tipo: tipoEnvio,
            whatsapp_ultimo_envio_id: envioId,
          })
          .eq("id_empresa", idEmpresa)
          .eq("id_ctarec", conta.id_ctarec);
      } catch {
        // Mantem a resposta amigável mesmo se a gravação de auditoria falhar.
      }
    }

    return jsonResponse({
      success: false,
      message: friendlyMessage,
      error: friendlyMessage,
      detail: errorMessage,
    });
  }
});
