type SupabaseAdmin = any;

export interface CriarMensagemProgramadaBloqueioArgs {
  supabase: SupabaseAdmin;
  empresaId: string;
  clienteId?: string | number | null;
  clienteNome?: string | null;
  telefone: string;
  mensagem: string;
  referenciaId?: string | number | null;
  contaReceberId?: string | number | null;
  documentoOrigem?: string | null;
  tipoEnvio?: string | null;
  motivoPendencia?: string | null;
  erroEnvio?: string | null;
  proximaTentativaEm?: string | null;
  parametro?: Record<string, unknown> | null;
  modeloId?: string | null;
  historicoEnvioId?: string | number | null;
}

function normalizarTelefone(valor: string) {
  return String(valor ?? "").replace(/\D/g, "");
}

function isUuid(valor: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(valor ?? ""));
}

function partesDataHoraSaoPaulo(data: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    data: `${get("year")}-${get("month")}-${get("day")}`,
    hora: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

export function calcularTentativaPorIntervalo(horas: unknown, fallbackHoras: number, base = new Date()) {
  const quantidadeHoras = Number(horas ?? fallbackHoras);
  return new Date(base.getTime() + (Number.isFinite(quantidadeHoras) ? quantidadeHoras : fallbackHoras) * 3_600_000).toISOString();
}

export function calcularPrimeiraTentativaBloqueio(validacao: {
  proximaTentativaEm?: string | null;
  parametro?: Record<string, unknown> | null;
}) {
  if (validacao.proximaTentativaEm) return validacao.proximaTentativaEm;
  return calcularTentativaPorIntervalo(validacao.parametro?.intervalo_primeira_tentativa_horas, 2);
}

export function calcularSegundaTentativaBloqueio(parametro?: Record<string, unknown> | null, base = new Date()) {
  return calcularTentativaPorIntervalo(parametro?.intervalo_segunda_tentativa_horas, 24, base);
}

export async function criarOuAtualizarMensagemProgramadaPorBloqueio(args: CriarMensagemProgramadaBloqueioArgs) {
  const telefoneNormalizado = normalizarTelefone(args.telefone);
  const referencia = args.referenciaId ?? args.contaReceberId ?? null;
  const documento = args.documentoOrigem ?? null;
  const primeiraTentativa = args.proximaTentativaEm || calcularPrimeiraTentativaBloqueio({
    proximaTentativaEm: null,
    parametro: args.parametro,
  });
  const partes = partesDataHoraSaoPaulo(new Date(primeiraTentativa));

  let query = args.supabase
    .from("tb_msg_programadas")
    .select("id_msg_programada")
    .eq("id_empresa", args.empresaId)
    .eq("origem_modulo", "CONTA_RECEBER")
    .eq("gerada_por_bloqueio_parametros", true)
    .eq("ativo", true)
    .in("status", ["PENDENTE", "AGENDADO", "AGENDADA"]);

  if (referencia != null) query = query.eq("id_origem", String(referencia));
  if (documento) query = query.eq("documento_origem", documento);
  if (telefoneNormalizado) query = query.eq("destinatario_telefone", telefoneNormalizado);

  const { data: existente, error: buscaError } = await query.order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (buscaError) throw buscaError;

  const payload = {
    id_empresa: args.empresaId,
    origem_modulo: "CONTA_RECEBER",
    id_origem: referencia == null ? null : String(referencia),
    titulo: documento ? `Tentativa WhatsApp - ${documento}` : "Tentativa WhatsApp - Conta a Receber",
    descricao: "Criada automaticamente porque uma tentativa de envio extrapolou os parametros configurados.",
    destinatario_nome: args.clienteNome ?? null,
    destinatario_telefone: telefoneNormalizado || args.telefone,
    mensagem: args.mensagem,
    tipo_agendamento: "UNICO",
    data_envio: partes.data,
    hora_envio: partes.hora,
    executar_em: primeiraTentativa,
    executar_primeira_tentativa_em: primeiraTentativa,
    status: "PENDENTE",
    enviado: false,
    erro_envio: args.erroEnvio ?? null,
    motivo_bloqueio: args.motivoPendencia ?? null,
    motivo_pendencia: args.motivoPendencia ?? null,
    proxima_tentativa_em: primeiraTentativa,
    tentativa_atual: 0,
    gerada_por_bloqueio_parametros: true,
    origem_tentativa: "tentativa_bloqueada_parametros",
    conta_receber_id: isUuid(args.contaReceberId) ? String(args.contaReceberId) : null,
    documento_origem: documento,
    historico_envio_id: isUuid(args.historicoEnvioId) ? String(args.historicoEnvioId) : null,
    tipo_envio: args.tipoEnvio || "cobranca",
    modelo_id: args.modeloId ?? null,
    ativo: true,
  };

  if (existente?.id_msg_programada) {
    const { data, error } = await args.supabase
      .from("tb_msg_programadas")
      .update(payload)
      .eq("id_msg_programada", existente.id_msg_programada)
      .select("id_msg_programada, executar_primeira_tentativa_em, executar_segunda_tentativa_em")
      .single();
    if (error) throw error;
    return { id: data.id_msg_programada, criada: false, atualizada: true, executarPrimeiraTentativaEm: data.executar_primeira_tentativa_em, executarSegundaTentativaEm: data.executar_segunda_tentativa_em ?? null };
  }

  const { data, error } = await args.supabase
    .from("tb_msg_programadas")
    .insert(payload)
    .select("id_msg_programada, executar_primeira_tentativa_em, executar_segunda_tentativa_em")
    .single();
  if (error) throw error;
  return { id: data.id_msg_programada, criada: true, atualizada: false, executarPrimeiraTentativaEm: data.executar_primeira_tentativa_em, executarSegundaTentativaEm: data.executar_segunda_tentativa_em ?? null };
}
