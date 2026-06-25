alter table public.tb_msg_programadas
alter column criado_em type timestamp with time zone
using criado_em at time zone 'UTC';

alter table public.tb_msg_programadas
alter column criado_em set default now();

alter table public.tb_msg_programadas
alter column data_hora_envio type timestamp with time zone
using data_hora_envio at time zone 'UTC';
