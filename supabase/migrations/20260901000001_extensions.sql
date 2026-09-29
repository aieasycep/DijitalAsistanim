-- Dijital Asistan · 0001 · extensions & schemas
-- All timestamps are stored as timestamptz (UTC). User timezone lives in profiles.timezone.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- pg_cron / pg_net are available on Supabase; guarded so plain Postgres test databases still apply.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice 'pg_net not available: %', sqlerrm;
  end;
end $$;

-- Internal schema for helpers that must not be exposed through PostgREST.
create schema if not exists internal;
revoke all on schema internal from public;
grant usage on schema internal to postgres, service_role;

-- Immutable unaccent wrapper so it can be used in generated columns / indexes.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent', $1);
$$;

comment on function public.immutable_unaccent(text) is 'Immutable wrapper around unaccent for FTS generated columns.';
