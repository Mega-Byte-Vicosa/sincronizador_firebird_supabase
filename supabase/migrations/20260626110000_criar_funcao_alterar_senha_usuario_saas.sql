create or replace function public.alterar_senha_usuario_saas(
  p_token text,
  p_senha_atual text,
  p_nova_senha text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_usuario public.tab_usuarios_saas%rowtype;
begin
  if length(coalesce(p_nova_senha, '')) < 6 then
    return jsonb_build_object(
      'success', false,
      'message', 'A nova senha deve ter pelo menos 6 caracteres.'
    );
  end if;

  select u.*
  into v_usuario
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
  for update of u;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'Sessão inválida ou expirada. Faça login novamente.'
    );
  end if;

  if v_usuario.senha_hash <> crypt(coalesce(p_senha_atual, ''), v_usuario.senha_hash) then
    return jsonb_build_object(
      'success', false,
      'message', 'Senha atual inválida.'
    );
  end if;

  update public.tab_usuarios_saas
  set senha_hash = crypt(p_nova_senha, gen_salt('bf', 12)),
      tentativas_login = 0,
      bloqueado = false,
      bloqueado_em = null
  where id = v_usuario.id;

  return jsonb_build_object(
    'success', true,
    'message', 'Senha alterada com sucesso.'
  );
end;
$$;

revoke all on function public.alterar_senha_usuario_saas(text, text, text) from public;
grant execute on function public.alterar_senha_usuario_saas(text, text, text) to anon, authenticated;
