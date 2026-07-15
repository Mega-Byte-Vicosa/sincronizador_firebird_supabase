export interface BtzapInstanceConfig {
  url_servidor?: string | null;
  token_instancia?: string | null;
  ativo?: boolean | null;
  endpoint_conectar_instancia?: string | null;
  endpoint_status_instancia?: string | null;
}

export function validateInstanceConfig(config: BtzapInstanceConfig | null) {
  if (!config) return "Configuracao BTZap nao encontrada.";
  if (config.ativo === false) return "Configuracao BTZap desativada.";
  if (!config.url_servidor) return "URL do servidor nao configurada.";
  if (!config.token_instancia) return "Token da instancia nao configurado.";

  return null;
}

export function montarEndpoint(urlServidor: string, endpointConfigurado: string | null | undefined, fallback: string) {
  const urlBase = urlServidor.replace(/\/+$/, "");
  const endpointPath = (endpointConfigurado || fallback).trim();

  return `${urlBase}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
}

function formatarNumeroTelefoneConectado(valor: unknown) {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  const numero = texto
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .split(":")[0]
    .replace(/\D/g, "");

  if (numero.length < 10) return null;

  if (numero.startsWith("55") && (numero.length === 12 || numero.length === 13)) {
    const ddd = numero.slice(2, 4);
    const telefone = numero.slice(4);
    if (telefone.length === 9) return `+55 ${ddd} ${telefone.slice(0, 5)}-${telefone.slice(5)}`;
    if (telefone.length === 8) return `+55 ${ddd} ${telefone.slice(0, 4)}-${telefone.slice(4)}`;
  }

  return numero;
}

function obterValorPorCaminho(objeto: unknown, caminho: string[]) {
  return caminho.reduce<unknown>((atual, chave) => {
    if (!atual || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, objeto);
}

function buscarTelefonePorCaminhos(payload: Record<string, any>) {
  const caminhosPrioritarios = [
    ["status", "jid"],
    ["status", "owner"],
    ["status", "ownerJid"],
    ["status", "phone"],
    ["status", "phoneNumber"],
    ["status", "number"],
    ["instance", "jid"],
    ["instance", "owner"],
    ["instance", "ownerJid"],
    ["instance", "phone"],
    ["instance", "phoneNumber"],
    ["instance", "number"],
    ["instance", "user", "id"],
    ["instance", "user", "jid"],
    ["instance", "me", "id"],
    ["instance", "me", "jid"],
    ["user", "id"],
    ["user", "jid"],
    ["me", "id"],
    ["me", "jid"],
    ["data", "status", "jid"],
    ["data", "status", "owner"],
    ["data", "status", "ownerJid"],
    ["data", "instance", "jid"],
    ["data", "instance", "owner"],
    ["data", "instance", "ownerJid"],
    ["data", "instance", "phone"],
    ["data", "instance", "phoneNumber"],
    ["data", "instance", "number"],
    ["data", "instance", "user", "id"],
    ["data", "instance", "user", "jid"],
    ["data", "instance", "me", "id"],
    ["data", "instance", "me", "jid"],
    ["data", "user", "id"],
    ["data", "user", "jid"],
    ["data", "me", "id"],
    ["data", "me", "jid"],
  ];

  for (const caminho of caminhosPrioritarios) {
    const valor = obterValorPorCaminho(payload, caminho);
    if (formatarNumeroTelefoneConectado(valor)) return valor;
  }

  return null;
}

function buscarTelefoneRecursivo(valor: unknown, caminho: string[] = []): unknown {
  if (!valor || typeof valor !== "object" || caminho.length > 6) return null;

  const nomesTelefone = new Set(["jid", "owner", "ownerjid", "phone", "phonenumber", "number", "wid"]);
  const caminhoNormalizado = caminho.map((item) => item.toLowerCase());
  const caminhoDeUsuario = caminhoNormalizado.some((item) => ["user", "me", "profile", "instance", "status"].includes(item));

  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    const chaveNormalizada = chave.toLowerCase();
    const chaveIndicaTelefone =
      nomesTelefone.has(chaveNormalizada) ||
      chaveNormalizada.includes("jid") ||
      chaveNormalizada.includes("phone") ||
      chaveNormalizada.includes("number") ||
      chaveNormalizada.includes("owner") ||
      (chaveNormalizada === "id" && caminhoDeUsuario);

    if (chaveIndicaTelefone && formatarNumeroTelefoneConectado(item)) return item;
  }

  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    const encontrado = buscarTelefoneRecursivo(item, [...caminho, chave]);
    if (encontrado) return encontrado;
  }

  return null;
}

export function extrairDadosInstancia(payload: Record<string, any>) {
  const instance = payload.instance ?? payload;
  const statusPayload = payload.status ?? payload;
  const rawPhoneNumber = buscarTelefonePorCaminhos(payload) ?? buscarTelefoneRecursivo(payload);

  return {
    connected: Boolean(statusPayload.connected ?? instance.connected),
    loggedIn: Boolean(statusPayload.loggedIn ?? instance.loggedIn),
    status: instance.status ?? statusPayload.status ?? null,
    qrcode: instance.qrcode ?? payload.qrcode ?? null,
    paircode: instance.paircode ?? payload.paircode ?? null,
    profileName: instance.profileName ?? payload.profileName ?? null,
    profilePicUrl: instance.profilePicUrl ?? payload.profilePicUrl ?? null,
    lastDisconnect: statusPayload.lastDisconnect ?? instance.lastDisconnect ?? null,
    lastDisconnectReason: statusPayload.lastDisconnectReason ?? instance.lastDisconnectReason ?? null,
    phoneNumber: formatarNumeroTelefoneConectado(rawPhoneNumber),
    rawPhoneNumber,
  };
}
