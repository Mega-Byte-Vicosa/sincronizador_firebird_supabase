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

export function extrairDadosInstancia(payload: Record<string, any>) {
  const instance = payload.instance ?? payload;
  const statusPayload = payload.status ?? payload;

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
  };
}
