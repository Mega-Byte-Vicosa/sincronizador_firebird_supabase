begin;

alter table public.tab_campanha
add column if not exists automacao_dias_antes_vencimento integer null,
add column if not exists automacao_dias_sem_compra integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_tab_campanha_automacao_dias_antes_vencimento'
      and conrelid = 'public.tab_campanha'::regclass
  ) then
    alter table public.tab_campanha
    add constraint chk_tab_campanha_automacao_dias_antes_vencimento
    check (automacao_dias_antes_vencimento is null or automacao_dias_antes_vencimento >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_tab_campanha_automacao_dias_sem_compra'
      and conrelid = 'public.tab_campanha'::regclass
  ) then
    alter table public.tab_campanha
    add constraint chk_tab_campanha_automacao_dias_sem_compra
    check (automacao_dias_sem_compra is null or automacao_dias_sem_compra >= 1);
  end if;
end $$;

create index if not exists idx_tab_campanha_dias_antes_vencimento
on public.tab_campanha (automacao_dias_antes_vencimento);

create index if not exists idx_tab_campanha_dias_sem_compra
on public.tab_campanha (automacao_dias_sem_compra);

update public.tab_campanha
set tipo_automacao = 'contas_a_vencer_dias',
    automacao_dias_antes_vencimento = coalesce(automacao_dias_antes_vencimento, 2),
    atualizado_em = now()
where tipo_automacao = 'contas_a_vencer_2_dias';

update public.tab_campanha
set tipo_automacao = 'clientes_sem_comprar_dias',
    automacao_dias_sem_compra = coalesce(automacao_dias_sem_compra, 90),
    atualizado_em = now()
where tipo_automacao = 'clientes_inativos_90_dias';

commit;
