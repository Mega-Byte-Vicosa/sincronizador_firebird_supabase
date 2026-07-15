function valorTexto(valor: unknown) {
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  if (typeof valor === "number") return String(valor);
  return null;
}

function valorPorCaminho(payload: unknown, caminho: string[]) {
  return caminho.reduce<unknown>((atual, chave) => {
    if (!atual || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, payload);
}

function buscarPorChaves(payload: unknown, chaves: string[], profundidade = 0): unknown {
  if (!payload || typeof payload !== "object" || profundidade > 6) return null;
  const alvo = new Set(chaves.map((chave) => chave.toLowerCase()));

  for (const [chave, valor] of Object.entries(payload as Record<string, unknown>)) {
    if (alvo.has(chave.toLowerCase())) return valor;
  }

  for (const valor of Object.values(payload as Record<string, unknown>)) {
    const encontrado = buscarPorChaves(valor, chaves, profundidade + 1);
    if (encontrado !== null && encontrado !== undefined) return encontrado;
  }

  return null;
}

export function extrairMensagemIdExterno(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;

  const candidatos = [
    body.messageId,
    body.message_id,
    body.messageid,
    body.btzap_message_id,
    body.remote_id,
    body.external_id,
    body.key?.remoteJid ? body.key?.id : null,
    body.key?.id,
    body.data?.messageId,
    body.data?.message_id,
    body.data?.messageid,
    body.data?.btzap_message_id,
    body.data?.remote_id,
    body.data?.external_id,
    body.data?.key?.id,
    body.data?.message?.key?.id,
    body.data?.messages?.[0]?.key?.id,
    body.data?.messages?.[0]?.messageId,
    body.data?.messages?.[0]?.message_id,
    body.result?.messageId,
    body.result?.message_id,
    body.result?.messageid,
    body.result?.btzap_message_id,
    body.result?.remote_id,
    body.result?.external_id,
    body.result?.key?.id,
    body.retorno?.messageId,
    body.retorno?.message_id,
    body.retorno?.messageid,
    body.retorno?.id,
    body.retorno?.key?.id,
    body.retorno?.data?.messageId,
    body.retorno?.data?.message_id,
    body.retorno?.data?.messageid,
    body.retorno?.data?.id,
    body.retorno?.data?.key?.id,
    body.retorno?.result?.messageId,
    body.retorno?.result?.message_id,
    body.retorno?.result?.id,
    body.response?.messageId,
    body.response?.message_id,
    body.response?.id,
    body.id,
    body.data?.id,
    body.result?.id,
    valorPorCaminho(body, ["response", "messageId"]),
    valorPorCaminho(body, ["response", "message_id"]),
    valorPorCaminho(body, ["response", "id"]),
    buscarPorChaves(body, ["messageId", "message_id", "messageid", "btzap_message_id"]),
  ];

  for (const candidato of candidatos) {
    const id = valorTexto(candidato);
    if (id) return id;
  }

  return null;
}

export function extrairStatusEvento(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;
  const candidatos = [
    body.status,
    body.ack,
    body.data?.status,
    body.data?.ack,
    body.data?.update,
    body.data?.message?.status,
    body.data?.message?.ack,
    body.data?.messages?.[0]?.status,
    body.data?.messages?.[0]?.ack,
    body.result?.status,
    body.result?.ack,
    buscarPorChaves(body, ["status", "ack"]),
  ];

  for (const candidato of candidatos) {
    const status = valorTexto(candidato);
    if (status) return status;
  }

  return null;
}

export function extrairTipoEvento(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;
  const candidatos = [
    body.event,
    body.type,
    body.eventType,
    body.webhookEvent,
    body.data?.event,
    body.data?.type,
    body.data?.eventType,
    body.result?.event,
    body.result?.type,
  ];

  for (const candidato of candidatos) {
    const tipo = valorTexto(candidato);
    if (tipo) return tipo;
  }

  return null;
}

export function extrairTimestampEvento(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;
  const candidatos = [
    body.timestamp,
    body.time,
    body.createdAt,
    body.data?.timestamp,
    body.data?.time,
    body.data?.createdAt,
    body.result?.timestamp,
    body.result?.time,
    body.result?.createdAt,
  ];

  for (const candidato of candidatos) {
    const valor = valorTexto(candidato);
    if (!valor) continue;
    const numero = Number(valor);
    const data = Number.isFinite(numero)
      ? new Date(numero > 10_000_000_000 ? numero : numero * 1000)
      : new Date(valor);
    if (!Number.isNaN(data.getTime())) return data.toISOString();
  }

  return null;
}

export function extrairErroEvento(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;
  const candidatos = [
    body.error,
    body.erro,
    body.message,
    body.reason,
    body.data?.error,
    body.data?.erro,
    body.data?.message,
    body.data?.reason,
    body.result?.error,
    body.result?.message,
    body.result?.reason,
  ];

  for (const candidato of candidatos) {
    const erro = valorTexto(candidato);
    if (erro) return erro;
  }

  return null;
}

export function normalizarStatusEntrega(status: string | null | undefined) {
  const valor = String(status ?? "").trim().toLowerCase();
  if (["1", "sent", "enviado", "send", "message.sent", "messages.upsert", "server_ack"].includes(valor)) return "ENVIADO_API";
  if (["2", "3", "delivered", "entrega", "entregue", "delivery", "message.delivered", "device_ack"].includes(valor)) return "ENTREGUE";
  if (["4", "read", "lido", "leitura", "visualizado", "viewed", "message.read", "read_ack"].includes(valor)) return "LIDO";
  if (["-1", "failed", "fail", "erro", "error", "undelivered", "message.failed"].includes(valor)) return "FALHOU";
  return null;
}
