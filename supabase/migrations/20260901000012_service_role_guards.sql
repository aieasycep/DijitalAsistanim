-- Dijital Asistan · 0012 · client-update guards recognise the service role the way PostgREST presents it
--
-- The BEFORE UPDATE guards on connected_accounts, insights, email_threads, life_events, briefings, profiles and
-- approval_actions let server-side writes through only when `request.jwt.claim.role` was 'service_role'. That
-- setting belongs to PostgREST ≤ v9; the hosted PostgREST publishes the claims as the JSON
-- `request.jwt.claims` and switches the database role (`set local role service_role`). So every update the
-- Edge Functions made with the service key ran through the *client* branch of the guards: the sync job could not
-- set connected_accounts.status / last_sync_at / last_error (accounts stayed "syncing" forever, expiry was never
-- shown), scope upgrades kept the old granted_scopes, backfill_completed never flipped, and server updates on
-- insights / threads / life events / briefings / profiles were narrowed to the client-editable columns.
--
-- Every guard now decides "server request" from the database role PostgREST switched to (postgres for cron and
-- migrations, service_role for the service key) with the JSON claims as a fallback. Clients cannot reach either:
-- `set role` needs membership and the claims are set by PostgREST from the verified JWT. The guard bodies are
-- unchanged; the check is inlined because the `internal` schema is not usable by client roles and the guards
-- run with the caller's privileges on purpose (SECURITY DEFINER would make current_user the owner).

-- insights: client may change status/snooze only
create or replace function internal.guard_insight_client_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
  new.kind := old.kind; new.badge := old.badge; new.title := old.title; new.subtitle := old.subtitle; new.reason := old.reason;
  new.importance := old.importance; new.priority_score := old.priority_score; new.priority_reasons := old.priority_reasons;
  new.source := old.source; new.actions := old.actions; new.entity_type := old.entity_type; new.entity_id := old.entity_id;
  new.tags := old.tags; new.for_date := old.for_date; new.confidence := old.confidence; new.dedupe_key := old.dedupe_key; new.user_id := old.user_id;
  return new;
end; $$;

-- email_threads: client may toggle read/dismissed/done only
create or replace function internal.guard_thread_client_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('is_read', new.is_read, 'user_dismissed', new.user_dismissed, 'user_marked_done', new.user_marked_done, 'updated_at', now()));
end; $$;

-- life_events: client may change status only
create or replace function internal.guard_life_event_client_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('status', new.status, 'updated_at', now()));
end; $$;

-- briefings: client may set opened_at / closed_at only
create or replace function internal.guard_briefing_client_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('opened_at', new.opened_at, 'closed_at', new.closed_at, 'updated_at', now()));
end; $$;

-- connected_accounts: client may update controls / is_primary / display_name, soft-delete, and (device accounts)
-- keep their calendar list in granted_scopes and re-activate the row (body from 0011)
create or replace function internal.guard_account_client_update()
returns trigger language plpgsql as $$
declare
  is_device boolean := old.provider in ('apple', 'device');
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
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

-- profiles: plan / referral / RevenueCat id / first-analysis stamp are server-owned
create or replace function internal.guard_profile_client_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then return new; end if;
  new.plan := old.plan; new.referral_code := old.referral_code; new.revenuecat_app_user_id := old.revenuecat_app_user_id; new.id := old.id;
  new.first_analysis_completed_at := old.first_analysis_completed_at;
  if old.referred_by_code is not null then new.referred_by_code := old.referred_by_code; end if;
  return new;
end; $$;

-- approval_actions: users may only move pending → approved/rejected and edit the payload while pending
create or replace function internal.guard_approval_user_update()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'service_role')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
  then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'approval is no longer editable' using errcode = '42501';
  end if;
  if new.status not in ('pending', 'approved', 'rejected') then
    raise exception 'clients may only approve or reject' using errcode = '42501';
  end if;
  -- immutable fields for clients
  new.type := old.type;
  new.original_payload := old.original_payload;
  new.idempotency_key := old.idempotency_key;
  new.requested_by := old.requested_by;
  new.user_id := old.user_id;
  new.attempt_count := old.attempt_count;
  new.execution_result := old.execution_result;
  new.executed_at := old.executed_at;
  if new.payload <> old.payload then
    new.edited_by_user := true;
  end if;
  return new;
end;
$$;
