type SupabaseAdmin = any;

export type TipoEnvioWhats = "geral" | "cobranca" | "campanha_promocao" | "aniversario" | "mensagem_programada";

export interface ProcessarEnvioArgs {
  supabase: SupabaseAdmin;
  empresaId: string;
  tipoEnvio?: string | null;
  clienteId?: string | number | null;
  clienteNome?: string | null;
  documento?: string | null;
  telefone: string;
  mensagem: string;
  origem?: string | null;
  referenciaId?: string | number | null;
  modeloId?: string | null;
  tentativaAtual?: number;
  enviarBtzap: () => Promise<unknown>;
}

const TIPOS = new Set<TipoEnvioWhats>(["geral", "cobranca", "campanha_promocao", "aniversario", "mensagem_programada"]);
const BLOQUEIOS_TEMPORARIOS = new Set([
  "aguardando_horario_permitido", "bloqueado_dia_nao_permitido", "bloqueado_feriado",
  "bloqueado_fora_horario", "bloqueado_limite_minuto", "bloqueado_limite_diario",
  "bloqueado_frequencia_cliente", "bloqueado_limite_categoria_cliente_dia", "aguardando_intervalo", "reenvio_agendado",
]);
const MOTIVOS_PENDENTES = new Set([
  ...BLOQUEIOS_TEMPORARIOS,
  "falha_sem_parametro_whats",
  "aguardando_parametro",
  "max_tentativas_reenvio",
]);

export function normalizarTipoEnvio(valor?: string | null): TipoEnvioWhats {
  const tipo = String(valor ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s/-]+/g, "_");
  if (["cobranca", "contas_a_receber", "conta_receber", "reenvio", "envio_cobranca"].includes(tipo)) return "cobranca";
  if (["campanha", "promocao", "campanha_promocao", "marketing"].includes(tipo)) return "campanha_promocao";
  if (["aniversario", "aniversariantes"].includes(tipo)) return "aniversario";
  if (["mensagem_programada", "programada", "manual"].includes(tipo)) return "mensagem_programada";
  return TIPOS.has(tipo as TipoEnvioWhats) ? tipo as TipoEnvioWhats : "geral";
}

export function sortearIntervaloSegundos(minimo: number, maximo: number) {
  const min = Math.max(0, Math.floor(Number(minimo) || 0));
  const max = Math.max(min, Math.floor(Number(maximo) || min));
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function motivoPendenteEnvio(motivo?: string | null) {
  return MOTIVOS_PENDENTES.has(String(motivo ?? ""));
}

export function mensagemRetornoEnvio(motivo?: string | null, detalhe?: unknown) {
  const detalheTexto = detalhe == null ? "" : String(detalhe).trim();
  if (detalheTexto) return detalheTexto;
  const mensagens: Record<string, string> = {
    bloqueado_fora_horario: "Envio pendente: fora do horário permitido.",
    aguardando_horario_permitido: "Envio pendente: aguardando próximo horário permitido.",
    bloqueado_limite_minuto: "Envio pendente: limite de mensagens por minuto atingido.",
    bloqueado_limite_diario: "Envio pendente: limite diário de mensagens atingido.",
    bloqueado_limite_categoria_cliente_dia: "Envio pendente: cliente atingiu o limite diário desta categoria.",
    bloqueado_dia_nao_permitido: "Envio pendente: dia da semana não permitido para envio.",
    bloqueado_feriado: "Envio pendente: envio bloqueado em feriado.",
    aguardando_intervalo: "Envio pendente: aguardando intervalo entre mensagens.",
    reenvio_agendado: "Envio pendente: reenvio agendado.",
    bloqueado_frequencia_cliente: "Envio pendente: frequência mínima do cliente ainda não foi atingida.",
    falha_sem_parametro_whats: "Envio pendente: parâmetros de WhatsApp não configurados.",
    aguardando_parametro: "Envio pendente: aguardando regra de envio permitida.",
    max_tentativas_reenvio: "Envio pendente: limite máximo de tentativas de reenvio atingido.",
    erro_btzap: "Erro técnico no BTZap.",
    erro_whatsapp: "Erro técnico no WhatsApp.",
    timeout: "Erro técnico: tempo limite excedido.",
    erro_internet: "Erro técnico de internet ou conexão.",
    falha_api: "Erro técnico na API de envio.",
    erro_conexao: "Erro técnico de conexão.",
    erro_tecnico: "Erro técnico no envio.",
    erro_inesperado: "Erro inesperado no envio.",
  };
  return mensagens[String(motivo ?? "")] || "Envio pendente: aguardando regra de envio permitida.";
}

function partesAgora(timeZone: string) {
  const agora = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(agora);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { agora, data: `${get("year")}-${get("month")}-${get("day")}`, horario: `${get("hour")}:${get("minute")}:${get("second")}`, weekday: get("weekday").toLowerCase() };
}

function inicioProximoDia() { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(11, 0, 0, 0); return d.toISOString(); }
function depoisDe(segundos: number) { return new Date(Date.now() + Math.max(1, segundos) * 1000).toISOString(); }

function dataLocalNoHorario(dataLocal: string, horario: string | null | undefined, timeZone: string) {
  const [ano, mes, dia] = dataLocal.split("-").map(Number);
  const [hora, minuto] = String(horario || "08:00").slice(0, 5).split(":").map(Number);
  let timestamp = Date.UTC(ano, mes - 1, dia, hora, minuto);
  for (let i = 0; i < 3; i++) {
    const partes = partesAgoraEm(new Date(timestamp), timeZone);
    const desejado = Date.UTC(ano, mes - 1, dia, hora, minuto);
    const atual = Date.UTC(partes.ano, partes.mes - 1, partes.dia, partes.hora, partes.minuto);
    timestamp += desejado - atual;
  }
  return new Date(timestamp).toISOString();
}

function proximoDiaNoHorario(dataLocal: string, horario: string | null | undefined, timeZone: string) {
  const [ano, mes, dia] = dataLocal.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  const chave = `${proximo.getUTCFullYear()}-${String(proximo.getUTCMonth() + 1).padStart(2, "0")}-${String(proximo.getUTCDate()).padStart(2, "0")}`;
  return dataLocalNoHorario(chave, horario, timeZone);
}

function partesAgoraEm(data: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(data);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { ano: get("year"), mes: get("month"), dia: get("day"), hora: get("hour"), minuto: get("minute") };
}

export async function buscarParametroWhats(supabase: SupabaseAdmin, empresaId: string, _tipoEnvio: string) {
  await supabase.rpc("fn_garantir_parametros_whats_empresa", { p_empresa_id: empresaId });
  const { data, error } = await supabase.from("tab_parametro_whats").select("*").eq("empresa_id", empresaId).eq("tipo_envio", "geral").eq("ativo", true).maybeSingle();
  if (error) throw error;
  return data;
}

export function calcularProximaTentativa(parametro: any, tentativaAtual = 0) {
  const horas = tentativaAtual <= 0 ? parametro?.intervalo_primeira_tentativa_horas
    : tentativaAtual === 1 ? parametro?.intervalo_segunda_tentativa_horas : null;
  if (horas != null) return new Date(Date.now() + Number(horas) * 3600000).toISOString();
  if (parametro?.intervalo_reenvio_min_horas != null) {
    const min = Number(parametro.intervalo_reenvio_min_horas);
    const max = Math.max(min, Number(parametro.intervalo_reenvio_max_horas ?? min));
    return new Date(Date.now() + (min + Math.random() * (max - min)) * 3600000).toISOString();
  }
  return null;
}

export async function validarParametrosEnvioWhats(args: Omit<ProcessarEnvioArgs, "enviarBtzap">) {
  const { supabase, empresaId, telefone, clienteId, tentativaAtual = 0 } = args;
  const tipo = normalizarTipoEnvio(args.tipoEnvio);
  const parametro = await buscarParametroWhats(supabase, empresaId, tipo);
  if (!parametro) return { podeEnviar: false, motivo: "falha_sem_parametro_whats", proximaTentativaEm: null };
  if (tentativaAtual > Number(parametro.max_tentativas_reenvio ?? 0)) {
    return {
      podeEnviar: false,
      motivo: "max_tentativas_reenvio",
      detalhe: "Limite máximo de tentativas de reenvio atingido. A mensagem não será reenviada automaticamente.",
      parametro,
      parametroId: parametro.id,
      proximaTentativaEm: null,
    };
  }

  const local = partesAgora(parametro.timezone || "America/Sao_Paulo");
  const dias: Record<string, string> = { mon: "permite_segunda", tue: "permite_terca", wed: "permite_quarta", thu: "permite_quinta", fri: "permite_sexta", sat: "permite_sabado", sun: "permite_domingo" };
  if (parametro[dias[local.weekday]] !== true) return { podeEnviar: false, motivo: "bloqueado_dia_nao_permitido", parametro, parametroId: parametro.id, proximaTentativaEm: inicioProximoDia() };

  if (!parametro.enviar_feriado) {
    const { data: feriado, error } = await supabase.from("tab_feriados").select("id").eq("data", local.data).eq("ativo", true).or(`empresa_id.is.null,empresa_id.eq.${empresaId}`).limit(1);
    if (error) throw error;
    if (feriado?.length) return { podeEnviar: false, motivo: "bloqueado_feriado", parametro, parametroId: parametro.id, proximaTentativaEm: inicioProximoDia() };
  }

  const hora = local.horario.slice(0, 5);
  const dentro = (inicio?: string | null, fim?: string | null) => !inicio || !fim || (hora >= inicio.slice(0, 5) && hora <= fim.slice(0, 5));
  const horarioPermitido = parametro.usar_janelas_envio
    ? dentro(parametro.janela_manha_inicio, parametro.janela_manha_fim) || dentro(parametro.janela_tarde_inicio, parametro.janela_tarde_fim)
    : dentro(parametro.horario_inicio, parametro.horario_fim);
  if (!horarioPermitido) return { podeEnviar: false, motivo: "bloqueado_fora_horario", parametro, parametroId: parametro.id, proximaTentativaEm: inicioProximoDia() };

  const minuto = new Date(); minuto.setSeconds(0, 0);
  const inicioDia = dataLocalNoHorario(local.data, "00:00", parametro.timezone || "America/Sao_Paulo");
  const base = () => supabase.from("tab_whatsapp_envios").select("id", { count: "exact", head: true }).eq("id_empresa", empresaId).eq("status", "enviado");
  const [porMinuto, porDia] = await Promise.all([base().gte("processado_em", minuto.toISOString()), base().gte("processado_em", inicioDia)]);
  if (porMinuto.error) throw porMinuto.error; if (porDia.error) throw porDia.error;
  if ((porMinuto.count ?? 0) >= Number(parametro.max_mensagens_por_minuto)) return { podeEnviar: false, motivo: "bloqueado_limite_minuto", parametro, parametroId: parametro.id, proximaTentativaEm: depoisDe(60) };
  const limiteDia = Number(parametro.usar_limite_estavel ? parametro.max_mensagens_por_dia_estavel : parametro.max_mensagens_por_dia_inicial);
  if (limiteDia > 0 && (porDia.count ?? 0) >= limiteDia) return { podeEnviar: false, motivo: "bloqueado_limite_diario", parametro, parametroId: parametro.id, proximaTentativaEm: inicioProximoDia() };

  const limiteCategoriaCliente = Number(parametro.max_mensagens_cliente_categoria_dia ?? 2);
  if (limiteCategoriaCliente > 0) {
    let porClienteCategoria = supabase.from("tab_whatsapp_envios").select("id", { count: "exact", head: true })
      .eq("id_empresa", empresaId).eq("categoria_envio", tipo).in("status", ["enviado", "sent", "delivered", "read", "processado", "sucesso"])
      .gte("processado_em", inicioDia);
    porClienteCategoria = clienteId != null ? porClienteCategoria.eq("cliente_id", String(clienteId)) : porClienteCategoria.eq("cliente_telefone", telefone);
    const contagemCategoria = await porClienteCategoria;
    if (contagemCategoria.error) throw contagemCategoria.error;
    if ((contagemCategoria.count ?? 0) >= limiteCategoriaCliente) {
      return {
        podeEnviar: false, motivo: "bloqueado_limite_categoria_cliente_dia", parametro, parametroId: parametro.id,
        proximaTentativaEm: proximoDiaNoHorario(local.data, parametro.horario_inicio, parametro.timezone || "America/Sao_Paulo"),
      };
    }
  }

  const intervalo = sortearIntervaloSegundos(parametro.intervalo_min_segundos, parametro.intervalo_max_segundos);
  const ultimo = await supabase.from("tab_whatsapp_envios").select("processado_em").eq("id_empresa", empresaId).eq("status", "enviado").order("processado_em", { ascending: false }).limit(1).maybeSingle();
  if (ultimo.error) throw ultimo.error;
  if (ultimo.data?.processado_em) {
    const restante = intervalo - Math.floor((Date.now() - new Date(ultimo.data.processado_em).getTime()) / 1000);
    if (restante > 0) return { podeEnviar: false, motivo: "aguardando_intervalo", parametro, parametroId: parametro.id, intervaloSorteadoSegundos: intervalo, proximaTentativaEm: depoisDe(restante) };
  }
  return { podeEnviar: true, parametro, parametroId: parametro.id, intervaloSorteadoSegundos: intervalo, proximaTentativaEm: null };
}

async function registrar(args: Omit<ProcessarEnvioArgs, "enviarBtzap">, validacao: any, status: string, erro?: string | null, retorno?: unknown) {
  const motivo = validacao.motivo ?? null;
  const statusHistorico = status === "enviado" ? "enviado" : motivoPendenteEnvio(motivo) || status === "pendente" ? "pendente" : "erro";
  const retornoErro = statusHistorico === "enviado" ? "OK" : erro ?? mensagemRetornoEnvio(motivo, validacao.detalhe);
  const payload = {
    id_empresa: args.empresaId, cliente_id: args.clienteId == null ? null : String(args.clienteId), cliente_nome: args.clienteNome ?? null,
    cliente_telefone: args.telefone, documento: args.documento ?? null,
    origem: args.origem || "WhatsApp", mensagem: args.mensagem, status: statusHistorico,
    tipo_envio: normalizarTipoEnvio(args.tipoEnvio), categoria_envio: normalizarTipoEnvio(args.tipoEnvio),
    operacao_envio: Number(args.tentativaAtual ?? 0) > 0 ? "reenvio" : "envio",
    provider: "btzap", erro: retornoErro, motivo_bloqueio: motivo, proxima_tentativa_em: validacao.proximaTentativaEm ?? null,
    tentativas: args.tentativaAtual ?? 0, parametro_whats_id: validacao.parametroId ?? null, intervalo_sorteado_segundos: validacao.intervaloSorteadoSegundos ?? null,
    processado_em: status === "enviado" ? new Date().toISOString() : null, enviado_em: status === "enviado" ? new Date().toISOString() : null,
    referencia_id: args.referenciaId == null ? null : String(args.referenciaId), modelo_id: args.modeloId ?? null, response_payload: retorno ?? null,
  };
  const { data, error } = await args.supabase.from("tab_whatsapp_envios").insert(payload).select("id").single();
  if (error) throw error; return data?.id ?? null;
}

export async function registrarBloqueioEnvioWhats(args: Omit<ProcessarEnvioArgs, "enviarBtzap">, validacao: any) { return registrar(args, validacao, motivoPendenteEnvio(validacao.motivo) ? "pendente" : validacao.motivo || "aguardando_parametro", validacao.detalhe ?? null); }
export async function registrarSucessoEnvioWhats(args: Omit<ProcessarEnvioArgs, "enviarBtzap">, validacao: any, retorno: unknown) { return registrar(args, validacao, "enviado", null, retorno); }
export async function podeEnviarMensagemWhatsApp(args: Omit<ProcessarEnvioArgs, "enviarBtzap">) { return validarParametrosEnvioWhats(args); }

export async function processarEnvioWhatsApp(args: ProcessarEnvioArgs) {
  const base = { ...args }; delete (base as any).enviarBtzap;
  const validacao = await validarParametrosEnvioWhats(base);
  if (!validacao.podeEnviar) {
    const historicoId = await registrarBloqueioEnvioWhats(base, validacao);
    return { enviado: false, bloqueado: true, temporario: BLOQUEIOS_TEMPORARIOS.has(String(validacao.motivo)), historicoId, ...validacao };
  }
  try {
    const retornoBtzap = await args.enviarBtzap();
    const historicoId = await registrarSucessoEnvioWhats(base, validacao, retornoBtzap);
    return { enviado: true, bloqueado: false, historicoId, retornoBtzap, ...validacao };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    const proximaTentativaEm = calcularProximaTentativa(validacao.parametro, args.tentativaAtual ?? 0);
    const erroValidacao = { ...validacao, motivo: "erro_btzap", proximaTentativaEm };
    const historicoId = await registrar(base, erroValidacao, proximaTentativaEm ? "reenvio_agendado" : "erro_btzap", motivo);
    return { enviado: false, bloqueado: true, temporario: Boolean(proximaTentativaEm), motivo: "erro_btzap", detalhe: motivo, proximaTentativaEm, historicoId };
  }
}
