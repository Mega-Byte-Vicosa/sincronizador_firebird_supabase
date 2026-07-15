create table if not exists public.tab_config_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.tab_empresas(id) on delete cascade,
  cliente_negrito boolean not null default true,
  empresa_negrito boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tab_config_modelos_empresa_key unique (empresa_id)
);

alter table public.tab_config_modelos add column if not exists cliente_negrito boolean not null default true;
alter table public.tab_config_modelos add column if not exists empresa_negrito boolean not null default true;
alter table public.tab_config_modelos add column if not exists criado_em timestamptz not null default now();
alter table public.tab_config_modelos add column if not exists atualizado_em timestamptz not null default now();

create unique index if not exists ux_tab_config_modelos_empresa on public.tab_config_modelos(empresa_id);
create index if not exists idx_tab_config_modelos_empresa on public.tab_config_modelos(empresa_id);

drop trigger if exists trg_tab_config_modelos_atualizado_em on public.tab_config_modelos;
create trigger trg_tab_config_modelos_atualizado_em before update on public.tab_config_modelos
for each row execute function public.set_atualizado_em();

insert into public.tab_config_modelos (empresa_id, cliente_negrito, empresa_negrito)
select id, true, true from public.tab_empresas
on conflict (empresa_id) do nothing;

create or replace function public.fn_garantir_config_modelos_empresa(p_empresa_id uuid)
returns public.tab_config_modelos language plpgsql security definer set search_path = public as $$
declare v_config public.tab_config_modelos;
begin
  if p_empresa_id is null or not exists (select 1 from public.tab_empresas where id = p_empresa_id) then
    raise exception 'Empresa invalida.';
  end if;
  insert into public.tab_config_modelos (empresa_id, cliente_negrito, empresa_negrito)
  values (p_empresa_id, true, true) on conflict (empresa_id) do nothing;
  select * into v_config from public.tab_config_modelos where empresa_id = p_empresa_id;
  return v_config;
end; $$;

create or replace function public.fn_garantir_config_modelos_nova_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.fn_garantir_config_modelos_empresa(new.id); return new; end; $$;
drop trigger if exists trg_garantir_config_modelos_nova_empresa on public.tab_empresas;
create trigger trg_garantir_config_modelos_nova_empresa after insert on public.tab_empresas
for each row execute function public.fn_garantir_config_modelos_nova_empresa();

create or replace function public.fn_obter_config_modelos(p_token text)
returns public.tab_config_modelos language plpgsql security definer set search_path = public as $$
declare v_empresa_id uuid;
begin
  select u.id_empresa into v_empresa_id
  from public.tab_sessoes_saas s join public.tab_usuarios_saas u on u.id = s.id_usuario
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.encerrado_em is null and s.expira_em > now() and u.ativo = true and u.bloqueado = false
  limit 1;
  if v_empresa_id is null then raise exception 'Sessao invalida ou expirada.'; end if;
  return public.fn_garantir_config_modelos_empresa(v_empresa_id);
end; $$;

create or replace function public.fn_salvar_config_modelos(p_token text, p_cliente_negrito boolean, p_empresa_negrito boolean)
returns public.tab_config_modelos language plpgsql security definer set search_path = public as $$
declare v_empresa_id uuid; v_config public.tab_config_modelos;
begin
  select u.id_empresa into v_empresa_id
  from public.tab_sessoes_saas s join public.tab_usuarios_saas u on u.id = s.id_usuario
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.encerrado_em is null and s.expira_em > now() and u.ativo = true and u.bloqueado = false
  limit 1;
  if v_empresa_id is null then raise exception 'Sessao invalida ou expirada.'; end if;
  insert into public.tab_config_modelos (empresa_id, cliente_negrito, empresa_negrito)
  values (v_empresa_id, coalesce(p_cliente_negrito, true), coalesce(p_empresa_negrito, true))
  on conflict (empresa_id) do update set cliente_negrito = excluded.cliente_negrito, empresa_negrito = excluded.empresa_negrito
  returning * into v_config;
  return v_config;
end; $$;

alter table public.tab_config_modelos enable row level security;
revoke all on public.tab_config_modelos from anon, authenticated;
grant execute on function public.fn_obter_config_modelos(text) to anon, authenticated;
grant execute on function public.fn_salvar_config_modelos(text,boolean,boolean) to anon, authenticated;
