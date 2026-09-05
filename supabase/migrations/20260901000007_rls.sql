-- Dijital Asistan · 0007 · Row Level Security
-- Every user-owned table: RLS enabled, users only see their own rows. Service role (edge functions) bypasses RLS.
-- Sensitive tables (oauth_credentials, oauth_states, rate_limits, webhook_events, ai_usage, ai_analysis_cache,
-- briefing_send_log, push_deliveries writes) have NO client policies at all.

-- Helper macro via DO block: standard owner policies (select/insert/update/delete on user_id = auth.uid()).
do $$
declare
  t text;
  tables text[] := array[
    'connected_accounts', 'sync_states', 'contacts', 'vip_people', 'priority_rules', 'learned_preferences',
    'email_threads', 'email_messages', 'calendar_events', 'tasks', 'reminders', 'commitments', 'follow_ups',
    'life_events', 'calendar_conflicts', 'insights', 'briefings', 'briefing_items', 'assistant_threads',
    'assistant_messages', 'memory_chunks', 'captures', 'post_meeting_notes', 'android_notifications',
    'push_tokens', 'ai_feedback', 'data_export_requests', 'referral_credits', 'first_analysis_runs'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select_own', t);
  end loop;
end $$;

-- Client-writable tables (insert/update/delete own rows). Server-produced tables stay read-only for clients.
do $$
declare
  t text;
  writable text[] := array[
    'contacts', 'vip_people', 'priority_rules', 'learned_preferences', 'tasks', 'reminders', 'commitments',
    'assistant_threads', 'captures', 'post_meeting_notes', 'push_tokens', 'ai_feedback', 'calendar_conflicts', 'follow_ups'
  ];
begin
  foreach t in array writable loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);
  end loop;
end $$;

-- Limited client updates on server-owned tables --------------------------------------------------
-- insights: client may change status/snooze only (guarded by trigger below)
create policy insights_update_own on public.insights for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function internal.guard_insight_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  new.kind := old.kind; new.badge := old.badge; new.title := old.title; new.subtitle := old.subtitle; new.reason := old.reason;
  new.importance := old.importance; new.priority_score := old.priority_score; new.priority_reasons := old.priority_reasons;
  new.source := old.source; new.actions := old.actions; new.entity_type := old.entity_type; new.entity_id := old.entity_id;
  new.tags := old.tags; new.for_date := old.for_date; new.confidence := old.confidence; new.dedupe_key := old.dedupe_key; new.user_id := old.user_id;
  return new;
end; $$;
create trigger insights_client_guard before update on public.insights for each row execute function internal.guard_insight_client_update();

-- email_threads: client may toggle read/dismissed/done only
create policy email_threads_update_own on public.email_threads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function internal.guard_thread_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('is_read', new.is_read, 'user_dismissed', new.user_dismissed, 'user_marked_done', new.user_marked_done, 'updated_at', now()));
end; $$;
create trigger email_threads_client_guard before update on public.email_threads for each row execute function internal.guard_thread_client_update();

-- life_events: client may change status only
create policy life_events_update_own on public.life_events for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function internal.guard_life_event_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('status', new.status, 'updated_at', now()));
end; $$;
create trigger life_events_client_guard before update on public.life_events for each row execute function internal.guard_life_event_client_update();

-- briefings: client may set opened_at / closed_at only
create policy briefings_update_own on public.briefings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function internal.guard_briefing_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object('opened_at', new.opened_at, 'closed_at', new.closed_at, 'updated_at', now()));
end; $$;
create trigger briefings_client_guard before update on public.briefings for each row execute function internal.guard_briefing_client_update();

-- calendar_events: client may only write device-calendar events it uploaded (EventKit / Android provider)
create policy calendar_events_insert_device on public.calendar_events for insert to authenticated
  with check (user_id = auth.uid() and source in ('apple_calendar', 'device_calendar'));
create policy calendar_events_update_device on public.calendar_events for update to authenticated
  using (user_id = auth.uid() and source in ('apple_calendar', 'device_calendar'))
  with check (user_id = auth.uid() and source in ('apple_calendar', 'device_calendar'));
create policy calendar_events_delete_device on public.calendar_events for delete to authenticated
  using (user_id = auth.uid() and source in ('apple_calendar', 'device_calendar'));

-- connected_accounts: client may create device accounts and update controls/is_primary; disconnect = soft delete via update
create policy connected_accounts_insert_device on public.connected_accounts for insert to authenticated
  with check (user_id = auth.uid() and provider in ('apple', 'device', 'demo'));
create policy connected_accounts_update_own on public.connected_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function internal.guard_account_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  return jsonb_populate_record(old, jsonb_build_object(
    'controls', new.controls, 'is_primary', new.is_primary, 'display_name', new.display_name,
    'deleted_at', new.deleted_at, 'status', case when new.deleted_at is not null then 'disconnected' else old.status end,
    'updated_at', now()));
end; $$;
create trigger connected_accounts_client_guard before update on public.connected_accounts for each row execute function internal.guard_account_client_update();

-- android_notifications: client inserts (opt-in upload) own rows
create policy android_notifications_insert_own on public.android_notifications for insert to authenticated with check (user_id = auth.uid());
create policy android_notifications_delete_own on public.android_notifications for delete to authenticated using (user_id = auth.uid());

-- approval_actions ------------------------------------------------------------
alter table public.approval_actions enable row level security;
alter table public.approval_actions force row level security;
create policy approval_actions_select_own on public.approval_actions for select to authenticated using (user_id = auth.uid());
create policy approval_actions_insert_own on public.approval_actions for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy approval_actions_update_own on public.approval_actions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles / preferences ------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create or replace function internal.guard_profile_client_update()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then return new; end if;
  new.plan := old.plan; new.referral_code := old.referral_code; new.revenuecat_app_user_id := old.revenuecat_app_user_id; new.id := old.id;
  new.first_analysis_completed_at := old.first_analysis_completed_at;
  if old.referred_by_code is not null then new.referred_by_code := old.referred_by_code; end if;
  return new;
end; $$;
create trigger profiles_client_guard before update on public.profiles for each row execute function internal.guard_profile_client_update();

alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;
create policy user_preferences_select_own on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy user_preferences_update_own on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated with check (user_id = auth.uid());

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());

-- subscriptions / referrals: read-only for clients ---------------------------
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
create policy subscriptions_select_own on public.subscriptions for select to authenticated using (user_id = auth.uid());

alter table public.referrals enable row level security;
alter table public.referrals force row level security;
create policy referrals_select_involved on public.referrals for select to authenticated
  using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

-- audit_logs: read-only own rows -----------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
create policy audit_logs_select_own on public.audit_logs for select to authenticated using (user_id = auth.uid());

-- push_deliveries: read-only own rows
alter table public.push_deliveries enable row level security;
alter table public.push_deliveries force row level security;
create policy push_deliveries_select_own on public.push_deliveries for select to authenticated using (user_id = auth.uid());

-- usage_counters: read-only own rows
alter table public.usage_counters enable row level security;
alter table public.usage_counters force row level security;
create policy usage_counters_select_own on public.usage_counters for select to authenticated using (user_id = auth.uid());

-- feedback_submissions: insert own, read own
alter table public.feedback_submissions enable row level security;
alter table public.feedback_submissions force row level security;
create policy feedback_insert_own on public.feedback_submissions for insert to authenticated with check (user_id = auth.uid());
create policy feedback_select_own on public.feedback_submissions for select to authenticated using (user_id = auth.uid());

-- Server-only tables: RLS enabled with NO policies → clients get nothing. --------
alter table public.oauth_credentials enable row level security;
alter table public.oauth_credentials force row level security;
alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;
alter table public.ai_analysis_cache enable row level security;
alter table public.ai_analysis_cache force row level security;
alter table public.briefing_send_log enable row level security;
alter table public.briefing_send_log force row level security;

-- Column-level hardening: never let clients read encrypted secrets even if a policy is added later.
revoke all on public.oauth_credentials from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.ai_analysis_cache from anon, authenticated;
revoke all on public.briefing_send_log from anon, authenticated;
revoke all on schema internal from anon, authenticated;

-- anon has no business in public tables at all.
revoke all on all tables in schema public from anon;
