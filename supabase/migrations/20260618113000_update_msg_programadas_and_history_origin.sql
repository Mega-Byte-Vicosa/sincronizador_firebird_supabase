alter table public.tb_msg_programadas
drop constraint if exists tb_msg_programadas_status_check;

alter table public.tb_msg_programadas
alter column id_origem type text using id_origem::text;

alter table public.tb_msg_programadas
alter column status set default 'AGENDADO';

alter table public.tb_msg_programadas
add constraint tb_msg_programadas_status_check
check (status in ('PENDENTE', 'AGENDADO', 'AGENDADA', 'ENVIADO', 'ENVIADA', 'CANCELADO', 'CANCELADA', 'ERRO'));

alter table public.tab_whatsapp_envios
add column if not exists origem_envio varchar(50) null;

alter table public.tab_whatsapp_envios
add column if not exists origem_modulo varchar(50) null;

alter table public.tab_whatsapp_envios
add column if not exists id_msg_programada uuid null;

alter table public.tab_whatsapp_envios
add column if not exists id_origem text null;

create index if not exists idx_tab_whatsapp_envios_origem_programada
on public.tab_whatsapp_envios (origem_envio, origem_modulo, id_msg_programada);
