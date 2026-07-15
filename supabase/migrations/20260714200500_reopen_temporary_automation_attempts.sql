update public.tab_automacao_execucao_itens
set
  status = 'pendente',
  tentativa_atual = least(coalesce(tentativa_atual, 0), 1),
  proxima_tentativa_em = coalesce(proxima_tentativa_em, now() + interval '5 minutes'),
  atualizado_em = now()
where status = 'erro'
  and (
    motivo_bloqueio in (
      'aguardando_intervalo',
      'bloqueado_limite_minuto',
      'bloqueado_limite_diario',
      'aguardando_horario_permitido',
      'bloqueado_dia_nao_permitido',
      'bloqueado_feriado',
      'bloqueado_fora_horario',
      'bloqueado_frequencia_cliente',
      'bloqueado_limite_categoria_cliente_dia',
      'reenvio_agendado'
    )
    or erro_envio in (
      'aguardando_intervalo',
      'bloqueado_limite_minuto',
      'bloqueado_limite_diario',
      'aguardando_horario_permitido',
      'bloqueado_dia_nao_permitido',
      'bloqueado_feriado',
      'bloqueado_fora_horario',
      'bloqueado_frequencia_cliente',
      'bloqueado_limite_categoria_cliente_dia',
      'reenvio_agendado'
    )
    or erro_envio ilike 'Envio pendente:%'
  );
