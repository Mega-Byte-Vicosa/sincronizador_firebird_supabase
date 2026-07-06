create extension if not exists pgcrypto with schema extensions;

alter table public.tab_empresas
  add column if not exists primeiro_acesso_concluido boolean not null default false,
  add column if not exists admin_senha_pendente boolean not null default true,
  add column if not exists setup_status text not null default 'pendente',
  add column if not exists substituicao_dados_pendente boolean not null default false,
  add column if not exists substituicao_dados_confirmada_em timestamp with time zone,
  add column if not exists ultimo_identificador_base_firebird text,
  add column if not exists atualizado_setup_em timestamp with time zone;

comment on column public.tab_empresas.primeiro_acesso_concluido is
  'Indica se o primeiro acesso da empresa já foi concluído.';
comment on column public.tab_empresas.admin_senha_pendente is
  'Indica se o usuário admin ainda precisa criar a primeira senha.';
comment on column public.tab_empresas.setup_status is
  'Status do setup da empresa: pendente, cnpj_existente_aguardando_decisao, usar_existente, substituir_dados, concluido.';
comment on column public.tab_empresas.substituicao_dados_pendente is
  'Indica se existe solicitação pendente para substituir os dados sincronizados da empresa.';
comment on column public.tab_empresas.ultimo_identificador_base_firebird is
  'Identificador da base Firebird usada na instalação/sincronização.';

alter table public.tab_usuarios_saas
  add column if not exists senha_definida boolean not null default false,
  add column if not exists deve_definir_senha boolean not null default false,
  add column if not exists senha_definida_em timestamp with time zone;

comment on column public.tab_usuarios_saas.senha_definida is
  'Indica se o usuário já definiu a senha inicial.';
comment on column public.tab_usuarios_saas.deve_definir_senha is
  'Indica se o usuário deve criar/redefinir a senha no próximo acesso.';

-- Preserva o login das empresas e usuários criados antes deste fluxo.
update public.tab_usuarios_saas
set senha_definida = true,
    deve_definir_senha = false,
    senha_definida_em = coalesce(senha_definida_em, criado_em)
where senha_hash is not null
  and senha_hash <> '';

update public.tab_empresas e
set primeiro_acesso_concluido = true,
    admin_senha_pendente = false,
    setup_status = 'concluido',
    atualizado_setup_em = coalesce(atualizado_setup_em, now())
where exists (
  select 1
  from public.tab_usuarios_saas u
  where u.id_empresa = e.id
    and u.senha_definida = true
);

create table if not exists public.tab_sincronizador_instalacoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.tab_empresas(id) on delete cascade,
  cnpj_limpo text not null,
  identificador_base_firebird text not null,
  caminho_base_firebird text,
  status text not null default 'pendente',
  decisao_usuario text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  autorizado_em timestamp with time zone,
  substituido_em timestamp with time zone,
  unique (id_empresa, identificador_base_firebird)
);

create index if not exists idx_tab_sincronizador_instalacoes_empresa
  on public.tab_sincronizador_instalacoes (id_empresa);
create index if not exists idx_tab_sincronizador_instalacoes_cnpj
  on public.tab_sincronizador_instalacoes (cnpj_limpo);
create index if not exists idx_tab_sincronizador_instalacoes_status
  on public.tab_sincronizador_instalacoes (status);

create or replace function public.fn_tab_sincronizador_instalacoes_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tab_sincronizador_instalacoes_atualizado_em on public.tab_sincronizador_instalacoes;
create trigger trg_tab_sincronizador_instalacoes_atualizado_em
before update on public.tab_sincronizador_instalacoes
for each row execute function public.fn_tab_sincronizador_instalacoes_atualizado_em();

alter table public.tab_sincronizador_instalacoes enable row level security;
revoke all on public.tab_sincronizador_instalacoes from anon, authenticated;

create or replace function public.fn_registrar_instalacao_firebird(
  p_cnpj_limpo text,
  p_cnpj_formatado text,
  p_razao_social text,
  p_nome_fantasia text,
  p_email text,
  p_telefone text,
  p_identificador_base_firebird text,
  p_caminho_base_firebird text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cnpj_limpo text := regexp_replace(coalesce(p_cnpj_limpo, p_cnpj_formatado, ''), '[^0-9]', '', 'g');
  v_empresa public.tab_empresas%rowtype;
  v_instalacao public.tab_sincronizador_instalacoes%rowtype;
  v_nova_empresa boolean := false;
  v_admin_pendente boolean := false;
begin
  if length(v_cnpj_limpo) <> 14 then
    return jsonb_build_object('success', false, 'message', 'CNPJ inválido.');
  end if;

  if nullif(trim(coalesce(p_identificador_base_firebird, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Identificador da base Firebird não informado.');
  end if;

  select * into v_empresa
  from public.tab_empresas
  where regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = v_cnpj_limpo
  limit 1
  for update;

  if not found then
    insert into public.tab_empresas (
      cnpj, razao_social, nome_fantasia, ativo,
      primeiro_acesso_concluido, admin_senha_pendente, setup_status,
      ultimo_identificador_base_firebird, atualizado_setup_em
    ) values (
      coalesce(nullif(trim(p_cnpj_formatado), ''), v_cnpj_limpo),
      p_razao_social, coalesce(nullif(trim(p_nome_fantasia), ''), p_razao_social), true,
      false, true, 'pendente', p_identificador_base_firebird, now()
    ) returning * into v_empresa;
    v_nova_empresa := true;
  end if;

  insert into public.tab_usuarios_saas (
    id_empresa, cnpj, cnpj_limpo, usuario, nome, email, senha_hash,
    ativo, senha_definida, deve_definir_senha
  ) values (
    v_empresa.id, coalesce(nullif(trim(p_cnpj_formatado), ''), v_cnpj_limpo), v_cnpj_limpo,
    'admin', 'Administrador', nullif(trim(coalesce(p_email, '')), ''),
    crypt(gen_random_uuid()::text || clock_timestamp()::text, gen_salt('bf', 12)),
    true, false, true
  )
  on conflict (cnpj_limpo, usuario) do nothing;

  select coalesce(u.deve_definir_senha or not u.senha_definida, false)
  into v_admin_pendente
  from public.tab_usuarios_saas u
  where u.id_empresa = v_empresa.id and lower(u.usuario) = 'admin'
  limit 1;

  if v_nova_empresa then
    insert into public.tab_sincronizador_instalacoes (
      id_empresa, cnpj_limpo, identificador_base_firebird, caminho_base_firebird,
      status, decisao_usuario, autorizado_em
    ) values (
      v_empresa.id, v_cnpj_limpo, p_identificador_base_firebird, p_caminho_base_firebird,
      'autorizada', 'nova_empresa', now()
    )
    on conflict (id_empresa, identificador_base_firebird) do update
      set caminho_base_firebird = excluded.caminho_base_firebird,
          status = 'autorizada', autorizado_em = now();

    return jsonb_build_object(
      'success', true, 'status', 'nova_empresa', 'id_empresa', v_empresa.id,
      'cnpj_limpo', v_cnpj_limpo, 'precisa_criar_senha_admin', true,
      'precisa_decidir_substituicao', false,
      'mensagem', 'Nova empresa criada. Primeiro acesso do administrador pendente.'
    );
  end if;

  select * into v_instalacao
  from public.tab_sincronizador_instalacoes
  where id_empresa = v_empresa.id
    and identificador_base_firebird = p_identificador_base_firebird
  limit 1;

  if found and v_instalacao.status in ('autorizada', 'substituida') then
    return jsonb_build_object(
      'success', true, 'status', 'instalacao_autorizada', 'id_empresa', v_empresa.id,
      'cnpj_limpo', v_cnpj_limpo, 'precisa_criar_senha_admin', v_admin_pendente,
      'precisa_decidir_substituicao', false,
      'forcar_sincronizacao_completa', v_empresa.setup_status = 'substituir_dados',
      'mensagem', 'Instalação autorizada.'
    );
  end if;

  insert into public.tab_sincronizador_instalacoes (
    id_empresa, cnpj_limpo, identificador_base_firebird, caminho_base_firebird, status
  ) values (
    v_empresa.id, v_cnpj_limpo, p_identificador_base_firebird, p_caminho_base_firebird,
    'cnpj_existente_aguardando_decisao'
  )
  on conflict (id_empresa, identificador_base_firebird) do update
    set caminho_base_firebird = excluded.caminho_base_firebird,
        status = case
          when public.tab_sincronizador_instalacoes.status in ('autorizada', 'substituida')
            then public.tab_sincronizador_instalacoes.status
          else 'cnpj_existente_aguardando_decisao'
        end;

  update public.tab_empresas
  set setup_status = 'cnpj_existente_aguardando_decisao',
      substituicao_dados_pendente = true,
      atualizado_setup_em = now()
  where id = v_empresa.id;

  return jsonb_build_object(
    'success', true, 'status', 'cnpj_existente_aguardando_decisao',
    'id_empresa', v_empresa.id, 'cnpj_limpo', v_cnpj_limpo,
    'precisa_criar_senha_admin', v_admin_pendente,
    'precisa_decidir_substituicao', true,
    'mensagem', 'Este CNPJ já possui dados cadastrados no Supabase.'
  );
end;
$$;

create or replace function public.fn_status_primeiro_acesso(
  p_cnpj text,
  p_usuario text default 'admin'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_empresa public.tab_empresas%rowtype;
  v_usuario public.tab_usuarios_saas%rowtype;
  v_instalacao public.tab_sincronizador_instalacoes%rowtype;
begin
  select * into v_empresa
  from public.tab_empresas
  where regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g')
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'status', 'empresa_nao_encontrada', 'message', 'Empresa não encontrada. Execute o sincronizador primeiro.');
  end if;

  select * into v_usuario
  from public.tab_usuarios_saas
  where id_empresa = v_empresa.id
    and lower(usuario) = lower(trim(coalesce(p_usuario, 'admin')))
  limit 1;

  select * into v_instalacao
  from public.tab_sincronizador_instalacoes
  where id_empresa = v_empresa.id
    and status = 'cnpj_existente_aguardando_decisao'
  order by criado_em desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'id_empresa', v_empresa.id,
    'empresa_nome', coalesce(v_empresa.nome_fantasia, v_empresa.razao_social),
    'cnpj_limpo', regexp_replace(coalesce(v_empresa.cnpj, ''), '[^0-9]', '', 'g'),
    'usuario', coalesce(v_usuario.usuario, trim(coalesce(p_usuario, 'admin'))),
    'primeiro_acesso_concluido', v_empresa.primeiro_acesso_concluido,
    'admin_senha_pendente', v_empresa.admin_senha_pendente,
    'deve_definir_senha', coalesce(v_usuario.deve_definir_senha or not v_usuario.senha_definida, false),
    'setup_status', v_empresa.setup_status,
    'precisa_decidir_substituicao', v_empresa.setup_status = 'cnpj_existente_aguardando_decisao',
    'identificador_base_firebird', v_instalacao.identificador_base_firebird
  );
end;
$$;

create or replace function public.fn_definir_senha_admin_primeiro_acesso(
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
  v_empresa public.tab_empresas%rowtype;
  v_usuario public.tab_usuarios_saas%rowtype;
begin
  if length(coalesce(p_senha, '')) < 6 then
    return jsonb_build_object('success', false, 'message', 'A senha deve ter pelo menos 6 caracteres.');
  end if;

  if lower(trim(coalesce(p_usuario, ''))) <> 'admin' then
    return jsonb_build_object('success', false, 'message', 'A criação da senha inicial é permitida somente para o usuário admin.');
  end if;

  select * into v_empresa
  from public.tab_empresas
  where regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g')
  limit 1 for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
  end if;

  select * into v_usuario
  from public.tab_usuarios_saas
  where id_empresa = v_empresa.id
    and lower(usuario) = lower(trim(coalesce(p_usuario, '')))
  limit 1 for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Usuário administrador não encontrado.');
  end if;

  if not (v_usuario.deve_definir_senha or not v_usuario.senha_definida or v_empresa.admin_senha_pendente) then
    return jsonb_build_object('success', false, 'message', 'A senha inicial deste usuário já foi definida.');
  end if;

  update public.tab_usuarios_saas
  set senha_hash = crypt(p_senha, gen_salt('bf', 12)),
      senha_definida = true,
      deve_definir_senha = false,
      senha_definida_em = now(),
      tentativas_login = 0,
      bloqueado = false,
      bloqueado_em = null,
      atualizado_em = now()
  where id = v_usuario.id;

  update public.tab_empresas
  set admin_senha_pendente = false,
      primeiro_acesso_concluido = true,
      setup_status = case when substituicao_dados_pendente then setup_status else 'concluido' end,
      atualizado_setup_em = now()
  where id = v_empresa.id;

  return jsonb_build_object('success', true, 'message', 'Senha do administrador criada com sucesso.');
end;
$$;

create or replace function public.fn_decidir_instalacao_cnpj_existente(
  p_id_empresa uuid,
  p_identificador_base_firebird text,
  p_decisao text,
  p_confirmacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instalacao public.tab_sincronizador_instalacoes%rowtype;
begin
  if p_decisao not in ('usar_existente', 'substituir_dados') then
    return jsonb_build_object('success', false, 'message', 'Decisão inválida.');
  end if;

  select * into v_instalacao
  from public.tab_sincronizador_instalacoes
  where id_empresa = p_id_empresa
    and identificador_base_firebird = p_identificador_base_firebird
    and status = 'cnpj_existente_aguardando_decisao'
  limit 1 for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Instalação pendente não encontrada.');
  end if;

  if p_decisao = 'usar_existente' then
    update public.tab_sincronizador_instalacoes
    set status = 'autorizada', decisao_usuario = 'usar_existente', autorizado_em = now()
    where id = v_instalacao.id;

    update public.tab_empresas
    set setup_status = 'usar_existente', substituicao_dados_pendente = false,
        ultimo_identificador_base_firebird = p_identificador_base_firebird,
        atualizado_setup_em = now()
    where id = p_id_empresa;

    return jsonb_build_object('success', true, 'status', 'usar_existente', 'message', 'Instalação autorizada. Os dados existentes foram preservados.');
  end if;

  if coalesce(p_confirmacao, '') <> 'SUBSTITUIR' then
    return jsonb_build_object('success', false, 'message', 'Digite SUBSTITUIR para confirmar a operação.');
  end if;

  -- Filhos e históricos antes das tabelas espelho. Cada exclusão é restrita à empresa.
  if to_regclass('public.tab_whatsapp_envios') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tab_whatsapp_envios' and column_name = 'id_empresa') then
      execute 'delete from public.tab_whatsapp_envios where id_empresa = $1' using p_id_empresa;
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tab_whatsapp_envios' and column_name = 'empresa_id') then
      execute 'delete from public.tab_whatsapp_envios where empresa_id = $1' using p_id_empresa;
    end if;
  end if;

  if to_regclass('public.tb_msg_programadas') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tb_msg_programadas' and column_name = 'id_empresa') then
      execute 'delete from public.tb_msg_programadas where id_empresa = $1 and origem_modulo = ''CONTA_RECEBER''' using p_id_empresa;
    elsif to_regclass('public.firebird_contas_receber') is not null then
      execute 'delete from public.tb_msg_programadas m where m.origem_modulo = ''CONTA_RECEBER'' and exists (select 1 from public.firebird_contas_receber c where c.id_empresa = $1 and c.id_ctarec::text = m.id_origem)' using p_id_empresa;
    end if;
  end if;

  if to_regclass('public.firebird_contas_receber') is not null then
    execute 'delete from public.firebird_contas_receber where id_empresa = $1' using p_id_empresa;
  end if;
  if to_regclass('public.tab_cliente') is not null then
    execute 'delete from public.tab_cliente where id_empresa = $1' using p_id_empresa;
  end if;

  update public.tab_sincronizador_instalacoes
  set status = 'substituida', decisao_usuario = 'substituir_dados',
      substituido_em = now(), autorizado_em = now()
  where id = v_instalacao.id;

  update public.tab_empresas
  set setup_status = 'substituir_dados', substituicao_dados_pendente = false,
      substituicao_dados_confirmada_em = now(),
      ultimo_identificador_base_firebird = p_identificador_base_firebird,
      atualizado_setup_em = now()
  where id = p_id_empresa;

  return jsonb_build_object('success', true, 'status', 'substituir_dados', 'message', 'Dados sincronizados removidos. A próxima sincronização será completa.');
end;
$$;

revoke all on function public.fn_registrar_instalacao_firebird(text, text, text, text, text, text, text, text) from public;
grant execute on function public.fn_registrar_instalacao_firebird(text, text, text, text, text, text, text, text) to service_role;

revoke all on function public.fn_status_primeiro_acesso(text, text) from public;
revoke all on function public.fn_definir_senha_admin_primeiro_acesso(text, text, text) from public;
revoke all on function public.fn_decidir_instalacao_cnpj_existente(uuid, text, text, text) from public;
grant execute on function public.fn_status_primeiro_acesso(text, text) to anon, authenticated;
grant execute on function public.fn_definir_senha_admin_primeiro_acesso(text, text, text) to anon, authenticated;
grant execute on function public.fn_decidir_instalacao_cnpj_existente(uuid, text, text, text) to anon, authenticated;
