begin;

alter table public.tab_campanha
add column if not exists automacao_dias_pos_compra integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_tab_campanha_automacao_dias_pos_compra'
      and conrelid = 'public.tab_campanha'::regclass
  ) then
    alter table public.tab_campanha
    add constraint chk_tab_campanha_automacao_dias_pos_compra
    check (automacao_dias_pos_compra is null or automacao_dias_pos_compra >= 1);
  end if;
end $$;

create index if not exists idx_tab_campanha_dias_pos_compra
on public.tab_campanha (automacao_dias_pos_compra);

update public.tab_campanha
set tipo_automacao = 'pos_compra_dias',
    automacao_dias_pos_compra = coalesce(automacao_dias_pos_compra, 2),
    atualizado_em = now()
where tipo_automacao = 'pos_compra_2_dias';

commit;
