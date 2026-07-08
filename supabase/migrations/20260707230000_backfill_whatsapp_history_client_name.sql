update public.tab_whatsapp_envios h
set cliente_nome = c.nome
from public.tab_cliente c
where (h.cliente_nome is null or btrim(h.cliente_nome) = '')
  and h.cliente_id is not null
  and h.cliente_id ~ '^[0-9]+$'
  and c.id_empresa = h.id_empresa
  and c.id_cliente = h.cliente_id::bigint
  and c.nome is not null
  and btrim(c.nome) <> '';
