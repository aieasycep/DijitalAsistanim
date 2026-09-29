-- Dijital Asistan · 0011 · push_tokens: register_push_token RPC · device-calendar accounts keep their calendar list
--
-- 1. push_tokens.token is globally unique (push_tokens_token_uq) while an Expo push token identifies the
--    *install*, not the user. When a second account signs in on the same phone, the client upsert on
--    (user_id, device_id) collides with the first account's row — which RLS hides from the second user —
--    and registration fails for good (23505). Deliveries must follow the signed-in user, so the row moves
--    to the caller: rows of OTHER users holding the same token are deleted (that token can never reach them
--    again), then the caller's (user_id, device_id) row is upserted. SECURITY DEFINER because touching other
--    users' rows is exactly what RLS forbids; the caller is always auth.uid(), never a parameter.
-- 2. Device-calendar accounts (provider apple / device) are keyed on the per-install device id and keep
--    their calendar ids in granted_scopes (the client-side calendar list changes whenever the user adds or
--    removes a calendar). The client guard on connected_accounts reverted granted_scopes on every update,
--    so a re-registration could never refresh the list; device providers own no OAuth scopes, so for them
--    (and only them) the guard now lets the client write granted_scopes and re-activate a soft-deleted row.

-- ---------------------------------------------------------------------------
-- public.register_push_token(p_token, p_device_id, p_platform, p_device_name, p_app_version)
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token text,
  p_device_id text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns public.push_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  platform public.device_platform_t;
  result public.push_tokens;
begin
  if uid is null then
    raise exception 'register_push_token requires an authenticated user' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 10 or length(p_token) > 300 then
    raise exception 'push token must be 10–300 characters' using errcode = '22023';
  end if;
  if p_device_id is null or length(p_device_id) < 4 or length(p_device_id) > 128 then
    raise exception 'device id must be 4–128 characters' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'platform must be ios or android' using errcode = '22023';
  end if;
  platform := p_platform::public.device_platform_t;

  -- The token now belongs to the caller: other users' rows with this token can never be delivered to again.
  delete from public.push_tokens where token = p_token and user_id <> uid;
  -- The caller re-registered the same token under a new device id (id regenerated): drop the stale row so
  -- the (user_id, device_id) upsert below cannot collide with push_tokens_token_uq.
  delete from public.push_tokens where token = p_token and user_id = uid and device_id <> p_device_id;

  insert into public.push_tokens (user_id, token, platform, device_id, device_name, app_version, is_active, last_seen_at)
  values (uid, p_token, platform, p_device_id, left(p_device_name, 120), left(p_app_version, 40), true, now())
  on conflict (user_id, device_id) do update set
    token = excluded.token,
    platform = excluded.platform,
    device_name = excluded.device_name,
    app_version = excluded.app_version,
    is_active = true,
    last_seen_at = now()
  returning * into result;
  return result;
end;
$$;
comment on function public.register_push_token(text, text, text, text, text) is
  'Registers the caller''s Expo push token for a device: moves the token away from other users (one install = one token), upserts the caller''s (user_id, device_id) row and returns it.';
revoke execute on function public.register_push_token(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- connected_accounts client guard: device providers may update granted_scopes (their calendar ids) and
-- become active again when the client clears deleted_at. OAuth providers (google / microsoft) are unchanged:
-- granted_scopes stay server-owned (progressive OAuth) and a cleared deleted_at keeps the old status.
-- ---------------------------------------------------------------------------
create or replace function internal.guard_account_client_update()
returns trigger language plpgsql as $$
declare
  is_device boolean := old.provider in ('apple', 'device');
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object(
    'controls', new.controls, 'is_primary', new.is_primary, 'display_name', new.display_name,
    'deleted_at', new.deleted_at,
    'granted_scopes', case when is_device then new.granted_scopes else old.granted_scopes end,
    'status', case
      when new.deleted_at is not null then 'disconnected'
      when is_device and old.deleted_at is not null and new.deleted_at is null then 'active'
      else old.status end,
    'updated_at', now()));
end; $$;
