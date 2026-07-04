alter table public.tab_campanha
add column if not exists automacao_dias_carencia integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_tab_campanha_automacao_dias_carencia'
      and conrelid = 'public.tab_campanha'::regclass
  ) then
    alter table public.tab_campanha
    add constraint chk_tab_campanha_automacao_dias_carencia
    check (
      automacao_dias_carencia is null
      or automacao_dias_carencia >= 0
    );
  end if;
end $$;

create index if not exists idx_tab_campanha_automacao_dias_carencia
on public.tab_campanha (automacao_dias_carencia);
