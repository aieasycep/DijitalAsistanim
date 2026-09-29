-- pgTAP · Row Level Security & server-side guards
-- Runs after seed.sql. User 1 = demo user "Yunus", user 2 = another user; nothing may leak across.
begin;
select plan(96);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- anon = PostgREST request without a JWT; service = edge functions with the service-role key
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;

-- Runs a statement as the current role and returns the number of rows it touched (RLS applies).
create or replace function pg_temp.rows_affected(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 1. isolation on core tables
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select is((select count(*) from public.email_threads), 10::bigint, 'user1 sees only own email threads');
select is((select count(*) from public.insights), 12::bigint, 'user1 sees only own insights');
select is((select count(*) from public.approval_actions), 2::bigint, 'user1 sees only own approvals');
select is((select count(*) from public.memory_chunks), 5::bigint, 'user1 sees only own memory chunks');
select is((select count(*) from public.contacts), 4::bigint, 'user1 sees only own contacts');
select is((select count(*) from public.profiles), 1::bigint, 'user1 sees only own profile');
select is((select count(*) from public.connected_accounts), 2::bigint, 'user1 sees only own accounts');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.email_threads), 1::bigint, 'user2 sees only own email thread');
select is((select count(*) from public.insights), 1::bigint, 'user2 sees only own insight');
select is((select count(*) from public.approval_actions), 1::bigint, 'user2 sees only own approval');
select is((select count(*) from public.memory_chunks where user_id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'user2 cannot read user1 memory');
select is((select count(*) from public.email_messages where user_id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'user2 cannot read user1 messages');

-- ---------------------------------------------------------------------------
-- 2. secrets never readable by clients
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select throws_ok('select * from public.oauth_credentials', '42501', null, 'oauth_credentials are not readable by authenticated users');
select throws_ok('select * from public.oauth_states', '42501', null, 'oauth_states are not readable by authenticated users');
select throws_ok('select * from public.ai_usage', '42501', null, 'ai_usage is not readable by authenticated users');

-- ---------------------------------------------------------------------------
-- 3. server-produced tables are read-only for clients
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.email_threads (user_id, account_id, external_thread_id, subject, last_message_at, fingerprint)
    values ('00000000-0000-4400-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'x', 'x', now(), 'fp')$$,
  '42501', null, 'clients cannot insert email threads');
select throws_ok(
  $$insert into public.insights (user_id, kind, badge, title, importance, source, entity_type, entity_id, for_date, dedupe_key)
    values ('00000000-0000-4000-8000-000000000001', 'priority', 'urgent', 'x', 'high', '{}'::jsonb, 'email_thread', gen_random_uuid(), current_date, 'k')$$,
  '42501', null, 'clients cannot insert insights');

-- cross-user writes are silently no-ops
update public.insights set status = 'completed' where id = '00000000-0000-4000-8000-00000000310f';
select pg_temp.as_admin();
select is((select status from public.insights where id = '00000000-0000-4000-8000-00000000310f'), 'active'::public.insight_status_t, 'user1 update on user2 insight has no effect');

-- ---------------------------------------------------------------------------
-- 4. client-limited updates: insight status ok, title immutable
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
update public.insights set status = 'completed', title = 'HACKED' where id = '00000000-0000-4000-8000-000000003105';
select is((select status from public.insights where id = '00000000-0000-4000-8000-000000003105'), 'completed'::public.insight_status_t, 'user can complete own insight');
select is((select title from public.insights where id = '00000000-0000-4000-8000-000000003105'), 'Trendyol siparişin bugün geliyor.', 'insight title cannot be changed by client');

-- resolve_insight RPC records feedback
select lives_ok($$select public.resolve_insight('00000000-0000-4000-8000-000000003108', 'dismissed', 'not_important')$$, 'resolve_insight works for own insight');
select is((select count(*) from public.ai_feedback where entity_id = '00000000-0000-4000-8000-000000003108' and kind = 'not_important'), 1::bigint, 'feedback row created');
select throws_ok($$select public.resolve_insight('00000000-0000-4000-8000-00000000310f', 'dismissed', null)$$, 'P0002', null, 'resolve_insight refuses other users insight');

-- profile plan is immutable for clients
update public.profiles set plan = 'free', display_name = 'Yunus E.' where id = '00000000-0000-4000-8000-000000000001';
select is((select plan from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'pro'::public.plan_t, 'client cannot change plan');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'Yunus E.', 'client can change display name');

-- ---------------------------------------------------------------------------
-- 5. approval state machine
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.approval_actions set status = 'executed' where id = '00000000-0000-4000-8000-000000003301'$$,
  '42501', null, 'client cannot jump pending → executed');
update public.approval_actions set status = 'approved', payload = payload || '{"subject":"Re: Revize teklif (v2)"}'::jsonb where id = '00000000-0000-4000-8000-000000003301';
select is((select status from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), 'approved'::public.approval_status_t, 'client can approve');
select is((select edited_by_user from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), true, 'payload edit is flagged');
select throws_ok(
  $$update public.approval_actions set status = 'rejected' where id = '00000000-0000-4000-8000-000000003301'$$,
  '42501', null, 'approved action is no longer editable by client');

select pg_temp.as_admin();
update public.approval_actions set status = 'executing', attempt_count = 1 where id = '00000000-0000-4000-8000-000000003301';
update public.approval_actions set status = 'executed', execution_result = '{"messageId":"m-sent-1"}'::jsonb where id = '00000000-0000-4000-8000-000000003301';
select is((select status from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), 'executed'::public.approval_status_t, 'server executes approved action');
select throws_ok(
  $$update public.approval_actions set status = 'pending' where id = '00000000-0000-4000-8000-000000003301'$$,
  'P0001', null, 'executed action cannot go back to pending');

-- ---------------------------------------------------------------------------
-- 6. RPCs are user-scoped
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.search_memory('teklif', 10)) >= 2, 'FTS search finds own memory (teklif)');
select is((select count(*) from public.search_memory('teklif', 10) where person_name = 'Ayşe Demir'), 0::bigint, 'search never returns other users chunks');
select is((select (public.my_entitlement() ->> 'isPro')::boolean), true, 'demo user is Pro via demo subscription');
select is(public.increment_usage('assistant_queries', 1), 1, 'usage counter increments');

-- ---------------------------------------------------------------------------
-- 7. storage path scoping
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('captures', '00000000-0000-4000-8000-000000000002/foo.png', '00000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'cannot upload into another users folder');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('captures', '00000000-0000-4000-8000-000000000001/foo.png', '00000000-0000-4000-8000-000000000001')$$,
  'can upload into own folder');

-- ---------------------------------------------------------------------------
-- 8. service-role RPC wrappers (public.* → internal.*): clients are denied, the service role executes
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select throws_ok($$select * from public.rate_limit_hit('pgtap:client', 5, 60)$$, '42501', null, 'authenticated cannot call rate_limit_hit');
select throws_ok($$select public.upsert_contact('00000000-0000-4000-8000-000000000001', 'X', 'x@example.com', now())$$, '42501', null, 'authenticated cannot call upsert_contact');
select throws_ok($$select public.expire_approvals()$$, '42501', null, 'authenticated cannot call expire_approvals');
select throws_ok($$select * from public.run_retention_cleanup()$$, '42501', null, 'authenticated cannot call run_retention_cleanup');
select throws_ok($$select internal.expire_approvals()$$, '42501', null, 'internal schema stays unusable for clients');

select pg_temp.as_anon();
select throws_ok($$select * from public.rate_limit_hit('pgtap:anon', 5, 60)$$, '42501', null, 'anon cannot call rate_limit_hit');
select throws_ok($$select public.upsert_contact('00000000-0000-4000-8000-000000000001', 'X', 'x@example.com', now())$$, '42501', null, 'anon cannot call upsert_contact');
select throws_ok($$select public.expire_approvals()$$, '42501', null, 'anon cannot call expire_approvals');
select throws_ok($$select * from public.run_retention_cleanup()$$, '42501', null, 'anon cannot call run_retention_cleanup');

-- a pending approval whose deadline has passed (user2) — the only one expired in the seed
select pg_temp.as_admin();
insert into public.approval_actions (id, user_id, type, status, what, why, payload, original_payload, idempotency_key, requested_by, expires_at)
values ('00000000-0000-4000-8000-000000004601', '00000000-0000-4000-8000-000000000002', 'reminder_create', 'pending', 'Süresi dolmuş onay', 'pgTAP', '{}'::jsonb, '{}'::jsonb, 'reminder:other:expired', 'assistant', now() - interval '1 hour');

select pg_temp.as_service();
select is((select allowed from public.rate_limit_hit('pgtap:limit', 2, 60)), true, 'service role: rate_limit_hit allows the first hit');
select is((select remaining from public.rate_limit_hit('pgtap:limit', 2, 60)), 0, 'service role: second hit exhausts the window');
select results_eq(
  $$select allowed, remaining, retry_after_sec >= 1 from public.rate_limit_hit('pgtap:limit', 2, 60)$$,
  $$values (false, 0, true)$$,
  'service role: third hit is blocked with a retry hint');
select is(public.expire_approvals(), 1, 'service role: expire_approvals expires exactly the overdue pending approval');
select is((select status from public.approval_actions where id = '00000000-0000-4000-8000-000000004601'), 'expired'::public.approval_status_t, 'overdue approval is now expired');
-- the insert happens inside the call, so it is checked in a separate statement (own snapshot)
select lives_ok(
  $$select set_config('pgtap.new_contact', public.upsert_contact('00000000-0000-4000-8000-000000000002', 'Yeni Kişi', 'Yeni@Ornek.com', now())::text, true)$$,
  'service role: upsert_contact creates a contact');
select is(
  (select user_id || ':' || display_name || ':' || emails[1] from public.contacts where id = current_setting('pgtap.new_contact', true)::uuid),
  '00000000-0000-4000-8000-000000000002:Yeni Kişi:yeni@ornek.com', 'new contact belongs to the given user with a normalised e-mail');
select is(public.upsert_contact('00000000-0000-4000-8000-000000000001', 'Mehmet Yılmaz', 'MEHMET@musteri.com', now()), '00000000-0000-4000-8000-000000002202'::uuid, 'upsert_contact matches an existing contact case-insensitively');
select is((select interaction_count from public.contacts where id = '00000000-0000-4000-8000-000000002202'), 43, 'upsert_contact bumps the interaction count');

-- ---------------------------------------------------------------------------
-- 9. priority_rules: owner CRUD works, nothing crosses users
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select is((select count(*) from public.priority_rules), 2::bigint, 'user1 sees only own priority rules');
select lives_ok(
  $$insert into public.priority_rules (user_id, type, value, label, position) values ('00000000-0000-4000-8000-000000000001', 'keyword_high', 'fatura', 'Fatura yüksek öncelik', 2)$$,
  'owner can insert a priority rule');
select is(pg_temp.rows_affected($$update public.priority_rules set enabled = false where id = '00000000-0000-4000-8000-000000002402'$$), 1, 'owner can update own rule');
select is((select enabled from public.priority_rules where id = '00000000-0000-4000-8000-000000002402'), false, 'own rule update persisted');
select throws_ok(
  $$insert into public.priority_rules (user_id, type, value, label) values ('00000000-0000-4000-8000-000000000002', 'mute_sender', 'spam@example.com', 'x')$$,
  '42501', null, 'user1 cannot insert a rule for user2');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.priority_rules), 0::bigint, 'user2 sees none of user1 rules');
select is(pg_temp.rows_affected($$update public.priority_rules set enabled = false where id = '00000000-0000-4000-8000-000000002401'$$), 0, 'cross-user update affects 0 rows');
select is(pg_temp.rows_affected($$delete from public.priority_rules where id = '00000000-0000-4000-8000-000000002401'$$), 0, 'cross-user delete affects 0 rows');

select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select is(pg_temp.rows_affected($$delete from public.priority_rules where id = '00000000-0000-4000-8000-000000002401'$$), 1, 'owner can delete own rule');
select pg_temp.as_admin();
select is((select count(*) from public.priority_rules where user_id = '00000000-0000-4000-8000-000000000001'), 2::bigint, 'user1 rules: 2 seeded + 1 inserted - 1 deleted');

-- ---------------------------------------------------------------------------
-- 10. privacy: delete_my_history is caller-scoped; retention cleanup honours each user's preference
-- ---------------------------------------------------------------------------
-- fixtures: a 200-day-old memory chunk per user
insert into public.memory_chunks (id, user_id, source_type, source_id, source, content, occurred_at)
values
  ('00000000-0000-4000-8000-000000004401', '00000000-0000-4000-8000-000000000001', 'gmail', '00000000-0000-4000-8000-000000004401', '{}'::jsonb, 'Eski hafıza · kullanıcı 1', now() - interval '200 days'),
  ('00000000-0000-4000-8000-000000004402', '00000000-0000-4000-8000-000000000002', 'gmail', '00000000-0000-4000-8000-000000004402', '{}'::jsonb, 'Eski hafıza · kullanıcı 2', now() - interval '200 days');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select is(((public.delete_my_history(30)) ->> 'memory')::int, 1, 'delete_my_history(30) removes only the callers memory older than 30 days');
select pg_temp.as_admin();
select is((select count(*) from public.memory_chunks where id = '00000000-0000-4000-8000-000000004402'), 0::bigint, 'user2 old memory removed');
select is((select count(*) from public.memory_chunks where id = '00000000-0000-4000-8000-000000004401'), 1::bigint, 'user1 old memory untouched by user2 delete_my_history');
select is((select count(*) from public.audit_logs where user_id = '00000000-0000-4000-8000-000000000002' and action = 'data.delete_history'), 1::bigint, 'delete_my_history writes an audit row for the caller only');
select throws_ok($$select public.delete_my_history()$$, '42501', null, 'delete_my_history refuses unauthenticated callers');

-- retention cutoff per preference value
select is(internal.retention_cutoff('30d', '2026-03-31T00:00:00Z'), '2026-03-01T00:00:00Z'::timestamptz, 'retention_cutoff 30d');
select is(internal.retention_cutoff('1y', '2026-03-31T00:00:00Z'), '2025-03-31T00:00:00Z'::timestamptz, 'retention_cutoff 1y');
select is(internal.retention_cutoff('forever'), null::timestamptz, 'retention_cutoff forever = no cutoff');

-- user1 keeps everything forever; user2 starts at the default 90 days
update public.user_preferences set retention = 'forever' where user_id = '00000000-0000-4000-8000-000000000001';
select is((select retention from public.user_preferences where user_id = '00000000-0000-4000-8000-000000000002'), '90d'::public.retention_option_t, 'default retention is 90d');
insert into public.email_threads (id, user_id, account_id, external_thread_id, subject, last_message_at, fingerprint)
values
  ('00000000-0000-4000-8000-000000004501', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-old-u1', 'Eski konu', now() - interval '400 days', 'fp-old-u1'),
  ('00000000-0000-4000-8000-000000004502', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c9', 't-old-u2', 'Eski konu', now() - interval '40 days', 'fp-old-u2'),
  ('00000000-0000-4000-8000-000000004503', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c9', 't-recent-u2', 'Yeni konu', now() - interval '10 days', 'fp-recent-u2');

select pg_temp.as_service();
select is((select deleted_threads from public.run_retention_cleanup() where user_id = '00000000-0000-4000-8000-000000000002'), 0, 'cleanup at 90d keeps a 40-day-old thread');
select pg_temp.as_admin();
update public.user_preferences set retention = '30d' where user_id = '00000000-0000-4000-8000-000000000002';
select pg_temp.as_service();
select results_eq(
  $$select user_id, deleted_threads from public.run_retention_cleanup() order by user_id$$,
  $$values ('00000000-0000-4000-8000-000000000002'::uuid, 1)$$,
  'cleanup at 30d removes the 40-day-old thread; users with retention=forever are never visited');
select pg_temp.as_admin();
select is((select count(*) from public.email_threads where id = '00000000-0000-4000-8000-000000004502'), 0::bigint, 'thread past user2 retention deleted');
select is((select count(*) from public.email_threads where id in ('00000000-0000-4000-8000-000000004503', '00000000-0000-4000-8000-0000000000f1')), 2::bigint, 'user2 threads within retention kept');
select is((select count(*) from public.email_threads where id = '00000000-0000-4000-8000-000000004501'), 1::bigint, 'user1 (forever) 400-day-old thread kept');
select is((select count(*) from public.memory_chunks where id = '00000000-0000-4000-8000-000000004401'), 1::bigint, 'user1 (forever) old memory kept by cleanup');

-- ---------------------------------------------------------------------------
-- 11. OAuth scopes: granted scopes readable by the owner only, never client-editable; credentials never readable
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select is(
  (select granted_scopes from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c1'),
  array['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'],
  'owner can read the granted scopes of own account');
select is((select 'https://www.googleapis.com/auth/gmail.send' = any (granted_scopes) from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c1'), false, 'read-only connection carries no write scope');
update public.connected_accounts set granted_scopes = array['https://www.googleapis.com/auth/gmail.send'] where id = '00000000-0000-4000-8000-0000000000c1';
select is((select 'https://www.googleapis.com/auth/gmail.send' = any (granted_scopes) from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c1'), false, 'client cannot self-grant a write scope');
select throws_ok($$select scope from public.oauth_credentials where account_id = '00000000-0000-4000-8000-0000000000c1'$$, '42501', null, 'owner cannot read own oauth_credentials');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c1'), 0::bigint, 'other users cannot see user1 account scopes');
select throws_ok($$select * from public.oauth_credentials where user_id = '00000000-0000-4000-8000-000000000002'$$, '42501', null, 'oauth_credentials are invisible to their owner too');

-- ---------------------------------------------------------------------------
-- 12. Push tokens follow the signed-in user (register_push_token) · device accounts keep their calendar list
-- ---------------------------------------------------------------------------
-- seed: user1 holds ExponentPushToken[demo-device-1] on device demo-device-1; user2 now signs in on that phone
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select lives_ok($$select public.register_push_token('ExponentPushToken[demo-device-1]', 'demo-device-1', 'ios', 'iPhone', '1.0.0')$$, 'user2 can register the token user1 held on the same phone');
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[demo-device-1]'), '00000000-0000-4000-8000-000000000002'::uuid, 'the token now belongs to user2');
select is((select count(*) from public.push_tokens where token = 'ExponentPushToken[demo-device-1]'), 1::bigint, 'exactly one row per token');
select lives_ok($$select public.register_push_token('ExponentPushToken[demo-device-1]', 'demo-device-1', 'ios', 'iPhone', '1.0.1')$$, 're-registering the same token is idempotent');
select is((select app_version from public.push_tokens where user_id = '00000000-0000-4000-8000-000000000002' and device_id = 'demo-device-1'), '1.0.1', 'upsert refreshes app_version');
select throws_ok($$select public.register_push_token('short', 'demo-device-1', 'ios')$$, '22023', null, 'token length is validated');
select throws_ok($$select public.register_push_token('ExponentPushToken[x]', 'demo-device-1', 'web')$$, '22023', null, 'platform must be ios/android');
select pg_temp.as_anon();
select throws_ok($$select public.register_push_token('ExponentPushToken[anon]', 'dev-anon', 'ios')$$, '42501', null, 'anon cannot execute register_push_token');

-- device-calendar accounts: the client may update granted_scopes (calendar ids) and re-activate the row
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
update public.connected_accounts set granted_scopes = array['cal-1', 'cal-2'] where id = '00000000-0000-4000-8000-0000000000c2';
select is((select granted_scopes from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c2'), array['cal-1', 'cal-2'], 'device account keeps client-written calendar ids');
update public.connected_accounts set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000c2';
update public.connected_accounts set deleted_at = null where id = '00000000-0000-4000-8000-0000000000c2';
select is((select status::text from public.connected_accounts where id = '00000000-0000-4000-8000-0000000000c2'), 'active', 're-registered device account is active again');

select * from finish();
rollback;
