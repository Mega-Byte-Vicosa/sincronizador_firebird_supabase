-- ============================================================
-- MIGRATION SAAS MULTIEMPRESA - BASE COMPLETA
-- Arquivo: 20260622110000_saas_multiempresa_base.sql
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- 1. TABELA DE EMPRESAS / TENANTS
-- ============================================================

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text,
  nome_fantasia text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);


-- Empresa padrão para vincular dados antigos já existentes
insert into public.empresas (
  id,
  cnpj,
  razao_social,
  nome_fantasia,
  ativo
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000000000',
  'Empresa Padrão',
  'Empresa Padrão',
  true
)
on conflict (id) do nothing;


-- ============================================================
-- 2. TABELA DE USUÁRIOS DO SISTEMA
-- ============================================================

create table if not exists public.usuarios_sistema (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario text not null,
  senha_hash text,
  nome text,
  email text,
  ativo boolean not null default true,
  ultimo_login_data date,
  ultimo_login_hora time,
  ultimo_login_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_sistema_empresa_usuario_unique unique (empresa_id, usuario)
);


-- Usuário padrão inicial
insert into public.usuarios_sistema (
  empresa_id,
  usuario,
  senha_hash,
  nome,
  ativo
)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'admin',
  'Administrador',
  true
)
on conflict (empresa_id, usuario) do nothing;


-- ============================================================
-- 3. FUNÇÃO PARA ATUALIZAR updated_at / atualizado_em
-- ============================================================

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;


drop trigger if exists trg_empresas_atualizado_em on public.empresas;

create trigger trg_empresas_atualizado_em
before update on public.empresas
for each row
execute function public.set_atualizado_em();


drop trigger if exists trg_usuarios_sistema_atualizado_em on public.usuarios_sistema;

create trigger trg_usuarios_sistema_atualizado_em
before update on public.usuarios_sistema
for each row
execute function public.set_atualizado_em();


-- ============================================================
-- 4. ADICIONA empresa_id NAS TABELAS EXISTENTES
-- ============================================================

do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then
    alter table public.firebird_contas_receber
    add column if not exists empresa_id uuid;

    update public.firebird_contas_receber
    set empresa_id = '00000000-0000-0000-0000-000000000001'
    where empresa_id is null;

    alter table public.firebird_contas_receber
    alter column empresa_id set not null;
  end if;
end;
$$;


do $$
begin
  if to_regclass('public.tab_whatsapp_envios') is not null then
    alter table public.tab_whatsapp_envios
    add column if not exists empresa_id uuid;

    update public.tab_whatsapp_envios
    set empresa_id = '00000000-0000-0000-0000-000000000001'
    where empresa_id is null;

    alter table public.tab_whatsapp_envios
    alter column empresa_id set not null;
  end if;
end;
$$;


do $$
begin
  if to_regclass('public.firebird_clientes') is not null then
    alter table public.firebird_clientes
    add column if not exists empresa_id uuid;

    update public.firebird_clientes
    set empresa_id = '00000000-0000-0000-0000-000000000001'
    where empresa_id is null;

    alter table public.firebird_clientes
    alter column empresa_id set not null;
  end if;
end;
$$;


do $$
begin
  if to_regclass('public.firebird_empresas') is not null then
    alter table public.firebird_empresas
    add column if not exists empresa_id uuid;

    update public.firebird_empresas
    set empresa_id = '00000000-0000-0000-0000-000000000001'
    where empresa_id is null;

    alter table public.firebird_empresas
    alter column empresa_id set not null;
  end if;
end;
$$;


-- ============================================================
-- 5. REMOVE FOREIGN KEY ANTIGA DO WHATSAPP
-- QUE DEPENDE DA PK ANTIGA DE firebird_contas_receber
-- ============================================================

do $$
declare
  v_constraint text;
begin
  if to_regclass('public.tab_whatsapp_envios') is not null
     and to_regclass('public.firebird_contas_receber') is not null then

    select conname
    into v_constraint
    from pg_constraint
    where conrelid = 'public.tab_whatsapp_envios'::regclass
      and confrelid = 'public.firebird_contas_receber'::regclass
      and contype = 'f'
    limit 1;

    if v_constraint is not null then
      execute format(
        'alter table public.tab_whatsapp_envios drop constraint %I',
        v_constraint
      );
    end if;
  end if;
end;
$$;


-- ============================================================
-- 6. REMOVE PK ANTIGA DE firebird_contas_receber
-- ============================================================

do $$
declare
  v_constraint text;
begin
  if to_regclass('public.firebird_contas_receber') is not null then

    select conname
    into v_constraint
    from pg_constraint
    where conrelid = 'public.firebird_contas_receber'::regclass
      and contype = 'p'
    limit 1;

    if v_constraint is not null then
      execute format(
        'alter table public.firebird_contas_receber drop constraint %I',
        v_constraint
      );
    end if;
  end if;
end;
$$;


-- ============================================================
-- 7. CRIA NOVA PK MULTIEMPRESA EM firebird_contas_receber
-- ============================================================

do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.firebird_contas_receber'::regclass
        and contype = 'p'
    ) then
      alter table public.firebird_contas_receber
      add constraint firebird_contas_receber_pkey
      primary key (empresa_id, id_ctarec);
    end if;

  end if;
end;
$$;


-- ============================================================
-- 8. CRIA FOREIGN KEY DE EMPRESA EM firebird_contas_receber
-- ============================================================

do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.firebird_contas_receber'::regclass
        and conname = 'firebird_contas_receber_empresa_id_fkey'
    ) then
      alter table public.firebird_contas_receber
      add constraint firebird_contas_receber_empresa_id_fkey
      foreign key (empresa_id)
      references public.empresas(id)
      on delete cascade;
    end if;

  end if;
end;
$$;


-- ============================================================
-- 9. RECRIA FK DO WHATSAPP PARA CONTAS A RECEBER
-- AGORA USANDO empresa_id + id_ctarec
-- ============================================================

do $$
begin
  if to_regclass('public.tab_whatsapp_envios') is not null
     and to_regclass('public.firebird_contas_receber') is not null then

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.tab_whatsapp_envios'::regclass
        and conname = 'tab_whatsapp_envios_empresa_id_id_ctarec_fkey'
    ) then
      alter table public.tab_whatsapp_envios
      add constraint tab_whatsapp_envios_empresa_id_id_ctarec_fkey
      foreign key (empresa_id, id_ctarec)
      references public.firebird_contas_receber (empresa_id, id_ctarec)
      on delete cascade;
    end if;

  end if;
end;
$$;


-- ============================================================
-- 10. CRIA FK DE EMPRESA EM tab_whatsapp_envios
-- ============================================================

do $$
begin
  if to_regclass('public.tab_whatsapp_envios') is not null then

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.tab_whatsapp_envios'::regclass
        and conname = 'tab_whatsapp_envios_empresa_id_fkey'
    ) then
      alter table public.tab_whatsapp_envios
      add constraint tab_whatsapp_envios_empresa_id_fkey
      foreign key (empresa_id)
      references public.empresas(id)
      on delete cascade;
    end if;

  end if;
end;
$$;


-- ============================================================
-- 11. AJUSTA firebird_clientes PARA MULTIEMPRESA
-- ============================================================

do $$
declare
  v_constraint text;
begin
  if to_regclass('public.firebird_clientes') is not null then

    select conname
    into v_constraint
    from pg_constraint
    where conrelid = 'public.firebird_clientes'::regclass
      and contype = 'p'
    limit 1;

    if v_constraint is not null then
      execute format(
        'alter table public.firebird_clientes drop constraint %I',
        v_constraint
      );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.firebird_clientes'::regclass
        and contype = 'p'
    ) then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'firebird_clientes'
          and column_name = 'id_cliente'
      ) then
        alter table public.firebird_clientes
        add constraint firebird_clientes_pkey
        primary key (empresa_id, id_cliente);
      end if;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.firebird_clientes'::regclass
        and conname = 'firebird_clientes_empresa_id_fkey'
    ) then
      alter table public.firebird_clientes
      add constraint firebird_clientes_empresa_id_fkey
      foreign key (empresa_id)
      references public.empresas(id)
      on delete cascade;
    end if;

  end if;
end;
$$;


-- ============================================================
-- 12. AJUSTA firebird_empresas PARA MULTIEMPRESA
-- ============================================================

do $$
begin
  if to_regclass('public.firebird_empresas') is not null then

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.firebird_empresas'::regclass
        and conname = 'firebird_empresas_empresa_id_fkey'
    ) then
      alter table public.firebird_empresas
      add constraint firebird_empresas_empresa_id_fkey
      foreign key (empresa_id)
      references public.empresas(id)
      on delete cascade;
    end if;

  end if;
end;
$$;


-- ============================================================
-- 13. ÍNDICES PARA PERFORMANCE
-- ============================================================

create index if not exists idx_empresas_cnpj
on public.empresas (cnpj);


create index if not exists idx_usuarios_sistema_empresa_id
on public.usuarios_sistema (empresa_id);


create index if not exists idx_usuarios_sistema_usuario
on public.usuarios_sistema (usuario);


do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then
    create index if not exists idx_firebird_contas_receber_empresa_id
    on public.firebird_contas_receber (empresa_id);

    create index if not exists idx_firebird_contas_receber_empresa_id_id_ctarec
    on public.firebird_contas_receber (empresa_id, id_ctarec);
  end if;
end;
$$;


do $$
begin
  if to_regclass('public.tab_whatsapp_envios') is not null then
    create index if not exists idx_tab_whatsapp_envios_empresa_id
    on public.tab_whatsapp_envios (empresa_id);

    create index if not exists idx_tab_whatsapp_envios_empresa_id_id_ctarec
    on public.tab_whatsapp_envios (empresa_id, id_ctarec);
  end if;
end;
$$;


do $$
begin
  if to_regclass('public.firebird_clientes') is not null then
    create index if not exists idx_firebird_clientes_empresa_id
    on public.firebird_clientes (empresa_id);
  end if;
end;
$$;


-- ============================================================
-- 14. ROW LEVEL SECURITY - RLS
-- Por enquanto deixa desabilitado para não quebrar o sistema atual.
-- Depois podemos ativar quando o login estiver 100% integrado.
-- ============================================================

alter table public.empresas disable row level security;
alter table public.usuarios_sistema disable row level security;


do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then
    alter table public.firebird_contas_receber disable row level security;
  end if;

  if to_regclass('public.tab_whatsapp_envios') is not null then
    alter table public.tab_whatsapp_envios disable row level security;
  end if;

  if to_regclass('public.firebird_clientes') is not null then
    alter table public.firebird_clientes disable row level security;
  end if;

  if to_regclass('public.firebird_empresas') is not null then
    alter table public.firebird_empresas disable row level security;
  end if;
end;
$$;


-- ============================================================
-- 15. COMENTÁRIOS
-- ============================================================

comment on table public.empresas is 'Tabela de empresas/tenants do sistema SaaS.';
comment on table public.usuarios_sistema is 'Tabela de autenticação dos usuários por empresa.';

comment on column public.usuarios_sistema.usuario is 'Usuário de login.';
comment on column public.usuarios_sistema.senha_hash is 'Senha do usuário. Idealmente salvar hash, não texto puro.';
comment on column public.usuarios_sistema.ultimo_login_data is 'Data do último login.';
comment on column public.usuarios_sistema.ultimo_login_hora is 'Hora do último login.';
comment on column public.usuarios_sistema.ultimo_login_em is 'Data e hora completas do último login.';