-- Dijital Asistan · 0009 · scheduled jobs (pg_cron → Edge Function "cron-dispatch" via pg_net)
--
-- The dispatcher is called every 5 minutes with a job name; it evaluates timezone-aware schedules
-- per user (briefings at the user's local time, quiet days, weekends) — see supabase/functions/cron-dispatch.
-- Secrets: the function URL and the internal secret are read from Vault when available, otherwise from
-- database settings `app.settings.functions_url` / `app.settings.internal_secret`
-- (set with: alter database postgres set app.settings.functions_url = 'https://<ref>.supabase.co/functions/v1').

create or replace function internal.setting(name text)
returns text
language plpgsql
stable
as $$
declare v text;
begin
  begin
    select decrypted_secret into v from vault.decrypted_secrets where vault.decrypted_secrets.name = setting.name limit 1;
  exception when others then
    v := null;
  end;
  if v is null then
    v := current_setting('app.settings.' || name, true);
  end if;
  return v;
end;
$$;

create or replace function internal.invoke_function(fn text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, internal
as $$
declare
  base_url text := internal.setting('functions_url');
  secret text := internal.setting('internal_secret');
  request_id bigint;
begin
  if base_url is null or secret is null then
    raise notice 'internal.invoke_function skipped: functions_url/internal_secret not configured';
    return null;
  end if;
  if to_regprocedure('extensions.http_post(text, jsonb, jsonb, jsonb, integer)') is null
     and to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise notice 'pg_net not installed; skipping %', fn;
    return null;
  end if;
  select net.http_post(
    url := base_url || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', secret),
    body := body,
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;

do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise notice 'pg_cron not installed; skipping schedules';
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname like 'da_%';
  -- briefings & notifications: evaluate every 5 minutes (timezone-aware inside the function)
  perform cron.schedule('da_briefings', '*/5 * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"briefings"}'::jsonb) $c$);
  -- polling sync fallback for accounts without webhooks
  perform cron.schedule('da_sync_poll', '*/10 * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"sync-poll"}'::jsonb) $c$);
  -- reminders & meeting prep notifications
  perform cron.schedule('da_reminders', '* * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"reminders"}'::jsonb) $c$);
  -- follow-up detection & midday delta
  perform cron.schedule('da_followups', '0 * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"followups"}'::jsonb) $c$);
  -- webhook subscription renewal
  perform cron.schedule('da_subscriptions', '0 */6 * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"renew-subscriptions"}'::jsonb) $c$);
  -- retention cleanup & approval expiry (03:15 UTC daily)
  perform cron.schedule('da_retention', '15 3 * * *', $c$ select internal.run_retention_cleanup(); select internal.expire_approvals(); select internal.invoke_function('cron-dispatch', '{"job":"retention"}'::jsonb) $c$);
  -- data exports & account deletions queue
  perform cron.schedule('da_exports', '*/15 * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"exports"}'::jsonb) $c$);
  -- background backfill (older history)
  perform cron.schedule('da_backfill', '*/30 * * * *', $c$ select internal.invoke_function('cron-dispatch', '{"job":"backfill"}'::jsonb) $c$);
end $$;
