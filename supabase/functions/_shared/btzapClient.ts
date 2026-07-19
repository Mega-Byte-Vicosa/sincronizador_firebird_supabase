export interface BtzapConfig {
  nome_instancia: string | null;
  token_instancia: string | null;
  url_servidor: string | null;
  endpoint_envio_texto?: string | null;
  endpoint_envio_media?: string | null;
  metodo_envio_texto?: string | null;
  formato_payload?: string | null;
  ativo: boolean | null;
}

export interface SendMessageParams {
  phone: string;
  message: string;
}

export interface SendMediaMessageParams {
  phone: string;
  type: "image" | "video" | "audio" | "ptt" | "myaudio" | "document";
  file: string;
  caption?: string | null;
  filename?: string | null;
}

function normalizarTelefone(phone: string) {
  return phone.replace(/\D/g, "");
}

function montarPayload(formatoPayload: string | null | undefined, telefoneNormalizado: string, mensagem: string) {
  if ((formatoPayload || "btzap") === "btzap" || formatoPayload === "evolution") {
    return {
      number: telefoneNormalizado,
      text: mensagem,
    };
  }

  return {
    number: telefoneNormalizado,
    text: mensagem,
  };
}

function montarPayloadMedia(_formatoPayload: string | null | undefined, params: SendMediaMessageParams) {
  const payload: Record<string, unknown> = {
    number: normalizarTelefone(params.phone),
    type: params.type,
    file: params.file,
  };

  if (params.caption && ["image", "video"].includes(params.type)) payload.caption = params.caption;
  if (params.filename && params.type === "document") payload.filename = params.filename;

  return payload;
}

function textoDoRetorno(retorno: unknown): string {
  if (retorno === null || retorno === undefined) return "";
  if (typeof retorno === "string") return retorno;
  if (typeof retorno === "number" || typeof retorno === "boolean") return String(retorno);

  if (Array.isArray(retorno)) {
    return retorno.map((item) => textoDoRetorno(item)).filter(Boolean).join(" | ");
  }

  if (typeof retorno === "object") {
    const objeto = retorno as Record<string, unknown>;
    const camposPrioritarios = ["message", "error", "detail", "details", "description"];
    const mensagens = camposPrioritarios.map((campo) => textoDoRetorno(objeto[campo])).filter(Boolean);

    if (mensagens.length > 0) return [...new Set(mensagens)].join(" | ");

    try {
      return JSON.stringify(retorno);
    } catch {
      return "Retorno inválido do BTZap.";
    }
  }

  return String(retorno);
}

async function lerRetorno(response: Response) {
  const text = await response.text();

  if (!text) return "";

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mensagemAmigavelBtzap(status: number, retorno: unknown) {
  const retornoTexto = textoDoRetorno(retorno);
  const retornoLower = retornoTexto.toLowerCase();

  if (retornoLower.includes("not on whatsapp") || retornoLower.includes("is not on whatsapp")) {
    return "Não foi possível enviar: este número não possui WhatsApp ou está inválido.";
  }

  if (status === 401 || status === 403 || retornoLower.includes("unauthorized") || retornoLower.includes("token")) {
    return "Não foi possível enviar: token ou autenticação do BTZap inválida.";
  }

  if (retornoLower.includes("instance") || retornoLower.includes("instância") || retornoLower.includes("disconnected")) {
    return "Não foi possível enviar: a instância do WhatsApp/BTZap pode estar desconectada.";
  }

  return retornoTexto || `Erro BTZap HTTP ${status}.`;
}

export function validateBtzapConfig(config: BtzapConfig) {
  if (!config.url_servidor) return "URL do servidor não configurada.";
  if (!config.nome_instancia) return "Nome da instância não configurado.";
  if (!config.token_instancia) return "Token da instância não configurado.";
  if (config.ativo === false) return "Configuração BTZap desativada.";

  return null;
}

export async function testBtzapConnection(config: BtzapConfig) {
  const validationError = validateBtzapConfig(config);

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  return {
    success: false,
    message: "Não foi possível validar a conexão BTZap. Endpoint de validação não configurado.",
  };
}

export async function sendBtzapMessage(config: BtzapConfig, params: SendMessageParams) {
  const validationError = validateBtzapConfig(config);

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  const urlBase = config.url_servidor!.replace(/\/+$/, "");
  const endpointTemplate = config.endpoint_envio_texto || "/send/text";
  const endpointPath = endpointTemplate.replace("{instance}", encodeURIComponent(config.nome_instancia!));
  const endpoint = `${urlBase}${endpointPath.startsWith("/") ? endpointPath : "/" + endpointPath}`;
  const method = (config.metodo_envio_texto || "POST").trim().toUpperCase();
  const payload = montarPayload(config.formato_payload, normalizarTelefone(params.phone), params.message);

  const response = await fetch(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: config.token_instancia!,
    },
    body: JSON.stringify(payload),
  });

  const retorno = await lerRetorno(response);

  if (!response.ok) {
    return {
      success: false,
      message: mensagemAmigavelBtzap(response.status, retorno),
      detail: textoDoRetorno(retorno),
      endpoint,
      payload,
      retorno,
      status: response.status,
    };
  }

  return {
    success: true,
    message: "Mensagem enviada com sucesso.",
    endpoint,
    payload,
    retorno,
    status: response.status,
  };
}

export async function sendBtzapMediaMessage(config: BtzapConfig, params: SendMediaMessageParams) {
  const validationError = validateBtzapConfig(config);

  if (validationError) {
    return {
      success: false,
      message: validationError,
    };
  }

  const urlBase = config.url_servidor!.replace(/\/+$/, "");
  const endpointTemplate = config.endpoint_envio_media || "/send/media";
  const endpointPath = endpointTemplate.replace("{instance}", encodeURIComponent(config.nome_instancia!));
  const endpoint = `${urlBase}${endpointPath.startsWith("/") ? endpointPath : "/" + endpointPath}`;
  const method = (config.metodo_envio_texto || "POST").trim().toUpperCase();
  const payload = montarPayloadMedia(config.formato_payload, params);

  const response = await fetch(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: config.token_instancia!,
    },
    body: JSON.stringify(payload),
  });

  const retorno = await lerRetorno(response);

  if (!response.ok) {
    return {
      success: false,
      message: mensagemAmigavelBtzap(response.status, retorno),
      detail: textoDoRetorno(retorno),
      endpoint,
      payload,
      retorno,
      status: response.status,
    };
  }

  return {
    success: true,
    message: "Mídia enviada com sucesso.",
    endpoint,
    payload,
    retorno,
    status: response.status,
  };
}
