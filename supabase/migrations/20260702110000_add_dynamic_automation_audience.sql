alter table public.tab_campanha
add column if not exists publico_dinamico boolean not null default false;

update public.tab_campanha
set publico_dinamico = automatizada;

create index if not exists idx_tab_campanha_empresa_publico_dinamico
on public.tab_campanha (id_empresa, publico_dinamico)
where automatizada = true;
