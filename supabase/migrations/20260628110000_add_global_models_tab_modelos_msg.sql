alter table public.tab_modelos_msg
alter column id_empresa drop not null;

alter table public.tab_modelos_msg
add column if not exists modelo_global boolean not null default false;

alter table public.tab_modelos_msg
add column if not exists modelo_sistema boolean not null default false;

create index if not exists idx_tab_modelos_msg_global_ativo
on public.tab_modelos_msg (modelo_global, ativo);

create index if not exists idx_tab_modelos_msg_sistema_ativo
on public.tab_modelos_msg (modelo_sistema, ativo);

create index if not exists idx_tab_modelos_msg_empresa_global
on public.tab_modelos_msg (id_empresa, modelo_global, ativo);

drop policy if exists "Frontend pode cadastrar modelos de mensagem" on public.tab_modelos_msg;
drop policy if exists "Frontend pode atualizar modelos de mensagem" on public.tab_modelos_msg;

create policy "Frontend pode cadastrar modelos de mensagem"
on public.tab_modelos_msg for insert to anon, authenticated
with check (
  id_empresa is not null
  and modelo_global = false
  and modelo_sistema = false
);

create policy "Frontend pode atualizar modelos de mensagem"
on public.tab_modelos_msg for update to anon, authenticated
using (
  id_empresa is not null
  and modelo_global = false
  and modelo_sistema = false
)
with check (
  id_empresa is not null
  and modelo_global = false
  and modelo_sistema = false
);

comment on column public.tab_modelos_msg.modelo_global is
'Indica modelo compartilhado com todas as empresas.';

comment on column public.tab_modelos_msg.modelo_sistema is
'Indica modelo padrão mantido exclusivamente pelo sistema.';
