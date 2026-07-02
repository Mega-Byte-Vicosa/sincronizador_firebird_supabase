create table if not exists public.tab_modelos_msg (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  modelo_msg_titulo text not null,
  modelo_msg text not null,
  ativo boolean not null default true,
  criado_por uuid null,
  atualizado_por uuid null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint tab_modelos_msg_titulo_obrigatorio check (btrim(modelo_msg_titulo) <> ''),
  constraint tab_modelos_msg_texto_obrigatorio check (btrim(modelo_msg) <> '')
);

create index if not exists idx_tab_modelos_msg_id_empresa
on public.tab_modelos_msg (id_empresa);

create index if not exists idx_tab_modelos_msg_id_empresa_ativo
on public.tab_modelos_msg (id_empresa, ativo);

create index if not exists idx_tab_modelos_msg_titulo
on public.tab_modelos_msg using gin (
  to_tsvector('portuguese', coalesce(modelo_msg_titulo, ''))
);

drop trigger if exists trg_tab_modelos_msg_atualizado_em on public.tab_modelos_msg;
create trigger trg_tab_modelos_msg_atualizado_em
before update on public.tab_modelos_msg
for each row execute function public.set_atualizado_em();

alter table public.tab_modelos_msg enable row level security;

grant select, insert, update on public.tab_modelos_msg to anon, authenticated;

drop policy if exists "Frontend pode consultar modelos de mensagem" on public.tab_modelos_msg;
drop policy if exists "Frontend pode cadastrar modelos de mensagem" on public.tab_modelos_msg;
drop policy if exists "Frontend pode atualizar modelos de mensagem" on public.tab_modelos_msg;

create policy "Frontend pode consultar modelos de mensagem"
on public.tab_modelos_msg for select to anon, authenticated using (true);

create policy "Frontend pode cadastrar modelos de mensagem"
on public.tab_modelos_msg for insert to anon, authenticated with check (true);

create policy "Frontend pode atualizar modelos de mensagem"
on public.tab_modelos_msg for update to anon, authenticated using (true) with check (true);
