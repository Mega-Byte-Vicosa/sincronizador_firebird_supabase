alter table public.tab_whatsapp_envios
  add column if not exists btzap_message_id text,
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists visualizado_em timestamptz,
  add column if not exists webhook_payload jsonb,
  add column if not exists ultimo_webhook_em timestamptz;

update public.tab_whatsapp_envios
set btzap_message_id = mensagem_id_externo
where btzap_message_id is null
  and mensagem_id_externo is not null;

create index if not exists idx_tab_whatsapp_envios_btzap_message_id
  on public.tab_whatsapp_envios (btzap_message_id)
  where btzap_message_id is not null;

create index if not exists idx_tab_whatsapp_envios_mensagem_id_externo_empresa
  on public.tab_whatsapp_envios (id_empresa, mensagem_id_externo)
  where mensagem_id_externo is not null;

create index if not exists idx_tab_whatsapp_envios_btzap_message_id_empresa
  on public.tab_whatsapp_envios (id_empresa, btzap_message_id)
  where btzap_message_id is not null;
