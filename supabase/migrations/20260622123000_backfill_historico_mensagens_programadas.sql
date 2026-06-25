insert into public.tab_whatsapp_envios (
  id_empresa,
  id_ctarec,
  cliente_nome,
  cliente_telefone,
  origem,
  documento,
  mensagem,
  status,
  tipo_envio,
  erro,
  enviado_em,
  origem_envio,
  origem_modulo,
  id_msg_programada,
  id_origem
)
select
  m.id_empresa,
  case
    when m.origem_modulo = 'CONTA_RECEBER' and m.id_origem ~ '^[0-9]+$'
      then m.id_origem::bigint
    else null
  end,
  m.destinatario_nome,
  m.destinatario_telefone,
  'Mensagem Programada',
  c.documento,
  m.mensagem,
  'enviado',
  'envio',
  null,
  coalesce(m.data_hora_envio, m.atualizado_em),
  'MENSAGEM_PROGRAMADA',
  m.origem_modulo,
  m.id_msg_programada,
  m.id_origem
from public.tb_msg_programadas m
left join public.firebird_contas_receber c
  on c.id_empresa = m.id_empresa
 and c.id_ctarec = case
   when m.origem_modulo = 'CONTA_RECEBER' and m.id_origem ~ '^[0-9]+$'
     then m.id_origem::bigint
   else null
 end
where m.status in ('ENVIADO', 'ENVIADA')
  and m.enviado = true
  and not exists (
    select 1
    from public.tab_whatsapp_envios h
    where h.id_msg_programada = m.id_msg_programada
  );
