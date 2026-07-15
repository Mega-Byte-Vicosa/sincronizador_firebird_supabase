create table if not exists public.tab_btzap_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  evento text null,
  status_extraido text null,
  message_id_extraido text null,
  status_http integer null,
  processado boolean not null default false,
  motivo text null,
  payload jsonb null
);
