-- Dijital Asistan · 0013 · audit hardening: client-callable RPCs, default privileges, pinned search_path,
-- the tasks upsert target, capture file ownership, atomic usage counters, indexes and housekeeping
--
-- Findings of the end-to-end audit of the production project (2026-10-02):
--
-- 1. public.increment_usage(counter, amount) is SECURITY DEFINER, was granted to authenticated and — through the
--    default EXECUTE on PUBLIC — callable by anon as well. It does not check the sign of `amount`, so a signed-in
--    client could call rpc('increment_usage', {counter: 'ai_tokens', amount: -1000000}) and reset the daily AI
--    budget the Edge Functions enforce from usage_counters (free plan). No client code calls it. Clients lose
--    EXECUTE; the service gets an atomic, user-addressed variant (increment_usage_for) and the Edge Functions
--    use it instead of their read-then-upsert, which lost tokens under concurrent calls.
-- 2. Every function in `public` was executable by anon through the project's default privileges. Nothing anon
--    could reach returned data (all RPCs are auth.uid()-scoped), but it was unenforced: anon now has no EXECUTE
--    in `public`, no table privileges by default, and new objects inherit that.
-- 3. The remaining functions without a pinned search_path (advisor 0011_function_search_path_mutable) get one:
--    '' where the body is fully qualified or uses built-ins only, `public` for the trigger guards.
-- 4. The Google Tasks / Microsoft To Do sync upserts tasks with ON CONFLICT (account_id, external_task_id), but
--    the only unique index on those columns was partial (WHERE external_task_id IS NOT NULL) and Postgres cannot
--    infer it → 42P10 on every tasks sync. A full unique index replaces it (NULLs are distinct, so internal
--    tasks without an external id never conflict).
-- 5. captures.storage_path is written by the client and read back by capture-analyze with the service role: the
--    row must point into the owner's own storage folder (`<user_id>/…`). The function checks it too.
-- 6. Sixteen foreign keys had no covering index (advisor 0001_unindexed_foreign_keys) and five hot queries
--    (webhook lookups, the unanalysed-thread scan, open follow-ups, active users) had none that matched.
-- 7. referrals exposed the redeemer's user id and device hash to the referrer; the referrer side only needs the
--    status. Column-level SELECT for authenticated (the server reads the rest with the service role).
-- 8. audit_logs (one row per credential decrypt per sync), ai_usage, push_deliveries and cron.job_run_details
--    grew without bound; a nightly housekeeping job trims them.

-- 1. usage counters are server-written only
revoke execute on function public.increment_usage(text, int) from public, anon, authenticated;
grant execute on function public.increment_usage(text, int) to postgres, service_role;

create or replace function public.increment_usage_for(p_user uuid, p_counter text, p_amount int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
  result int;
begin
  if p_user is null then
    raise exception 'user required' using errcode = '22004';
  end if;
  if p_counter not in ('assistant_queries', 'captures', 'ai_tokens', 'voice_seconds') then
    raise exception 'unknown counter %', p_counter;
  end if;
  execute format(
    'insert into public.usage_counters (user_id, day, %1$I, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, day) do update set %1$I = public.usage_counters.%1$I + excluded.%1$I, updated_at = now()
     returning %1$I', p_counter
  ) into result using p_user, today, p_amount;
  return result;
end;
$$;
comment on function public.increment_usage_for(uuid, text, int) is 'Service-role counterpart of increment_usage: atomic daily counter increment for any user.';
revoke execute on function public.increment_usage_for(uuid, text, int) from public, anon, authenticated;
grant execute on function public.increment_usage_for(uuid, text, int) to postgres, service_role;

-- delete_my_history: signed-in users only (scoped to auth.uid() inside)
revoke execute on function public.delete_my_history(int) from public, anon;
grant execute on function public.delete_my_history(int) to authenticated;

-- 2. anon has nothing to execute in public; new functions and tables do not pick up anon grants
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- the service-only wrappers (0010) and the counters (above) stay out of the client's reach
revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
revoke execute on function public.upsert_contact(uuid, text, text, timestamptz) from authenticated;
revoke execute on function public.expire_approvals() from authenticated;
revoke execute on function public.run_retention_cleanup() from authenticated;
revoke execute on function public.increment_usage(text, int) from authenticated;
revoke execute on function public.increment_usage_for(uuid, text, int) from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 3. pinned search_path
alter function public.set_updated_at() set search_path = '';
alter function public.immutable_unaccent(text) set search_path = '';
alter function internal.random_referral_code() set search_path = '';
alter function internal.retention_cutoff(public.retention_option_t, timestamptz) set search_path = '';
alter function internal.storage_owner_matches(text) set search_path = '';
alter function internal.setting(text) set search_path = '';
alter function internal.guard_approval_transition() set search_path = public;
alter function internal.guard_approval_user_update() set search_path = public;
alter function internal.guard_insight_client_update() set search_path = public;
alter function internal.guard_thread_client_update() set search_path = public;
alter function internal.guard_life_event_client_update() set search_path = public;
alter function internal.guard_briefing_client_update() set search_path = public;
alter function internal.guard_account_client_update() set search_path = public;
alter function internal.guard_profile_client_update() set search_path = public;

-- 4. tasks: a full unique index the sync upsert can target
create unique index if not exists tasks_account_external_uq on public.tasks (account_id, external_task_id);
drop index if exists public.tasks_external_uq;

-- 5. captures point into the owner's folder
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'captures_storage_path_owner_chk') then
    alter table public.captures add constraint captures_storage_path_owner_chk
      check (storage_path is null or storage_path like user_id::text || '/%');
  end if;
end $$;

-- 6. covering indexes for foreign keys and hot queries
create index if not exists ai_feedback_contact_idx on public.ai_feedback (contact_id);
create index if not exists android_notifications_insight_idx on public.android_notifications (insight_id);
create index if not exists approval_actions_insight_idx on public.approval_actions (insight_id);
create index if not exists assistant_threads_contact_idx on public.assistant_threads (contact_id);
create index if not exists briefing_items_insight_idx on public.briefing_items (insight_id);
create index if not exists briefing_items_user_idx on public.briefing_items (user_id);
create index if not exists briefing_send_log_briefing_idx on public.briefing_send_log (briefing_id);
create index if not exists calendar_conflicts_event_a_idx on public.calendar_conflicts (event_a_id);
create index if not exists calendar_conflicts_event_b_idx on public.calendar_conflicts (event_b_id);
create index if not exists commitments_related_event_idx on public.commitments (related_event_id);
create index if not exists follow_ups_contact_idx on public.follow_ups (contact_id);
create index if not exists follow_ups_thread_idx on public.follow_ups (thread_id);
create index if not exists oauth_states_account_idx on public.oauth_states (account_id);
create index if not exists oauth_states_user_idx on public.oauth_states (user_id);
create index if not exists post_meeting_notes_user_idx on public.post_meeting_notes (user_id);
create index if not exists vip_people_contact_idx on public.vip_people (contact_id);
create index if not exists sync_states_subscription_id_idx on public.sync_states (subscription_id) where subscription_id is not null;
create index if not exists connected_accounts_provider_email_idx on public.connected_accounts (provider, lower(email)) where deleted_at is null;
create index if not exists email_threads_unanalyzed_idx on public.email_threads (user_id, last_message_at desc) where analyzed_at is null and deleted_at is null;
create index if not exists follow_ups_open_status_idx on public.follow_ups (status) where status in ('watching', 'snoozed', 'nudge_due');
create index if not exists profiles_active_idx on public.profiles (created_at) where onboarding_completed_at is not null;

-- 7. referrals: the referrer sees the status of their invitations, not who redeemed them or from which device
revoke select on public.referrals from authenticated;
grant select (id, referrer_user_id, code, status, redeemed_at, created_at, updated_at) on public.referrals to authenticated;

-- 8. housekeeping (03:35 UTC daily): unbounded telemetry tables and the pg_cron run history
do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise notice 'pg_cron not installed; skipping housekeeping schedule';
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'da_housekeeping';
  perform cron.schedule('da_housekeeping', '35 3 * * *', $c$
    delete from public.audit_logs where actor = 'cron' and created_at < now() - interval '180 days';
    delete from public.ai_usage where created_at < now() - interval '365 days';
    delete from public.push_deliveries where created_at < now() - interval '90 days';
    delete from cron.job_run_details where end_time < now() - interval '7 days';
  $c$);
end $$;
