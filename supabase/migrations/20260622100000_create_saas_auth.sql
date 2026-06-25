create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tab_usuarios_saas (
  id uuid primary key default gen_random_uuid(),
  cnpj varchar(20) not null,
  cnpj_limpo varchar(14) not null,
  usuario varchar(100) not null,
  nome varchar(150) null,
  email varchar(150) null,
  senha_hash text not null,
  ativo boolean not null default true,
  ultimo_login_em timestamp with time zone null,
  ultimo_login_data date null,
  ultimo_login_hora time null,
  tentativas_login integer not null default 0,
  bloqueado boolean not null default false,
  bloqueado_em timestamp with time zone null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint tab_usuarios_saas_cnpj_usuario_key unique (cnpj_limpo, usuario),
  constraint tab_usuarios_saas_cnpj_limpo_check check (cnpj_limpo ~ '^[0-9]{14}$'),
  constraint tab_usuarios_saas_tentativas_check check (tentativas_login >= 0)
);

create table if not exists public.tab_sessoes_saas (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references public.tab_usuarios_saas(id) on delete cascade,
  token_hash text not null unique,
  criado_em timestamp with time zone not null default now(),
  expira_em timestamp with time zone not null,
  encerrado_em timestamp with time zone null
);

create index if not exists idx_tab_usuarios_saas_cnpj_usuario
on public.tab_usuarios_saas (cnpj_limpo, usuario);

create index if not exists idx_tab_usuarios_saas_ativo
on public.tab_usuarios_saas (ativo);

create index if not exists idx_tab_usuarios_saas_ultimo_login
on public.tab_usuarios_saas (ultimo_login_em);

create index if not exists idx_tab_sessoes_saas_usuario
on public.tab_sessoes_saas (id_usuario, expira_em);

create or replace function public.set_tab_usuarios_saas_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tab_usuarios_saas_atualizado_em on public.tab_usuarios_saas;
create trigger trg_tab_usuarios_saas_atualizado_em
before update on public.tab_usuarios_saas
for each row execute function public.set_tab_usuarios_saas_atualizado_em();

alter table public.tab_usuarios_saas enable row level security;
alter table public.tab_sessoes_saas enable row level security;

revoke all on public.tab_usuarios_saas from anon, authenticated;
revoke all on public.tab_sessoes_saas from anon, authenticated;

create or replace function public.autenticar_usuario_saas(
  p_cnpj text,
  p_usuario text,
  p_senha text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_usuario public.tab_usuarios_saas%rowtype;
  v_token text;
  v_agora timestamp with time zone := now();
  v_ultimo_login timestamp with time zone;
begin
  select * into v_usuario
  from public.tab_usuarios_saas
  where cnpj_limpo = regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g')
    and lower(usuario) = lower(trim(coalesce(p_usuario, '')))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'CNPJ, usuário ou senha inválidos.');
  end if;

  if not v_usuario.ativo or v_usuario.bloqueado then
    return jsonb_build_object('success', false, 'message', 'Usuário inativo ou bloqueado.');
  end if;

  if v_usuario.senha_hash <> crypt(coalesce(p_senha, ''), v_usuario.senha_hash) then
    update public.tab_usuarios_saas
    set tentativas_login = tentativas_login + 1
    where id = v_usuario.id;
    return jsonb_build_object('success', false, 'message', 'CNPJ, usuário ou senha inválidos.');
  end if;

  v_ultimo_login := v_usuario.ultimo_login_em;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;

  update public.tab_usuarios_saas
  set ultimo_login_em = v_agora,
      ultimo_login_data = v_agora::date,
      ultimo_login_hora = v_agora::time,
      tentativas_login = 0
  where id = v_usuario.id;

  delete from public.tab_sessoes_saas
  where id_usuario = v_usuario.id
    and (expira_em <= v_agora or encerrado_em is not null);

  insert into public.tab_sessoes_saas (id_usuario, token_hash, expira_em)
  values (v_usuario.id, encode(digest(v_token, 'sha256'), 'hex'), v_agora + interval '12 hours');

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'usuario', jsonb_build_object(
      'id', v_usuario.id,
      'cnpj', v_usuario.cnpj,
      'cnpj_limpo', v_usuario.cnpj_limpo,
      'usuario', v_usuario.usuario,
      'nome', v_usuario.nome,
      'email', v_usuario.email,
      'login_em', v_agora,
      'ultimo_login_anterior', v_ultimo_login
    )
  );
end;
$$;

create or replace function public.validar_sessao_saas(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public, extensions
as $$
  select coalesce((
    select jsonb_build_object(
      'success', true,
      'usuario', jsonb_build_object(
        'id', u.id,
        'cnpj', u.cnpj,
        'cnpj_limpo', u.cnpj_limpo,
        'usuario', u.usuario,
        'nome', u.nome,
        'email', u.email,
        'login_em', s.criado_em,
        'ultimo_login_anterior', u.ultimo_login_em
      )
    )
    from public.tab_sessoes_saas s
    join public.tab_usuarios_saas u on u.id = s.id_usuario
    where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and s.encerrado_em is null
      and s.expira_em > now()
      and u.ativo = true
      and u.bloqueado = false
    limit 1
  ), jsonb_build_object('success', false, 'message', 'Sessão inválida ou expirada.'));
$$;

create or replace function public.encerrar_sessao_saas(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.tab_sessoes_saas
  set encerrado_em = now()
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and encerrado_em is null;
$$;

revoke all on function public.autenticar_usuario_saas(text, text, text) from public;
revoke all on function public.validar_sessao_saas(text) from public;
revoke all on function public.encerrar_sessao_saas(text) from public;
grant execute on function public.autenticar_usuario_saas(text, text, text) to anon, authenticated;
grant execute on function public.validar_sessao_saas(text) to anon, authenticated;
grant execute on function public.encerrar_sessao_saas(text) to anon, authenticated;

insert into public.tab_usuarios_saas (
  cnpj,
  cnpj_limpo,
  usuario,
  nome,
  email,
  senha_hash
)
values (
  '00.000.000/0001-00',
  '00000000000100',
  'admin',
  'Administrador',
  null,
  extensions.crypt('admin123', extensions.gen_salt('bf', 12))
)
on conflict (cnpj_limpo, usuario) do nothing;
