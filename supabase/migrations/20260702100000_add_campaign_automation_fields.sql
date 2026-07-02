alter table public.tab_campanha
add column if not exists campanha_continua boolean not null default false,
add column if not exists termina_em timestamp with time zone null,
add column if not exists automacao_status text not null default 'inativa',
add column if not exists automacao_ultima_execucao_em timestamp with time zone null,
add column if not exists automacao_proxima_execucao_em timestamp with time zone null,
add column if not exists automacao_total_envios integer not null default 0,
add column if not exists automacao_total_erros integer not null default 0;

update public.tab_campanha
set tipo_automacao = case tipo_automacao
  when 'aniversario_mes' then 'aniversariantes_mes'
  when 'aniversario_dia' then 'aniversariantes_dia'
  when 'sem_compra_90_dias' then 'clientes_inativos_90_dias'
  when 'pos_venda_2_dias' then 'pos_compra_2_dias'
  else tipo_automacao
end
where automatizada = true;

update public.tab_campanha
set
  tipo_automacao = null,
  campanha_continua = false,
  termina_em = null,
  automacao_status = 'inativa'
where automatizada = false;

update public.tab_campanha
set automacao_status = 'ativa'
where automatizada = true
  and automacao_status = 'inativa';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tab_campanha'::regclass
      and conname = 'tab_campanha_automacao_status_check'
  ) then
    alter table public.tab_campanha
    add constraint tab_campanha_automacao_status_check
    check (automacao_status in ('inativa', 'ativa', 'pausada', 'encerrada', 'erro'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tab_campanha'::regclass
      and conname = 'tab_campanha_automacao_totais_check'
  ) then
    alter table public.tab_campanha
    add constraint tab_campanha_automacao_totais_check
    check (automacao_total_envios >= 0 and automacao_total_erros >= 0);
  end if;
end;
$$;

create index if not exists idx_tab_campanha_id_empresa_automatizada
on public.tab_campanha (id_empresa, automatizada);

create index if not exists idx_tab_campanha_id_empresa_tipo_automacao
on public.tab_campanha (id_empresa, tipo_automacao);

create index if not exists idx_tab_campanha_automacao_status
on public.tab_campanha (automacao_status);

create index if not exists idx_tab_campanha_termina_em
on public.tab_campanha (termina_em);
