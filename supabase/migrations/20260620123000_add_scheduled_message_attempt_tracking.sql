alter table public.tb_msg_programadas
add column if not exists ultima_tentativa_em timestamp with time zone null;

alter table public.tb_msg_programadas
add column if not exists tentativas_envio integer not null default 0;

alter table public.tb_msg_programadas
add column if not exists erro_envio text null;

alter table public.tb_msg_programadas
drop constraint if exists tb_msg_programadas_tentativas_envio_check;

alter table public.tb_msg_programadas
add constraint tb_msg_programadas_tentativas_envio_check
check (tentativas_envio >= 0);
