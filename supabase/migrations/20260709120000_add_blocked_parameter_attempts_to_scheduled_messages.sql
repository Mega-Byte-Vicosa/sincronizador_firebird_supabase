alter table public.tb_msg_programadas
  add column if not exists executar_primeira_tentativa_em timestamp with time zone null;

alter table public.tb_msg_programadas
  add column if not exists executar_segunda_tentativa_em timestamp with time zone null;

alter table public.tb_msg_programadas
  add column if not exists tentativa_atual integer not null default 0;

alter table public.tb_msg_programadas
  add column if not exists gerada_por_bloqueio_parametros boolean not null default false;

alter table public.tb_msg_programadas
  add column if not exists motivo_pendencia text null;

alter table public.tb_msg_programadas
  add column if not exists origem_tentativa text null;

alter table public.tb_msg_programadas
  add column if not exists conta_receber_id uuid null;

alter table public.tb_msg_programadas
  add column if not exists documento_origem text null;

alter table public.tb_msg_programadas
  add column if not exists historico_envio_id uuid null;

update public.tb_msg_programadas
set executar_primeira_tentativa_em = executar_em
where executar_primeira_tentativa_em is null
  and executar_em is not null;

alter table public.tb_msg_programadas
  drop constraint if exists tb_msg_programadas_tentativa_atual_check;

alter table public.tb_msg_programadas
  add constraint tb_msg_programadas_tentativa_atual_check
  check (tentativa_atual >= 0);

create index if not exists idx_tb_msg_programadas_bloqueio_parametros
on public.tb_msg_programadas (id_empresa, origem_modulo, id_origem, documento_origem, destinatario_telefone)
where gerada_por_bloqueio_parametros = true
  and status in ('PENDENTE', 'AGENDADO', 'AGENDADA');

create index if not exists idx_tb_msg_programadas_primeira_tentativa
on public.tb_msg_programadas (id_empresa, executar_primeira_tentativa_em)
where enviado = false and ativo = true;

create index if not exists idx_tb_msg_programadas_segunda_tentativa
on public.tb_msg_programadas (id_empresa, executar_segunda_tentativa_em)
where enviado = false and ativo = true;

create or replace function public.set_tb_msg_programadas_executar_em()
returns trigger
language plpgsql
as $$
begin
  new.executar_em = (new.data_envio + new.hora_envio) at time zone 'America/Sao_Paulo';
  new.executar_primeira_tentativa_em = coalesce(new.executar_primeira_tentativa_em, new.executar_em);
  return new;
end;
$$;
