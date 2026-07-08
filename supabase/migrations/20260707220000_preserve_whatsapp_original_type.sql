alter table public.tab_whatsapp_envios
  add column if not exists operacao_envio text;

alter table public.tab_whatsapp_envios
  drop constraint if exists tab_whatsapp_envios_tipo_envio_check;

update public.tab_whatsapp_envios
set operacao_envio = tipo_envio
where operacao_envio is null
  and tipo_envio in ('envio', 'reenvio');

update public.tab_whatsapp_envios
set tipo_envio = categoria_envio
where categoria_envio is not null
  and categoria_envio <> ''
  and tipo_envio in ('envio', 'reenvio');

create index if not exists idx_whats_envios_empresa_tipo_cliente_dia
  on public.tab_whatsapp_envios(id_empresa, tipo_envio, cliente_id, processado_em);
