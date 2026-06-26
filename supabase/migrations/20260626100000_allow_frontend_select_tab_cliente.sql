alter table public.tab_cliente enable row level security;

grant select on public.tab_cliente to anon, authenticated;

drop policy if exists "Frontend pode consultar clientes" on public.tab_cliente;

create policy "Frontend pode consultar clientes"
on public.tab_cliente
for select
to anon, authenticated
using (true);
