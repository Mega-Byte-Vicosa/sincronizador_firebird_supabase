create table if not exists public.tab_automacao_execucao_itens (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.tab_empresas(id) on delete cascade,
  id_execucao uuid null references public.tab_automacao_execucoes(id) on delete set null,
  id_campanha uuid not null references public.tab_campanha(id) on delete cascade,
  tipo_automacao text null,
  cliente_id text null,
  cliente_nome text null,
  cliente_telefone text null,
  documento text null,
  mensagem text null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro')),
  tentativa_atual integer not null default 0 check (tentativa_atual >= 0),
  ultima_tentativa_em timestamptz null,
  proxima_tentativa_em timestamptz null,
  motivo_bloqueio text null,
  erro_envio text null,
  historico_envio_id uuid null references public.tab_whatsapp_envios(id) on delete set null,
  request_payload jsonb null,
  response_payload jsonb null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_tab_automacao_execucao_itens_empresa_status
  on public.tab_automacao_execucao_itens (id_empresa, status, proxima_tentativa_em);

create index if not exists idx_tab_automacao_execucao_itens_campanha
  on public.tab_automacao_execucao_itens (id_campanha, criado_em desc);

create index if not exists idx_tab_automacao_execucao_itens_execucao
  on public.tab_automacao_execucao_itens (id_execucao);

alter table public.tab_automacao_execucao_itens enable row level security;
revoke all on public.tab_automacao_execucao_itens from anon, authenticated;

grant select on public.tab_automacao_execucao_itens to anon, authenticated;

drop policy if exists "Frontend pode consultar itens de execucao de automacao"
on public.tab_automacao_execucao_itens;

create policy "Frontend pode consultar itens de execucao de automacao"
on public.tab_automacao_execucao_itens
for select
to anon, authenticated
using (true);
