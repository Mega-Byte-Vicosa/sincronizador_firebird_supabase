create or replace function public.atualizar_permissoes_cliente_saas(
  p_token text,
  p_id_cliente text,
  p_permite_campanha boolean,
  p_permite_cobranca_aviso boolean,
  p_contato_restrito boolean,
  p_motivo_restricao text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id_empresa uuid;
  v_motivo text := nullif(trim(coalesce(p_motivo_restricao, '')), '');
  v_cliente public.tab_cliente%rowtype;
begin
  select u.id_empresa
  into v_id_empresa
  from public.tab_sessoes_saas s
  join public.tab_usuarios_saas u on u.id = s.id_usuario
  join public.tab_empresas e on e.id = u.id_empresa
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.encerrado_em is null
    and s.expira_em > now()
    and u.ativo = true
    and u.bloqueado = false
    and e.ativo = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'Sessão inválida ou expirada. Faça login novamente.'
    );
  end if;

  if coalesce(p_id_cliente, '') = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Cliente não informado.'
    );
  end if;

  if p_contato_restrito and v_motivo is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Informe o motivo da restrição.'
    );
  end if;

  update public.tab_cliente
  set permite_campanha = case
        when coalesce(p_contato_restrito, false) then false
        else coalesce(p_permite_campanha, false)
      end,
      permite_cobranca_aviso = case
        when coalesce(p_contato_restrito, false) then false
        else coalesce(p_permite_cobranca_aviso, true)
      end,
      contato_restrito = coalesce(p_contato_restrito, false),
      motivo_restricao = case when coalesce(p_contato_restrito, false) then v_motivo else null end,
      restrito_em = case
        when coalesce(p_contato_restrito, false) then coalesce(restrito_em, now())
        else null
      end
  where id_empresa = v_id_empresa
    and id_cliente::text = p_id_cliente
  returning * into v_cliente;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'Cliente não encontrado para a empresa logada.'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Permissões de contato atualizadas com sucesso.',
    'cliente', to_jsonb(v_cliente)
  );
end;
$$;

revoke all on function public.atualizar_permissoes_cliente_saas(text, text, boolean, boolean, boolean, text) from public;
grant execute on function public.atualizar_permissoes_cliente_saas(text, text, boolean, boolean, boolean, text) to anon, authenticated;
