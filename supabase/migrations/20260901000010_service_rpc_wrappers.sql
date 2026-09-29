-- Dijital Asistan · 0010 · service-role RPC wrappers for internal helpers + retention cron fix
--
-- The `internal` schema is deliberately NOT exposed through PostgREST (config.toml `[api] schemas` and
-- 0001 keep it unreachable), so `supabase-js` calls such as `.schema('internal').rpc(...)` fail with
-- PGRST106. Edge functions instead call thin `public.*` wrappers with the same signatures and return
-- types. Each wrapper is SECURITY DEFINER with an empty search_path, delegates to the fully-qualified
-- `internal.*` function and is executable ONLY by the service role (and postgres) — never by clients.

-- ---------------------------------------------------------------------------
-- public.rate_limit_hit → internal.rate_limit_hit
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_sec int)
returns table (allowed boolean, remaining int, retry_after_sec int)
language sql
security definer
set search_path = ''
as $$
  select r.allowed, r.remaining, r.retry_after_sec
  from internal.rate_limit_hit(p_key, p_limit, p_window_sec) as r;
$$;
comment on function public.rate_limit_hit(text, int, int) is
  'Service-role wrapper around internal.rate_limit_hit (fixed-window rate limit). Not callable by clients.';
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- public.upsert_contact → internal.upsert_contact
-- ---------------------------------------------------------------------------
create or replace function public.upsert_contact(p_user uuid, p_name text, p_email text, p_at timestamptz)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select internal.upsert_contact(p_user, p_name, p_email, p_at);
$$;
comment on function public.upsert_contact(uuid, text, text, timestamptz) is
  'Service-role wrapper around internal.upsert_contact (ingestion contact upsert by e-mail). Not callable by clients.';
revoke execute on function public.upsert_contact(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_contact(uuid, text, text, timestamptz) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- public.expire_approvals → internal.expire_approvals
-- ---------------------------------------------------------------------------
create or replace function public.expire_approvals()
returns int
language sql
security definer
set search_path = ''
as $$
  select internal.expire_approvals();
$$;
comment on function public.expire_approvals() is
  'Service-role wrapper around internal.expire_approvals (pending → expired past expires_at). Not callable by clients.';
revoke execute on function public.expire_approvals() from public, anon, authenticated;
grant execute on function public.expire_approvals() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- public.run_retention_cleanup → internal.run_retention_cleanup
-- ---------------------------------------------------------------------------
create or replace function public.run_retention_cleanup()
returns table (user_id uuid, deleted_threads int, deleted_messages int, deleted_memory int, deleted_captures int, deleted_notifications int)
language sql
security definer
set search_path = ''
as $$
  select r.user_id, r.deleted_threads, r.deleted_messages, r.deleted_memory, r.deleted_captures, r.deleted_notifications
  from internal.run_retention_cleanup() as r;
$$;
comment on function public.run_retention_cleanup() is
  'Service-role wrapper around internal.run_retention_cleanup (per-user retention purge + housekeeping). Not callable by clients.';
revoke execute on function public.run_retention_cleanup() from public, anon, authenticated;
grant execute on function public.run_retention_cleanup() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Retention cron: dispatch only.
-- 0009 scheduled `da_retention` to run internal.run_retention_cleanup() in SQL AND dispatch the
-- "retention" job, whose handler runs the same RPC again (then removes storage objects) — the purge
-- ran twice every night. Re-schedule the job (same name, same 03:15 UTC slot, same pg_net dispatch
-- mechanism) so the SQL side only invokes the Edge Function; the handler owns the cleanup.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise notice 'pg_cron not installed; skipping schedules';
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'da_retention';
  -- retention cleanup & approval expiry (03:15 UTC daily) — performed by the "retention" job handler
  perform cron.schedule('da_retention', '15 3 * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"retention"}'::jsonb) $c$);
end $$;
