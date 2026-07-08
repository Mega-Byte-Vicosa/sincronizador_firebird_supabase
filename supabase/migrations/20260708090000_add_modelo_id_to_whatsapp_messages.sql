alter table public.tab_whatsapp_envios
  add column if not exists modelo_id uuid null;

alter table public.tb_msg_programadas
  add column if not exists modelo_id uuid null;

create index if not exists idx_tab_whatsapp_envios_modelo_id
  on public.tab_whatsapp_envios(modelo_id);

create index if not exists idx_tb_msg_programadas_modelo_id
  on public.tb_msg_programadas(modelo_id);
