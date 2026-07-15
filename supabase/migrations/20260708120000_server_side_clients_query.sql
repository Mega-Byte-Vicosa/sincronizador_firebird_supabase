create or replace function public.fn_clientes_consulta(
  p_token text,
  p_busca text default null,
  p_filtro text default 'todos',
  p_pagina integer default 1,
  p_tamanho_pagina integer default 100
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_empresa_id uuid; v_resultado jsonb;
begin
  select u.id_empresa into v_empresa_id
  from public.tab_sessoes_saas s
  join public.tab_usuarios_saas u on u.id = s.id_usuario
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.encerrado_em is null and s.expira_em > now()
    and u.ativo = true and u.bloqueado = false
  limit 1;
  if v_empresa_id is null then raise exception 'Sessao invalida ou expirada.'; end if;

  with base as (
    select c.*,
      length(regexp_replace(coalesce(c.ddd_celul,'') || coalesce(c.fone_celul,''), '\D', '', 'g')) between 10 and 11 as telefone_valido,
      case
        when c.contato_restrito is true then 'contato_restrito'
        when not (length(regexp_replace(coalesce(c.ddd_celul,'') || coalesce(c.fone_celul,''), '\D', '', 'g')) between 10 and 11) then 'telefone_invalido'
        when c.permite_campanha is true then 'campanha_permitida'
        else 'campanha_nao_permitida'
      end as situacao
    from public.tab_cliente c
    where c.id_empresa = v_empresa_id
  ), resumo as (
    select count(*)::integer total,
      count(*) filter (where not telefone_valido)::integer sem_telefone,
      count(*) filter (where contato_restrito is true)::integer restritos,
      count(*) filter (where situacao = 'campanha_permitida')::integer campanha_permitida,
      count(*) filter (where situacao = 'campanha_nao_permitida')::integer campanha_nao_permitida,
      count(*) filter (where dt_nascto is not null and extract(month from dt_nascto::date) = extract(month from current_date))::integer aniversariantes_mes,
      count(*) filter (where dt_ultcomp is not null and dt_ultcomp::date < current_date - 90)::integer sem_compra_90_dias
    from base
  ), filtrados as (
    select * from base b
    where (
      nullif(trim(p_busca), '') is null
      or lower(concat_ws(' ', b.nome, b.id_cliente, b.ddd_celul, b.fone_celul, b.ddd_celul || b.fone_celul, b.email_cont))
         like '%' || lower(trim(p_busca)) || '%'
    ) and (
      coalesce(nullif(p_filtro,''), 'todos') = 'todos'
      or p_filtro = b.situacao
      or (p_filtro = 'aniversariantes_mes' and b.dt_nascto is not null and extract(month from b.dt_nascto::date) = extract(month from current_date))
      or (p_filtro = 'sem_compra_90_dias' and b.dt_ultcomp is not null and b.dt_ultcomp::date < current_date - 90)
    )
  ), total_filtrado as (
    select count(*)::integer total from filtrados
  ), pagina as (
    select to_jsonb(f) - 'telefone_valido' - 'situacao' as item
    from filtrados f
    order by nome asc nulls last, id_cliente asc
    offset (greatest(1, p_pagina) - 1) * least(100, greatest(1, p_tamanho_pagina))
    limit least(100, greatest(1, p_tamanho_pagina))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item) from pagina), '[]'::jsonb),
    'totalFiltrado', (select total from total_filtrado),
    'resumo', jsonb_build_object(
      'total', (select total from resumo),
      'semTelefone', (select sem_telefone from resumo),
      'restritos', (select restritos from resumo),
      'campanhaPermitida', (select campanha_permitida from resumo),
      'campanhaNaoPermitida', (select campanha_nao_permitida from resumo),
      'aniversariantesMes', (select aniversariantes_mes from resumo),
      'semCompra90Dias', (select sem_compra_90_dias from resumo)
    )
  ) into v_resultado;
  return v_resultado;
end; $$;

grant execute on function public.fn_clientes_consulta(text,text,text,integer,integer) to anon, authenticated;
