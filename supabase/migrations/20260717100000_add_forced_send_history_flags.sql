alter table public.tab_whatsapp_envios
  add column if not exists envio_forcado boolean not null default false,
  add column if not exists envio_forcado_em timestamptz null,
  add column if not exists envio_forcado_motivo text null;

create index if not exists idx_tab_whatsapp_envios_envio_forcado
  on public.tab_whatsapp_envios (id_empresa, envio_forcado, envio_forcado_em desc)
  where envio_forcado = true;
