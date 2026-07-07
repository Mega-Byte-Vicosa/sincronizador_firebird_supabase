alter table public.tab_campanha
  add column if not exists automacao_repeticao_tipo text null,
  add column if not exists automacao_dias_semana integer[] null,
  add column if not exists automacao_meses integer[] null,
  add column if not exists automacao_horarios time without time zone[] null,
  add column if not exists automacao_timezone text not null default 'America/Sao_Paulo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_tab_campanha_automacao_repeticao_tipo') then
    alter table public.tab_campanha add constraint chk_tab_campanha_automacao_repeticao_tipo
      check (automacao_repeticao_tipo is null or automacao_repeticao_tipo in ('diaria', 'dias_semana', 'mensal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_tab_campanha_automacao_dias_semana') then
    alter table public.tab_campanha add constraint chk_tab_campanha_automacao_dias_semana
      check (automacao_dias_semana is null or automacao_dias_semana <@ array[0,1,2,3,4,5,6]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_tab_campanha_automacao_meses') then
    alter table public.tab_campanha add constraint chk_tab_campanha_automacao_meses
      check (automacao_meses is null or automacao_meses <@ array[1,2,3,4,5,6,7,8,9,10,11,12]);
  end if;
end $$;

update public.tab_campanha
set automacao_repeticao_tipo = 'diaria',
    automacao_horarios = array[
      coalesce((data_hora_agendamento at time zone 'America/Sao_Paulo')::time(0), time '08:00')
    ],
    automacao_timezone = 'America/Sao_Paulo'
where automatizada = true
  and automacao_repeticao_tipo is null;

create index if not exists idx_tab_campanha_automacao_repeticao_tipo on public.tab_campanha (automacao_repeticao_tipo);
create index if not exists idx_tab_campanha_automacao_dias_semana on public.tab_campanha using gin (automacao_dias_semana);
create index if not exists idx_tab_campanha_automacao_meses on public.tab_campanha using gin (automacao_meses);

create table if not exists public.tab_automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.tab_empresas(id) on delete cascade,
  id_campanha uuid not null references public.tab_campanha(id) on delete cascade,
  tipo_automacao text not null,
  data_execucao date not null,
  horario_execucao time without time zone not null,
  status text not null default 'processando' check (status in ('processando', 'concluida', 'erro')),
  total_enviados integer not null default 0 check (total_enviados >= 0),
  total_erros integer not null default 0 check (total_erros >= 0),
  erro text null,
  iniciado_em timestamp with time zone not null default now(),
  finalizado_em timestamp with time zone null,
  criado_em timestamp with time zone not null default now()
);

create unique index if not exists uq_tab_automacao_execucoes_campanha_data_hora
  on public.tab_automacao_execucoes (id_campanha, data_execucao, horario_execucao);
create index if not exists idx_tab_automacao_execucoes_id_empresa on public.tab_automacao_execucoes (id_empresa);
create index if not exists idx_tab_automacao_execucoes_status on public.tab_automacao_execucoes (status);

alter table public.tab_automacao_execucoes enable row level security;
revoke all on public.tab_automacao_execucoes from anon, authenticated;
