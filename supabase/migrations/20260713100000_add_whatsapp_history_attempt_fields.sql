alter table public.tab_whatsapp_envios
add column if not exists proxima_tentativa_em timestamp with time zone null;

alter table public.tab_whatsapp_envios
add column if not exists ultima_tentativa_em timestamp with time zone null;
