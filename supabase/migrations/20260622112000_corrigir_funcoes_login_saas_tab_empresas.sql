drop function if exists public.autenticar_usuario_saas(text, text, text);
drop function if exists public.validar_sessao_saas(text);
drop function if exists public.encerrar_sessao_saas(text);

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
  v_empresa public.tab_empresas%rowtype;
  v_token text;
  v_agora timestamp with time zone := now();
  v_ultimo_login timestamp with time zone;
begin
  select *
  into v_usuario
  from public.tab_usuarios_saas
  where cnpj_limpo = regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g')
    and lower(usuario) = lower(trim(coalesce(p_usuario, '')))
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'CNPJ, usuário ou senha inválidos.'
    );
  end if;

  select *
  into v_empresa
  from public.tab_empresas
  where id = v_usuario.id_empresa
  limit 1;

  if not found or not v_empresa.ativo then
    return jsonb_build_object(
      'success', false,
      'message', 'Empresa inativa ou não encontrada.'
    );
  end if;

  if not v_usuario.ativo or v_usuario.bloqueado then
    return jsonb_build_object(
      'success', false,
      'message', 'Usuário inativo ou bloqueado.'
    );
  end if;

  if v_usuario.senha_hash <> crypt(coalesce(p_senha, ''), v_usuario.senha_hash) then
    update public.tab_usuarios_saas
    set tentativas_login = tentativas_login + 1
    where id = v_usuario.id;

    return jsonb_build_object(
      'success', false,
      'message', 'CNPJ, usuário ou senha inválidos.'
    );
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

  insert into public.tab_sessoes_saas (
    id_usuario,
    token_hash,
    expira_em
  )
  values (
    v_usuario.id,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_agora + interval '12 hours'
  );

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'usuario', jsonb_build_object(
      'id', v_usuario.id,
      'id_empresa', v_empresa.id,
      'cnpj', v_empresa.cnpj,
      'empresa_razao_social', v_empresa.razao_social,
      'empresa_nome_fantasia', v_empresa.nome_fantasia,
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
        'id_empresa', e.id,
        'cnpj', e.cnpj,
        'empresa_razao_social', e.razao_social,
        'empresa_nome_fantasia', e.nome_fantasia,
        'usuario', u.usuario,
        'nome', u.nome,
        'email', u.email,
        'login_em', s.criado_em,
        'ultimo_login_anterior', u.ultimo_login_em
      )
    )
    from public.tab_sessoes_saas s
    join public.tab_usuarios_saas u on u.id = s.id_usuario
    join public.tab_empresas e on e.id = u.id_empresa
    where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and s.encerrado_em is null
      and s.expira_em > now()
      and u.ativo = true
      and u.bloqueado = false
      and e.ativo = true
    limit 1
  ), jsonb_build_object(
    'success', false,
    'message', 'Sessão inválida ou expirada.'
  ));
$$;


create or replace function public.encerrar_sessao_saas(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.tab_sessoes_saas
  set encerrado_em = now()
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and encerrado_em is null;

  return true;
end;
$$;

revoke all on function public.autenticar_usuario_saas(text, text, text) from public;
revoke all on function public.validar_sessao_saas(text) from public;
revoke all on function public.encerrar_sessao_saas(text) from public;

grant execute on function public.autenticar_usuario_saas(text, text, text) to anon, authenticated;
grant execute on function public.validar_sessao_saas(text) to anon, authenticated;
grant execute on function public.encerrar_sessao_saas(text) to anon, authenticated;