alter table public.tb_msg_programadas
drop constraint if exists tb_msg_programadas_status_check;

alter table public.tb_msg_programadas
add constraint tb_msg_programadas_status_check
check (status in ('PENDENTE', 'AGENDADO', 'AGENDADA', 'PROCESSANDO', 'ENVIADO', 'ENVIADA', 'CANCELADO', 'CANCELADA', 'ERRO'));

alter table public.tb_msg_programadas
add column if not exists processando_em timestamp with time zone null;

create index if not exists idx_tb_msg_programadas_processando_em
on public.tb_msg_programadas (processando_em)
where status = 'PROCESSANDO';
