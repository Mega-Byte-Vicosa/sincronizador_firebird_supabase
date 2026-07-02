drop policy if exists "Frontend pode atualizar modelos de mensagem" on public.tab_modelos_msg;

create policy "Frontend pode atualizar modelos de mensagem"
on public.tab_modelos_msg for update to anon, authenticated
using (
  modelo_global = true
  or (
    id_empresa is not null
    and modelo_global = false
    and modelo_sistema = false
  )
)
with check (
  (
    modelo_global = true
    and id_empresa is null
  )
  or (
    id_empresa is not null
    and modelo_global = false
    and modelo_sistema = false
  )
);
