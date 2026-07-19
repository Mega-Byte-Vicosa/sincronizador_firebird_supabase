insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campanha-midias',
  'campanha-midias',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'audio/mpeg',
    'audio/ogg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Frontend pode enviar midias de campanha" on storage.objects;
create policy "Frontend pode enviar midias de campanha"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'campanha-midias');

drop policy if exists "Frontend pode consultar midias de campanha" on storage.objects;
create policy "Frontend pode consultar midias de campanha"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'campanha-midias');

drop policy if exists "Frontend pode atualizar midias de campanha" on storage.objects;
create policy "Frontend pode atualizar midias de campanha"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'campanha-midias')
with check (bucket_id = 'campanha-midias');
