alter table public.tab_btzap_config
  add column if not exists ultimo_phone_number text,
  add column if not exists ultimo_raw_phone_number text;

comment on column public.tab_btzap_config.ultimo_phone_number is
  'Telefone conectado retornado pela consulta de status da instância BTZap, já formatado para exibição.';

comment on column public.tab_btzap_config.ultimo_raw_phone_number is
  'Telefone conectado bruto retornado pela consulta de status da instância BTZap.';
