alter table public.tab_cliente
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_tab_cliente_tags_gin
on public.tab_cliente using gin (tags);

create table if not exists public.tab_campanha (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  nome text not null,
  objetivo text null,
  publico_alvo text null,
  filtros_publico jsonb null,
  tags_publico text[] null,
  mensagem text null,
  id_modelo_mensagem uuid null,
  tipo_comunicacao text not null,
  status text not null default 'rascunho',
  automatizada boolean not null default false,
  tipo_automacao text null,
  data_hora_criacao timestamp with time zone not null default now(),
  data_hora_agendamento timestamp with time zone null,
  data_hora_inicio_envio timestamp with time zone null,
  data_hora_fim_envio timestamp with time zone null,
  percentual_envio numeric(5,2) not null default 0,
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  total_falhas integer not null default 0,
  intervalo_envio_segundos integer not null default 30,
  arquivo_url text null,
  arquivo_nome text null,
  arquivo_tipo text null,
  aos_cuidados text null,
  empresa_destino text null,
  observacoes text null,
  criado_por uuid null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint tab_campanha_tipo_comunicacao_check check (tipo_comunicacao in ('whatsapp', 'email', 'instagram')),
  constraint tab_campanha_status_check check (status in ('rascunho', 'programada', 'enviando', 'pausada', 'concluida', 'cancelada')),
  constraint tab_campanha_percentual_check check (percentual_envio >= 0 and percentual_envio <= 100),
  constraint tab_campanha_totais_check check (
    total_destinatarios >= 0 and total_enviados >= 0 and total_falhas >= 0 and intervalo_envio_segundos >= 0
  )
);

create table if not exists public.tab_campanha_clientes (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null,
  id_campanha uuid not null references public.tab_campanha(id) on delete cascade,
  id_cliente integer not null,
  nome_cliente text null,
  telefone text null,
  email text null,
  status_envio text not null default 'pendente',
  mensagem_personalizada text null,
  enviado_em timestamp with time zone null,
  erro_envio text null,
  criado_em timestamp with time zone not null default now(),
  constraint tab_campanha_clientes_status_check check (status_envio in ('pendente', 'enviado', 'falhou', 'ignorado', 'cancelado')),
  constraint tab_campanha_clientes_unico_cliente unique (id_empresa, id_campanha, id_cliente)
);

create index if not exists idx_tab_campanha_id_empresa on public.tab_campanha (id_empresa);
create index if not exists idx_tab_campanha_status on public.tab_campanha (status);
create index if not exists idx_tab_campanha_empresa_status on public.tab_campanha (id_empresa, status);
create index if not exists idx_tab_campanha_agendamento on public.tab_campanha (data_hora_agendamento);
create index if not exists idx_tab_campanha_tipo_comunicacao on public.tab_campanha (tipo_comunicacao);

create index if not exists idx_tab_campanha_clientes_id_empresa on public.tab_campanha_clientes (id_empresa);
create index if not exists idx_tab_campanha_clientes_id_campanha on public.tab_campanha_clientes (id_campanha);
create index if not exists idx_tab_campanha_clientes_id_cliente on public.tab_campanha_clientes (id_cliente);
create index if not exists idx_tab_campanha_clientes_status_envio on public.tab_campanha_clientes (status_envio);

create or replace function public.set_tab_campanha_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tab_campanha_atualizado_em on public.tab_campanha;
create trigger trg_tab_campanha_atualizado_em
before update on public.tab_campanha
for each row execute function public.set_tab_campanha_atualizado_em();

alter table public.tab_campanha enable row level security;
alter table public.tab_campanha_clientes enable row level security;

grant select, insert, update, delete on public.tab_campanha to anon, authenticated;
grant select, insert, update, delete on public.tab_campanha_clientes to anon, authenticated;

drop policy if exists "Frontend pode consultar campanhas" on public.tab_campanha;
drop policy if exists "Frontend pode cadastrar campanhas" on public.tab_campanha;
drop policy if exists "Frontend pode atualizar campanhas" on public.tab_campanha;
drop policy if exists "Frontend pode excluir campanhas" on public.tab_campanha;

create policy "Frontend pode consultar campanhas"
on public.tab_campanha for select to anon, authenticated using (true);

create policy "Frontend pode cadastrar campanhas"
on public.tab_campanha for insert to anon, authenticated with check (true);

create policy "Frontend pode atualizar campanhas"
on public.tab_campanha for update to anon, authenticated using (true) with check (true);

create policy "Frontend pode excluir campanhas"
on public.tab_campanha for delete to anon, authenticated using (true);

drop policy if exists "Frontend pode consultar clientes da campanha" on public.tab_campanha_clientes;
drop policy if exists "Frontend pode cadastrar clientes da campanha" on public.tab_campanha_clientes;
drop policy if exists "Frontend pode atualizar clientes da campanha" on public.tab_campanha_clientes;
drop policy if exists "Frontend pode excluir clientes da campanha" on public.tab_campanha_clientes;

create policy "Frontend pode consultar clientes da campanha"
on public.tab_campanha_clientes for select to anon, authenticated using (true);

create policy "Frontend pode cadastrar clientes da campanha"
on public.tab_campanha_clientes for insert to anon, authenticated with check (true);

create policy "Frontend pode atualizar clientes da campanha"
on public.tab_campanha_clientes for update to anon, authenticated using (true) with check (true);

create policy "Frontend pode excluir clientes da campanha"
on public.tab_campanha_clientes for delete to anon, authenticated using (true);
