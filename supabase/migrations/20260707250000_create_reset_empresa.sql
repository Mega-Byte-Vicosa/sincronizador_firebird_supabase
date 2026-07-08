create table if not exists public.tab_reset_empresa_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.tab_empresas(id) on delete restrict,
  usuario_id uuid references public.tab_usuarios_saas(id) on delete set null,
  executado_em timestamptz not null default now(),
  total_registros_apagados integer not null default 0,
  detalhes jsonb,
  ip_origem text,
  user_agent text
);

create index if not exists idx_reset_empresa_logs_empresa_data
  on public.tab_reset_empresa_logs(empresa_id, executado_em desc);

alter table public.tab_reset_empresa_logs enable row level security;
revoke all on public.tab_reset_empresa_logs from anon, authenticated;

create or replace function public.fn_resetar_empresa_dados(
  p_empresa_id uuid,
  p_usuario_id uuid default null,
  p_ip_origem text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalhes jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_qtd integer := 0;
begin
  if p_empresa_id is null or not exists (select 1 from public.tab_empresas where id = p_empresa_id) then
    raise exception 'Empresa informada nao existe.';
  end if;

  -- Filhos antes dos pais para respeitar as chaves estrangeiras.
  if to_regclass('public.tab_automacao_execucoes') is not null then
    delete from public.tab_automacao_execucoes where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tab_automacao_execucoes', v_qtd);
  end if;

  if to_regclass('public.tb_msg_programadas') is not null then
    delete from public.tb_msg_programadas where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tb_msg_programadas', v_qtd);
  end if;

  if to_regclass('public.tab_campanha_clientes') is not null then
    delete from public.tab_campanha_clientes where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tab_campanha_clientes', v_qtd);
  end if;

  if to_regclass('public.tab_whatsapp_envios') is not null then
    delete from public.tab_whatsapp_envios where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tab_whatsapp_envios', v_qtd);
  end if;

  if to_regclass('public.tab_campanha') is not null then
    delete from public.tab_campanha where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tab_campanha', v_qtd);
  end if;

  if to_regclass('public.firebird_contas_receber') is not null then
    delete from public.firebird_contas_receber where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('firebird_contas_receber', v_qtd);
  end if;

  if to_regclass('public.tab_cliente') is not null then
    delete from public.tab_cliente where id_empresa = p_empresa_id;
    get diagnostics v_qtd = row_count; v_total := v_total + v_qtd;
    v_detalhes := v_detalhes || jsonb_build_object('tab_cliente', v_qtd);
  end if;

  insert into public.tab_reset_empresa_logs (
    empresa_id, usuario_id, total_registros_apagados, detalhes, ip_origem, user_agent
  ) values (
    p_empresa_id, p_usuario_id, v_total, v_detalhes, p_ip_origem, p_user_agent
  );

  return jsonb_build_object(
    'empresa_id', p_empresa_id,
    'tabelas_limpas', v_detalhes,
    'total_registros_apagados', v_total
  );
end;
$$;

revoke all on function public.fn_resetar_empresa_dados(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_resetar_empresa_dados(uuid, uuid, text, text) to service_role;

comment on function public.fn_resetar_empresa_dados(uuid, uuid, text, text) is
  'Remove atomicamente apenas dados operacionais da empresa. Preserva empresa, usuarios, parametros, modelos e configuracoes.';
