create index if not exists idx_tab_whatsapp_envios_mensagem_id_externo
on public.tab_whatsapp_envios (mensagem_id_externo)
where mensagem_id_externo is not null;

create index if not exists idx_tab_whatsapp_envios_empresa_status_entrega
on public.tab_whatsapp_envios (id_empresa, status_entrega);
