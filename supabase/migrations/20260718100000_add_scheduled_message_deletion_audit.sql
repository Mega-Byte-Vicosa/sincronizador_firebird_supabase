alter table public.tb_msg_programadas
  add column if not exists excluido_em timestamptz,
  add column if not exists excluido_por uuid;

comment on column public.tb_msg_programadas.excluido_em is
  'Data e hora da exclusao logica da mensagem programada.';

comment on column public.tb_msg_programadas.excluido_por is
  'Usuario responsavel pela exclusao logica da mensagem programada.';

create index if not exists idx_tb_msg_programadas_empresa_excluido_em
  on public.tb_msg_programadas (id_empresa, excluido_em desc)
  where ativo = false;
