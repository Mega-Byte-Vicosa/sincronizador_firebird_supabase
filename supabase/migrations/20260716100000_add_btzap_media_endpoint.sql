alter table public.tab_btzap_config
  add column if not exists endpoint_envio_media text null;

update public.tab_btzap_config
set endpoint_envio_media = coalesce(endpoint_envio_media, '/send/media')
where endpoint_envio_media is null;

comment on column public.tab_btzap_config.endpoint_envio_media is
'Endpoint BTZap usado para envio de mídia/anexos, como imagem ou vídeo.';
