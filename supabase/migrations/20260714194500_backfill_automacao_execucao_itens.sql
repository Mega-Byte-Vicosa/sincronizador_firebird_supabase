insert into public.tab_automacao_execucao_itens (
  id_empresa,
  id_execucao,
  id_campanha,
  tipo_automacao,
  cliente_id,
  cliente_nome,
  cliente_telefone,
  documento,
  mensagem,
  status,
  tentativa_atual,
  ultima_tentativa_em,
  proxima_tentativa_em,
  motivo_bloqueio,
  erro_envio,
  historico_envio_id,
  request_payload,
  response_payload,
  criado_em,
  atualizado_em
)
select
  h.id_empresa,
  null::uuid,
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
    end,
    c.id
  ) as id_campanha,
  c.tipo_automacao,
  h.cliente_id,
  h.cliente_nome,
  h.cliente_telefone,
  h.documento,
  h.mensagem,
  'pendente',
  greatest(coalesce(h.tentativas, 0), 0),
  coalesce(h.ultima_tentativa_em, h.criado_em),
  h.proxima_tentativa_em,
  h.motivo_bloqueio,
  h.erro,
  h.id,
  h.request_payload,
  h.response_payload,
  coalesce(h.criado_em, now()),
  now()
from public.tab_whatsapp_envios h
join public.tab_campanha c
  on c.id_empresa = h.id_empresa
 and c.id = coalesce(
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
  )
where h.origem_modulo = 'AUTOMACAO'
  and h.origem_envio = 'CAMPANHA_AUTOMATIZADA'
  and h.status = 'pendente'
  and h.proxima_tentativa_em is not null
  and h.cliente_telefone is not null
  and h.mensagem is not null
  and not exists (
    select 1
    from public.tab_automacao_execucao_itens i
    where i.historico_envio_id = h.id
  )
  and not exists (
    select 1
    from public.tab_whatsapp_envios enviado
    where enviado.id_empresa = h.id_empresa
      and enviado.origem_modulo = 'AUTOMACAO'
      and enviado.origem_envio = 'CAMPANHA_AUTOMATIZADA'
      and enviado.status = 'enviado'
      and enviado.cliente_telefone = h.cliente_telefone
      and enviado.id_origem = h.id_origem
      and coalesce(enviado.documento, '') = coalesce(h.documento, '')
      and enviado.criado_em > h.criado_em
  );
