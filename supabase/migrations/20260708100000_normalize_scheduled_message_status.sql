update public.tb_msg_programadas
set
  status = 'PENDENTE',
  erro_envio = coalesce(nullif(btrim(erro_envio), ''), case motivo_bloqueio
    when 'bloqueado_fora_horario' then 'Envio pendente: fora do horário permitido.'
    when 'aguardando_horario_permitido' then 'Envio pendente: aguardando próximo horário permitido.'
    when 'bloqueado_limite_minuto' then 'Envio pendente: limite por minuto atingido.'
    when 'bloqueado_limite_diario' then 'Envio pendente: limite diário atingido.'
    when 'bloqueado_limite_categoria_cliente_dia' then 'Envio pendente: cliente atingiu o limite diário desta categoria.'
    when 'bloqueado_dia_nao_permitido' then 'Envio pendente: dia da semana não permitido.'
    when 'bloqueado_feriado' then 'Envio pendente: envio bloqueado em feriado.'
    when 'aguardando_intervalo' then 'Envio pendente: aguardando intervalo entre mensagens.'
    when 'reenvio_agendado' then 'Envio pendente: reenvio agendado.'
    when 'aguardando_parametro' then 'Envio pendente: aguardando regra de envio permitida.'
    when 'falha_sem_parametro_whats' then 'Envio pendente: parâmetros de WhatsApp não configurados.'
    when 'bloqueado_frequencia_cliente' then 'Envio pendente: frequência mínima do cliente ainda não foi atingida.'
    when 'max_tentativas_reenvio' then 'Envio pendente: limite máximo de tentativas de reenvio atingido.'
    else 'Envio pendente: aguardando próxima tentativa permitida.'
  end)
where motivo_bloqueio in (
  'bloqueado_fora_horario',
  'aguardando_horario_permitido',
  'bloqueado_limite_minuto',
  'bloqueado_limite_diario',
  'bloqueado_limite_categoria_cliente_dia',
  'bloqueado_dia_nao_permitido',
  'bloqueado_feriado',
  'aguardando_intervalo',
  'reenvio_agendado',
  'aguardando_parametro',
  'falha_sem_parametro_whats',
  'bloqueado_frequencia_cliente',
  'max_tentativas_reenvio'
)
and status not in ('ENVIADO', 'ENVIADA', 'ERRO');

update public.tb_msg_programadas
set erro_envio = coalesce(nullif(btrim(erro_envio), ''), 'OK')
where status in ('ENVIADO', 'ENVIADA');
