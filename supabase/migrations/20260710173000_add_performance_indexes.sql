create or replace function pg_temp.column_exists(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

do $$
begin
  if to_regclass('public.tab_whatsapp_envios') is not null then
    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_criado_desc
      on public.tab_whatsapp_envios (id_empresa, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'status')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_status_criado_desc
      on public.tab_whatsapp_envios (id_empresa, status, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'status_entrega')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_status_entrega_criado_desc
      on public.tab_whatsapp_envios (id_empresa, status_entrega, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'cliente_telefone')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_telefone_criado_desc
      on public.tab_whatsapp_envios (id_empresa, cliente_telefone, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'documento')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_documento_criado_desc
      on public.tab_whatsapp_envios (id_empresa, documento, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'id_empresa')
       and pg_temp.column_exists('tab_whatsapp_envios', 'origem_envio')
       and pg_temp.column_exists('tab_whatsapp_envios', 'origem_modulo')
       and pg_temp.column_exists('tab_whatsapp_envios', 'criado_em') then
      create index if not exists idx_tab_whatsapp_envios_id_empresa_origem_criado_desc
      on public.tab_whatsapp_envios (id_empresa, origem_envio, origem_modulo, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_whatsapp_envios', 'btzap_message_id') then
      create index if not exists idx_tab_whatsapp_envios_btzap_message_id
      on public.tab_whatsapp_envios (btzap_message_id)
      where btzap_message_id is not null;
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.tb_msg_programadas') is not null then
    if pg_temp.column_exists('tb_msg_programadas', 'id_empresa')
       and pg_temp.column_exists('tb_msg_programadas', 'status')
       and pg_temp.column_exists('tb_msg_programadas', 'executar_em') then
      create index if not exists idx_tb_msg_programadas_id_empresa_status_executar_em
      on public.tb_msg_programadas (id_empresa, status, executar_em);
    end if;

    if pg_temp.column_exists('tb_msg_programadas', 'id_empresa')
       and pg_temp.column_exists('tb_msg_programadas', 'ativo')
       and pg_temp.column_exists('tb_msg_programadas', 'executar_em') then
      create index if not exists idx_tb_msg_programadas_id_empresa_ativo_executar_em
      on public.tb_msg_programadas (id_empresa, ativo, executar_em);
    end if;

    if pg_temp.column_exists('tb_msg_programadas', 'id_empresa')
       and pg_temp.column_exists('tb_msg_programadas', 'origem_modulo')
       and pg_temp.column_exists('tb_msg_programadas', 'id_origem') then
      create index if not exists idx_tb_msg_programadas_id_empresa_origem
      on public.tb_msg_programadas (id_empresa, origem_modulo, id_origem);
    end if;

    if pg_temp.column_exists('tb_msg_programadas', 'id_empresa')
       and pg_temp.column_exists('tb_msg_programadas', 'criado_em') then
      create index if not exists idx_tb_msg_programadas_id_empresa_criado_desc
      on public.tb_msg_programadas (id_empresa, criado_em desc);
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.firebird_contas_receber') is not null then
    if pg_temp.column_exists('firebird_contas_receber', 'empresa_id')
       and pg_temp.column_exists('firebird_contas_receber', 'data_vencimento') then
      create index if not exists idx_firebird_contas_receber_empresa_vencimento
      on public.firebird_contas_receber (empresa_id, data_vencimento);
    end if;

    if pg_temp.column_exists('firebird_contas_receber', 'empresa_id')
       and pg_temp.column_exists('firebird_contas_receber', 'situacao') then
      create index if not exists idx_firebird_contas_receber_empresa_situacao
      on public.firebird_contas_receber (empresa_id, situacao);
    end if;

    if pg_temp.column_exists('firebird_contas_receber', 'empresa_id')
       and pg_temp.column_exists('firebird_contas_receber', 'cliente_id') then
      create index if not exists idx_firebird_contas_receber_empresa_cliente
      on public.firebird_contas_receber (empresa_id, cliente_id);
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.tab_cliente') is not null then
    if pg_temp.column_exists('tab_cliente', 'id_empresa')
       and pg_temp.column_exists('tab_cliente', 'nome') then
      create index if not exists idx_tab_cliente_id_empresa_nome
      on public.tab_cliente (id_empresa, nome);
    end if;

    if pg_temp.column_exists('tab_cliente', 'id_empresa')
       and pg_temp.column_exists('tab_cliente', 'telefone') then
      create index if not exists idx_tab_cliente_id_empresa_telefone
      on public.tab_cliente (id_empresa, telefone);
    end if;

    if pg_temp.column_exists('tab_cliente', 'id_empresa')
       and pg_temp.column_exists('tab_cliente', 'celular') then
      create index if not exists idx_tab_cliente_id_empresa_celular
      on public.tab_cliente (id_empresa, celular);
    end if;

    if pg_temp.column_exists('tab_cliente', 'id_empresa')
       and pg_temp.column_exists('tab_cliente', 'documento') then
      create index if not exists idx_tab_cliente_id_empresa_documento
      on public.tab_cliente (id_empresa, documento);
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.tab_campanha') is not null then
    if pg_temp.column_exists('tab_campanha', 'id_empresa')
       and pg_temp.column_exists('tab_campanha', 'criado_em') then
      create index if not exists idx_tab_campanha_id_empresa_criado_desc
      on public.tab_campanha (id_empresa, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_campanha', 'id_empresa')
       and pg_temp.column_exists('tab_campanha', 'automatizada')
       and pg_temp.column_exists('tab_campanha', 'automacao_status') then
      create index if not exists idx_tab_campanha_id_empresa_automatizada_status
      on public.tab_campanha (id_empresa, automatizada, automacao_status);
    end if;
  end if;

  if to_regclass('public.tab_campanha_clientes') is not null then
    if pg_temp.column_exists('tab_campanha_clientes', 'id_empresa')
       and pg_temp.column_exists('tab_campanha_clientes', 'id_campanha')
       and pg_temp.column_exists('tab_campanha_clientes', 'status_envio') then
      create index if not exists idx_tab_campanha_clientes_empresa_campanha_status
      on public.tab_campanha_clientes (id_empresa, id_campanha, status_envio);
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.tab_modelos_msg') is not null then
    if pg_temp.column_exists('tab_modelos_msg', 'id_empresa')
       and pg_temp.column_exists('tab_modelos_msg', 'ativo')
       and pg_temp.column_exists('tab_modelos_msg', 'criado_em') then
      create index if not exists idx_tab_modelos_msg_id_empresa_ativo_criado_desc
      on public.tab_modelos_msg (id_empresa, ativo, criado_em desc);
    end if;
  end if;

  if to_regclass('public.tab_btzap_webhook_logs') is not null then
    if pg_temp.column_exists('tab_btzap_webhook_logs', 'status_extraido')
       and pg_temp.column_exists('tab_btzap_webhook_logs', 'processado')
       and pg_temp.column_exists('tab_btzap_webhook_logs', 'criado_em') then
      create index if not exists idx_tab_btzap_webhook_logs_status_processado_criado
      on public.tab_btzap_webhook_logs (status_extraido, processado, criado_em desc);
    end if;

    if pg_temp.column_exists('tab_btzap_webhook_logs', 'message_id_extraido') then
      create index if not exists idx_tab_btzap_webhook_logs_message_id_extraido
      on public.tab_btzap_webhook_logs (message_id_extraido)
      where message_id_extraido is not null;
    end if;
  end if;
end $$;
