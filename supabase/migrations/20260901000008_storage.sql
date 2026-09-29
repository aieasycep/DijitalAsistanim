-- Dijital Asistan · 0008 · Storage buckets & policies (private, user-scoped paths: <bucket>/<user_id>/...)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('captures', 'captures', false, 26214400, array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf', 'text/plain', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']),
  ('exports', 'exports', false, 209715200, array['application/zip', 'application/json']),
  ('briefing-audio', 'briefing-audio', false, 20971520, array['audio/mpeg', 'audio/mp4']),
  ('attachments-cache', 'attachments-cache', false, 10485760, array['application/pdf', 'text/plain'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: first folder segment is the owner's user id.
create or replace function internal.storage_owner_matches(object_name text)
returns boolean
language sql
stable
as $$
  select (storage.foldername(object_name))[1] = auth.uid()::text;
$$;

-- captures: users upload/read/delete their own files
drop policy if exists captures_insert_own on storage.objects;
create policy captures_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and internal.storage_owner_matches(name));
drop policy if exists captures_select_own on storage.objects;
create policy captures_select_own on storage.objects for select to authenticated
  using (bucket_id = 'captures' and internal.storage_owner_matches(name));
drop policy if exists captures_delete_own on storage.objects;
create policy captures_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and internal.storage_owner_matches(name));

-- exports: read own (download via short-lived signed URL created server-side)
drop policy if exists exports_select_own on storage.objects;
create policy exports_select_own on storage.objects for select to authenticated
  using (bucket_id = 'exports' and internal.storage_owner_matches(name));

-- briefing-audio: read own
drop policy if exists briefing_audio_select_own on storage.objects;
create policy briefing_audio_select_own on storage.objects for select to authenticated
  using (bucket_id = 'briefing-audio' and internal.storage_owner_matches(name));

-- attachments-cache: server only (no client policies)
