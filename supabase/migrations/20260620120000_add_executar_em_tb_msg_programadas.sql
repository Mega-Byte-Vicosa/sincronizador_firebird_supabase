alter table public.tb_msg_programadas
add column if not exists executar_em timestamp with time zone null;

update public.tb_msg_programadas
set executar_em = (data_envio + hora_envio) at time zone 'America/Sao_Paulo'
where executar_em is null
  and data_envio is not null
  and hora_envio is not null;

create or replace function public.set_tb_msg_programadas_executar_em()
returns trigger
language plpgsql
as $$
begin
  new.executar_em = (new.data_envio + new.hora_envio) at time zone 'America/Sao_Paulo';
  return new;
end;
$$;

drop trigger if exists trg_tb_msg_programadas_executar_em on public.tb_msg_programadas;

create trigger trg_tb_msg_programadas_executar_em
before insert or update of data_envio, hora_envio on public.tb_msg_programadas
for each row
execute function public.set_tb_msg_programadas_executar_em();

alter table public.tb_msg_programadas
alter column executar_em set not null;

create index if not exists idx_tb_msg_programadas_executar_em
on public.tb_msg_programadas (executar_em);
