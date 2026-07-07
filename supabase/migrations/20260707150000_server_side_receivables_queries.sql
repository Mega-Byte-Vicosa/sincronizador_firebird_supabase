create or replace function public.fn_contas_receber_consulta(
  p_id_empresa uuid,
  p_busca text default null,
  p_vencimento_de date default null,
  p_vencimento_ate date default null,
  p_tipo_conta text default null,
  p_status text default 'Todos',
  p_pagina integer default 1,
  p_tamanho_pagina integer default 50
) returns jsonb
language sql stable security invoker set search_path = public
as $$
with classificadas as (
  select c.*,
    case
      when c.dt_baixa is not null or coalesce(c.vlr_receb, 0) > 0 then 'recebida'
      when c.dt_vencto::date = (current_timestamp at time zone 'America/Sao_Paulo')::date then 'vencendo_hoje'
      when c.dt_vencto::date > (current_timestamp at time zone 'America/Sao_Paulo')::date then 'a_vencer'
      when (current_timestamp at time zone 'America/Sao_Paulo')::date <= c.dt_vencto::date + greatest(0, coalesce(c.dias_carencia, 0)::integer) then 'em_carencia'
      else 'vencida'
    end as status_calculado
  from public.firebird_contas_receber c
  where c.id_empresa = p_id_empresa
    and (p_vencimento_de is null or c.dt_vencto::date >= p_vencimento_de)
    and (p_vencimento_ate is null or c.dt_vencto::date <= p_vencimento_ate)
    and (nullif(p_tipo_conta, '') is null or p_tipo_conta = 'Todos' or c.tip_ctarec = p_tipo_conta)
    and (
      nullif(trim(p_busca), '') is null
      or lower(concat_ws(' ', c.documento, c.historico, c.id_cliente, c.id_ctarec, c.cliente_nome,
        c.cliente_telefone, c.cliente_email, c.vendedor_nome, c.vendedor_apelido,
        c.vendedor_email, c.vendedor_telefone, c.id_vendedor, c.vendedor_codigo,
        c.nsu_cartao, c.txid_qrcode_pix, c.dt_vencto)) like '%' || lower(trim(p_busca)) || '%'
    )
), filtradas as (
  select * from classificadas
  where p_status = 'Todos'
    or (p_status = 'Vencidas e vencendo hoje' and status_calculado in ('vencida', 'em_carencia', 'vencendo_hoje'))
    or (p_status = 'Vencendo hoje' and status_calculado = 'vencendo_hoje')
    or (p_status = 'A vencer' and status_calculado = 'a_vencer')
    or (p_status = 'Em carência' and status_calculado = 'em_carencia')
    or (p_status = 'Vencidas' and status_calculado = 'vencida')
    or (p_status = 'Recebidas' and status_calculado = 'recebida')
), resumo as (
  select count(*)::integer as total,
    coalesce(sum(vlr_ctarec), 0)::numeric as valor_total,
    count(*) filter (where status_calculado = 'vencida')::integer as qtd_vencidas,
    coalesce(sum(vlr_ctarec) filter (where status_calculado = 'vencida'), 0)::numeric as valor_vencido,
    count(*) filter (where status_calculado in ('a_vencer', 'vencendo_hoje', 'em_carencia'))::integer as qtd_a_vencer,
    coalesce(sum(vlr_ctarec) filter (where status_calculado in ('a_vencer', 'vencendo_hoje', 'em_carencia')), 0)::numeric as valor_a_vencer
  from filtradas
), pagina as (
  select to_jsonb(f) - 'status_calculado' as item
  from filtradas f
  order by dt_vencto desc, id_ctarec desc
  offset (greatest(1, p_pagina) - 1) * least(100, greatest(1, p_tamanho_pagina))
  limit least(100, greatest(1, p_tamanho_pagina))
)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(item) from pagina), '[]'::jsonb),
  'total', (select total from resumo),
  'resumo', jsonb_build_object(
    'contasListadas', (select total from resumo), 'valorTotal', (select valor_total from resumo),
    'qtdVencidas', (select qtd_vencidas from resumo), 'valorVencido', (select valor_vencido from resumo),
    'qtdAVencer', (select qtd_a_vencer from resumo), 'valorAVencer', (select valor_a_vencer from resumo)
  )
);
$$;

create or replace function public.fn_dashboard_contas_resumo(
  p_id_empresa uuid,
  p_mes_atraso date,
  p_mes_recebidas date
) returns jsonb
language sql stable security invoker set search_path = public
as $$
with classificadas as (
  select c.*,
    case
      when c.dt_baixa is not null or coalesce(c.vlr_receb, 0) > 0 then 'recebida'
      when c.dt_vencto::date = (current_timestamp at time zone 'America/Sao_Paulo')::date then 'vencendo_hoje'
      when c.dt_vencto::date > (current_timestamp at time zone 'America/Sao_Paulo')::date then 'a_vencer'
      when (current_timestamp at time zone 'America/Sao_Paulo')::date <= c.dt_vencto::date + greatest(0, coalesce(c.dias_carencia, 0)::integer) then 'em_carencia'
      else 'vencida'
    end as status_calculado
  from public.firebird_contas_receber c where c.id_empresa = p_id_empresa
), resumo as (
  select count(*)::integer total,
    count(*) filter (where status_calculado = 'vencida')::integer vencidas,
    count(*) filter (where status_calculado = 'vencendo_hoje')::integer vencendo_hoje,
    count(*) filter (where status_calculado = 'em_carencia')::integer em_carencia,
    count(*) filter (where status_calculado = 'a_vencer')::integer a_vencer,
    count(*) filter (where status_calculado = 'recebida')::integer recebidas,
    coalesce(sum(vlr_ctarec) filter (where status_calculado = 'vencendo_hoje'), 0)::numeric valor_vencendo_hoje
  from classificadas
), atraso as (
  select count(distinct id_cliente)::integer clientes,
    coalesce(sum(vlr_ctarec), 0)::numeric valor
  from classificadas
  where status_calculado = 'vencida'
    and dt_vencto::date >= date_trunc('month', p_mes_atraso)::date
    and dt_vencto::date < (date_trunc('month', p_mes_atraso) + interval '1 month')::date
), recebidas_mes as (
  select count(*)::integer quantidade, coalesce(sum(vlr_receb), 0)::numeric valor
  from classificadas
  where status_calculado = 'recebida'
    and coalesce(dt_baixa::date, dt_vencto::date) >= date_trunc('month', p_mes_recebidas)::date
    and coalesce(dt_baixa::date, dt_vencto::date) < (date_trunc('month', p_mes_recebidas) + interval '1 month')::date
)
select jsonb_build_object(
  'total', (select total from resumo), 'vencidas', (select vencidas from resumo),
  'vencendoHoje', (select vencendo_hoje from resumo), 'emCarencia', (select em_carencia from resumo),
  'aVencer', (select a_vencer from resumo), 'recebidas', (select recebidas from resumo),
  'valorVencendoHoje', (select valor_vencendo_hoje from resumo),
  'clientesEmAtrasoMes', (select clientes from atraso), 'valorEmAtrasoMes', (select valor from atraso),
  'quantidadeRecebidasMes', (select quantidade from recebidas_mes), 'valorRecebidasMes', (select valor from recebidas_mes)
);
$$;

grant execute on function public.fn_contas_receber_consulta(uuid,text,date,date,text,text,integer,integer) to anon, authenticated, service_role;
grant execute on function public.fn_dashboard_contas_resumo(uuid,date,date) to anon, authenticated, service_role;
