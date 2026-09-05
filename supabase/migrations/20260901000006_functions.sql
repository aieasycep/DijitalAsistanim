-- Dijital Asistan · 0006 · SQL functions & RPCs (security invoker unless noted; RLS applies)

-- ---------------------------------------------------------------------------
-- Memory search: semantic (pgvector) when an embedding is supplied, else Turkish FTS.
-- ---------------------------------------------------------------------------
create or replace function public.search_memory(
  query text,
  match_count int default 20,
  query_embedding extensions.vector default null,
  contact uuid default null
)
returns table (
  id uuid,
  source_type public.source_type_t,
  source_id uuid,
  source jsonb,
  content text,
  topic text,
  person_name text,
  occurred_at timestamptz,
  score real,
  mode text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  q tsquery;
begin
  if query_embedding is not null then
    return query
      select m.id, m.source_type, m.source_id, m.source, m.content, m.topic, m.person_name, m.occurred_at,
             (1 - (m.embedding <=> query_embedding))::real as score, 'semantic'::text as mode
      from public.memory_chunks m
      where m.user_id = auth.uid()
        and m.embedding is not null
        and (contact is null or m.contact_id = contact)
        and (m.expires_at is null or m.expires_at > now())
      order by m.embedding <=> query_embedding
      limit greatest(1, least(match_count, 50));
    return;
  end if;

  q := websearch_to_tsquery('turkish', public.immutable_unaccent(coalesce(query, '')));
  return query
    select m.id, m.source_type, m.source_id, m.source, m.content, m.topic, m.person_name, m.occurred_at,
           ts_rank_cd(m.tsv, q)::real as score, 'fts'::text as mode
    from public.memory_chunks m
    where m.user_id = auth.uid()
      and (contact is null or m.contact_id = contact)
      and (m.expires_at is null or m.expires_at > now())
      and (m.tsv @@ q or m.content ilike '%' || query || '%' or coalesce(m.person_name, '') ilike '%' || query || '%')
    order by (m.tsv @@ q) desc, ts_rank_cd(m.tsv, q) desc, m.occurred_at desc
    limit greatest(1, least(match_count, 50));
end;
$$;

grant execute on function public.search_memory(text, int, extensions.vector, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Increment a daily usage counter atomically; returns the new value.
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(counter text, amount int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date;
  result int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if counter not in ('assistant_queries', 'captures', 'ai_tokens', 'voice_seconds') then
    raise exception 'unknown counter %', counter;
  end if;
  execute format(
    'insert into public.usage_counters (user_id, day, %1$I, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, day) do update set %1$I = public.usage_counters.%1$I + excluded.%1$I, updated_at = now()
     returning %1$I', counter
  ) into result using uid, today, amount;
  return result;
end;
$$;
grant execute on function public.increment_usage(text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window). Called by edge functions with service role.
-- ---------------------------------------------------------------------------
create or replace function internal.rate_limit_hit(p_key text, p_limit int, p_window_sec int)
returns table (allowed boolean, remaining int, retry_after_sec int)
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.rate_limits;
begin
  insert into public.rate_limits (key, count, window_start, expires_at)
  values (p_key, 1, now(), now() + make_interval(secs => p_window_sec))
  on conflict (key) do update
    set count = case when public.rate_limits.expires_at < now() then 1 else public.rate_limits.count + 1 end,
        window_start = case when public.rate_limits.expires_at < now() then now() else public.rate_limits.window_start end,
        expires_at = case when public.rate_limits.expires_at < now() then now() + make_interval(secs => p_window_sec) else public.rate_limits.expires_at end
  returning * into row;
  allowed := row.count <= p_limit;
  remaining := greatest(0, p_limit - row.count);
  retry_after_sec := case when allowed then 0 else greatest(1, ceil(extract(epoch from (row.expires_at - now())))::int) end;
  return next;
end;
$$;
grant execute on function internal.rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Approval state transition guard (server-side enforcement of the state machine).
-- ---------------------------------------------------------------------------
create or replace function internal.guard_approval_transition()
returns trigger
language plpgsql
as $$
declare
  ok boolean := false;
begin
  if old.status = new.status then
    return new;
  end if;
  ok := case
    when old.status = 'pending' and new.status in ('approved', 'rejected', 'expired') then true
    when old.status = 'approved' and new.status in ('executing', 'expired') then true
    when old.status = 'executing' and new.status in ('executed', 'failed') then true
    when old.status = 'failed' and new.status = 'executing' and new.attempt_count <= 3 then true
    else false
  end;
  if not ok then
    raise exception 'illegal approval transition % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'approved' then new.approved_at := coalesce(new.approved_at, now()); end if;
  if new.status = 'rejected' then new.rejected_at := coalesce(new.rejected_at, now()); end if;
  if new.status = 'executed' then new.executed_at := coalesce(new.executed_at, now()); end if;
  return new;
end;
$$;
create trigger approval_actions_transition before update on public.approval_actions
  for each row execute function internal.guard_approval_transition();

-- Users may only move pending → approved/rejected and may edit payload only while pending.
create or replace function internal.guard_approval_user_update()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' or current_user = 'postgres' then
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
-- Named with a leading "0" so it fires BEFORE the transition guard (triggers run in name order):
-- clients get a clear permission error instead of a state-machine error.
create trigger approval_actions_0_user_guard before update on public.approval_actions
  for each row execute function internal.guard_approval_user_update();

-- ---------------------------------------------------------------------------
-- Expire stale approvals (called by cron dispatcher).
-- ---------------------------------------------------------------------------
create or replace function internal.expire_approvals()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.approval_actions set status = 'expired' where status = 'pending' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention cleanup. Deletes user content older than the user's retention cutoff.
-- OAuth connections, approvals audit and subscriptions are never touched here.
-- ---------------------------------------------------------------------------
create or replace function internal.retention_cutoff(opt public.retention_option_t, ts timestamptz default now())
returns timestamptz
language sql
immutable
as $$
  select case opt
    when '30d' then ts - interval '30 days'
    when '90d' then ts - interval '90 days'
    when '1y' then ts - interval '1 year'
    else null
  end;
$$;

create or replace function internal.run_retention_cleanup()
returns table (user_id uuid, deleted_threads int, deleted_messages int, deleted_memory int, deleted_captures int, deleted_notifications int)
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  r record;
  cutoff timestamptz;
  n1 int; n2 int; n3 int; n4 int; n5 int;
begin
  for r in select p.user_id, p.retention from public.user_preferences p where p.retention <> 'forever' loop
    cutoff := internal.retention_cutoff(r.retention);
    delete from public.email_messages m where m.user_id = r.user_id and m.sent_at < cutoff;
    get diagnostics n2 = row_count;
    delete from public.email_threads t where t.user_id = r.user_id and t.last_message_at < cutoff;
    get diagnostics n1 = row_count;
    delete from public.memory_chunks mc where mc.user_id = r.user_id and mc.occurred_at < cutoff;
    get diagnostics n3 = row_count;
    update public.captures c set deleted_at = now() where c.user_id = r.user_id and c.created_at < cutoff and c.deleted_at is null;
    get diagnostics n4 = row_count;
    delete from public.android_notifications a where a.user_id = r.user_id and a.posted_at < cutoff;
    get diagnostics n5 = row_count;
    delete from public.assistant_messages am where am.user_id = r.user_id and am.created_at < cutoff;
    delete from public.briefings b where b.user_id = r.user_id and b.generated_at < cutoff;
    delete from public.insights i where i.user_id = r.user_id and i.for_date < cutoff::date and i.status <> 'active';
    user_id := r.user_id; deleted_threads := n1; deleted_messages := n2; deleted_memory := n3; deleted_captures := n4; deleted_notifications := n5;
    return next;
  end loop;
  -- housekeeping
  delete from public.oauth_states where expires_at < now() - interval '1 day';
  delete from public.rate_limits where expires_at < now() - interval '1 hour';
  delete from public.webhook_events where received_at < now() - interval '30 days';
  delete from public.ai_analysis_cache where created_at < now() - interval '180 days';
  update public.data_export_requests set status = 'expired' where status = 'ready' and url_expires_at < now();
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete history (user-triggered): everything analyzed, keep connections & account.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_history(older_than_days int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cutoff timestamptz := case when older_than_days is null then now() + interval '1 day' else now() - make_interval(days => older_than_days) end;
  counts jsonb := '{}'::jsonb;
  n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from public.email_messages where user_id = uid and sent_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('messages', n);
  delete from public.email_threads where user_id = uid and last_message_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('threads', n);
  delete from public.memory_chunks where user_id = uid and occurred_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('memory', n);
  delete from public.insights where user_id = uid and created_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('insights', n);
  delete from public.briefings where user_id = uid and generated_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('briefings', n);
  delete from public.life_events where user_id = uid and created_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('life_events', n);
  delete from public.assistant_messages where user_id = uid and created_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('assistant_messages', n);
  delete from public.assistant_threads where user_id = uid and created_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('assistant_threads', n);
  delete from public.android_notifications where user_id = uid and posted_at < cutoff; get diagnostics n = row_count; counts := counts || jsonb_build_object('android_notifications', n);
  delete from public.ai_analysis_cache where user_id = uid;
  update public.captures set deleted_at = now() where user_id = uid and created_at < cutoff and deleted_at is null; get diagnostics n = row_count; counts := counts || jsonb_build_object('captures', n);
  update public.sync_states set cursor = null, backfill_page_token = null where user_id = uid;
  insert into public.audit_logs (user_id, action, actor, metadata) values (uid, 'data.delete_history', 'user', counts);
  return counts;
end;
$$;
grant execute on function public.delete_my_history(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Person intelligence aggregate (RLS-scoped through invoker).
-- ---------------------------------------------------------------------------
create or replace function public.person_open_loops(contact uuid)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.commitments c where c.user_id = auth.uid() and c.counterpart_contact_id = contact and c.status in ('open', 'proposed', 'postponed'))
    + (select count(*) from public.follow_ups f where f.user_id = auth.uid() and f.contact_id = contact and f.status in ('watching', 'nudge_due', 'snoozed'));
$$;
grant execute on function public.person_open_loops(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mark insight completed/dismissed atomically with feedback (client action "Tamamlandı" / "Önemli değil").
-- ---------------------------------------------------------------------------
create or replace function public.resolve_insight(p_insight uuid, p_status public.insight_status_t, p_feedback public.ai_feedback_kind_t default null)
returns public.insights
language plpgsql
security invoker
set search_path = public
as $$
declare
  row public.insights;
begin
  update public.insights
     set status = p_status,
         completed_at = case when p_status = 'completed' then now() else completed_at end,
         dismissed_at = case when p_status = 'dismissed' then now() else dismissed_at end
   where id = p_insight and user_id = auth.uid()
   returning * into row;
  if row.id is null then
    raise exception 'insight not found' using errcode = 'P0002';
  end if;
  if p_feedback is not null then
    insert into public.ai_feedback (user_id, kind, entity_type, entity_id) values (auth.uid(), p_feedback, 'insight', p_insight);
  end if;
  return row;
end;
$$;
grant execute on function public.resolve_insight(uuid, public.insight_status_t, public.ai_feedback_kind_t) to authenticated;

-- ---------------------------------------------------------------------------
-- Contact upsert by e-mail (used by ingestion, service role) — keeps interaction stats.
-- ---------------------------------------------------------------------------
create or replace function internal.upsert_contact(p_user uuid, p_name text, p_email text, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  em text := lower(trim(p_email));
begin
  select id into cid from public.contacts where user_id = p_user and em = any (emails) and deleted_at is null limit 1;
  if cid is null then
    insert into public.contacts (user_id, display_name, emails, last_contact_at, interaction_count)
    values (p_user, coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1)), array[em], p_at, 1)
    returning id into cid;
  else
    update public.contacts
       set last_contact_at = greatest(coalesce(last_contact_at, p_at), p_at),
           interaction_count = interaction_count + 1,
           display_name = case when display_name = split_part(em, '@', 1) and nullif(trim(p_name), '') is not null then trim(p_name) else display_name end
     where id = cid;
  end if;
  update public.contacts c set is_vip = true
   where c.id = cid and exists (select 1 from public.vip_people v where v.user_id = p_user and (v.contact_id = cid or lower(v.email) = em));
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entitlement snapshot for a user (used by clients & edge functions).
-- ---------------------------------------------------------------------------
create or replace function public.my_entitlement()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with subs as (
    select * from public.subscriptions s where s.user_id = auth.uid()
  ),
  rc as (
    select s.* from subs s
    where s.source in ('revenuecat', 'promo', 'demo') and s.status in ('trial', 'active', 'grace') and (s.expires_at is null or s.expires_at > now())
    order by case s.source when 'revenuecat' then 0 when 'promo' then 1 else 2 end
    limit 1
  ),
  credit as (
    select c.* from public.referral_credits c where c.user_id = auth.uid() and c.expires_at > now() order by c.expires_at desc limit 1
  ),
  today as (
    select coalesce(u.assistant_queries, 0) as aq, coalesce(u.captures, 0) as cp
    from public.profiles p
    left join public.usage_counters u on u.user_id = p.id and u.day = (now() at time zone p.timezone)::date
    where p.id = auth.uid()
  )
  select jsonb_build_object(
    'isPro', (exists (select 1 from rc) or exists (select 1 from credit)),
    'source', case when exists (select 1 from rc) then (select source::text from rc) when exists (select 1 from credit) then 'referral' else 'none' end,
    'expiresAt', coalesce((select expires_at from rc), (select expires_at from credit)),
    'isTrial', coalesce((select is_trial from rc), false),
    'assistantQueriesToday', (select aq from today),
    'capturesToday', (select cp from today),
    'emailAccounts', (select count(*) from public.connected_accounts a where a.user_id = auth.uid() and a.deleted_at is null and 'email' = any (a.kinds)),
    'calendarAccounts', (select count(*) from public.connected_accounts a where a.user_id = auth.uid() and a.deleted_at is null and 'calendar' = any (a.kinds))
  );
$$;
grant execute on function public.my_entitlement() to authenticated;
