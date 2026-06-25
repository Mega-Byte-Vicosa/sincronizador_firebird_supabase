function valorTexto(valor: unknown) {
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  if (typeof valor === "number") return String(valor);
  return null;
}

export function extrairMensagemIdExterno(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, any>;

  const candidatos = [
    body.messageId,
    body.message_id,
    body.messageid,
    body.key?.id,
    body.data?.messageId,
    body.data?.message_id,
    body.data?.messageid,
    body.data?.key?.id,
    body.result?.messageId,
    body.result?.message_id,
    body.result?.messageid,
    body.result?.key?.id,
    body.id,
    body.data?.id,
    body.result?.id,
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
    body.event,
    body.type,
    body.data?.status,
    body.data?.event,
    body.data?.type,
    body.result?.status,
  ];

  for (const candidato of candidatos) {
    const status = valorTexto(candidato);
    if (status) return status;
  }

  return null;
}

export function normalizarStatusEntrega(status: string | null | undefined) {
  const valor = String(status ?? "").trim().toLowerCase();
  if (["sent", "enviado", "send", "message.sent", "messages.upsert", "server_ack"].includes(valor)) return "ENVIADO_API";
  if (["delivered", "entregue", "delivery", "message.delivered", "device_ack"].includes(valor)) return "ENTREGUE";
  if (["read", "lido", "leitura", "message.read", "read_ack"].includes(valor)) return "LIDO";
  if (["failed", "fail", "erro", "error", "message.failed"].includes(valor)) return "FALHOU";
  return null;
}
