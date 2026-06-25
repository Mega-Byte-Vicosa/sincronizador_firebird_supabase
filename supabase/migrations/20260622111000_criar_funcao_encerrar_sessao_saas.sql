drop function if exists public.encerrar_sessao_saas(text);

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

revoke all on function public.encerrar_sessao_saas(text) from public;
grant execute on function public.encerrar_sessao_saas(text) to anon, authenticated;