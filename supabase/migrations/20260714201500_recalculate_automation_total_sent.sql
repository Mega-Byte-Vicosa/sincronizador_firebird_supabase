with envios_reais as (
  select
    i.id_empresa,
    i.id_campanha,
    coalesce(i.historico_envio_id::text, 'item:' || i.id::text) as chave_envio
  from public.tab_automacao_execucao_itens i
  where i.status = 'enviado'

  union

  select
    h.id_empresa,
    coalesce(
      case
        when h.id_origem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then h.id_origem::uuid
        else null
      end,
      case
        when h.referencia_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then h.referencia_id::uuid
        else null
      end
    ) as id_campanha,
    h.id::text as chave_envio
  from public.tab_whatsapp_envios h
  where h.status = 'enviado'
    and h.origem_modulo = 'AUTOMACAO'
    and h.origem_envio = 'CAMPANHA_AUTOMATIZADA'
    and not exists (
      select 1
      from public.tab_automacao_execucao_itens i
      where i.historico_envio_id = h.id
    )
),
totais as (
  select
    id_empresa,
    id_campanha,
    count(distinct chave_envio)::integer as total_envios
  from envios_reais
  where id_campanha is not null
  group by id_empresa, id_campanha
)
update public.tab_campanha c
set automacao_total_envios = coalesce(t.total_envios, 0)
from totais t
where c.id_empresa = t.id_empresa
  and c.id = t.id_campanha
  and c.automatizada = true;

update public.tab_campanha c
set automacao_total_envios = 0
where c.automatizada = true
  and not exists (
    select 1
    from public.tab_automacao_execucao_itens i
    where i.id_empresa = c.id_empresa
      and i.id_campanha = c.id
      and i.status = 'enviado'
  )
  and not exists (
    select 1
    from public.tab_whatsapp_envios h
    where h.id_empresa = c.id_empresa
      and h.status = 'enviado'
      and h.origem_modulo = 'AUTOMACAO'
      and h.origem_envio = 'CAMPANHA_AUTOMATIZADA'
      and (
        h.id_origem = c.id::text
        or h.referencia_id = c.id::text
      )
  );
