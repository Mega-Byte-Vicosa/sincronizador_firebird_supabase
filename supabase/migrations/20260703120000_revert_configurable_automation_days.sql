begin;

update public.tab_campanha
set tipo_automacao = 'contas_a_vencer_2_dias',
    atualizado_em = now()
where tipo_automacao = 'contas_a_vencer_dias';

update public.tab_campanha
set tipo_automacao = 'clientes_inativos_90_dias',
    atualizado_em = now()
where tipo_automacao = 'clientes_sem_comprar_dias';

drop index if exists public.idx_tab_campanha_dias_antes_vencimento;
drop index if exists public.idx_tab_campanha_dias_sem_compra;

alter table public.tab_campanha
drop constraint if exists chk_tab_campanha_automacao_dias_antes_vencimento,
drop constraint if exists chk_tab_campanha_automacao_dias_sem_compra,
drop column if exists automacao_dias_antes_vencimento,
drop column if exists automacao_dias_sem_compra;

commit;
