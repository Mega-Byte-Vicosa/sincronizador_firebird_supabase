update public.tab_whatsapp_envios
set
  status = 'pendente',
  erro = coalesce(nullif(btrim(erro), ''), case motivo_bloqueio
    when 'bloqueado_fora_horario' then 'Envio pendente: fora do horário permitido.'
    when 'aguardando_horario_permitido' then 'Envio pendente: aguardando próximo horário permitido.'
    when 'bloqueado_limite_minuto' then 'Envio pendente: limite de mensagens por minuto atingido.'
    when 'bloqueado_limite_diario' then 'Envio pendente: limite diário de mensagens atingido.'
    when 'bloqueado_limite_categoria_cliente_dia' then 'Envio pendente: cliente atingiu o limite diário desta categoria.'
    when 'bloqueado_dia_nao_permitido' then 'Envio pendente: dia da semana não permitido para envio.'
    when 'bloqueado_feriado' then 'Envio pendente: envio bloqueado em feriado.'
    when 'aguardando_intervalo' then 'Envio pendente: aguardando intervalo entre mensagens.'
    when 'reenvio_agendado' then 'Envio pendente: reenvio agendado.'
    when 'bloqueado_frequencia_cliente' then 'Envio pendente: frequência mínima do cliente ainda não foi atingida.'
    when 'falha_sem_parametro_whats' then 'Envio pendente: parâmetros de WhatsApp não configurados.'
    when 'aguardando_parametro' then 'Envio pendente: aguardando regra de envio permitida.'
    when 'max_tentativas_reenvio' then 'Envio pendente: limite máximo de tentativas de reenvio atingido.'
    else 'Envio pendente: aguardando regra de envio permitida.'
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
  'bloqueado_frequencia_cliente',
  'falha_sem_parametro_whats',
  'aguardando_parametro',
  'max_tentativas_reenvio'
);

update public.tab_whatsapp_envios
set erro = 'OK'
where lower(coalesce(status, '')) in ('enviado', 'sent', 'delivered', 'read', 'sucesso', 'processado')
  and (erro is null or btrim(erro) = '');
