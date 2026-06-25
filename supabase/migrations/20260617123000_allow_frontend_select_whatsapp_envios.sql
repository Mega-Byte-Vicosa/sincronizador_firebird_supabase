alter table public.tab_whatsapp_envios enable row level security;

drop policy if exists "Frontend pode consultar historico de envios" on public.tab_whatsapp_envios;

create policy "Frontend pode consultar historico de envios"
on public.tab_whatsapp_envios
for select
to anon, authenticated
using (true);
