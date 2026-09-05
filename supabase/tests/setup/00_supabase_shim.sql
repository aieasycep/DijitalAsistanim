-- Minimal Supabase platform shim so migrations + pgTAP tests run on a plain PostgreSQL
-- (local dev without Docker, GitHub Actions service container). On real Supabase these objects already exist.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists net;
create schema if not exists graphql_public;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to authenticated, service_role, anon;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth.users (subset of columns used by our triggers)
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'role'))
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- storage
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1 : array_length(parts, 1) - 1];
end $$;

-- vault (empty; internal.setting falls back to database settings)
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);

-- pg_net stand-in so cron jobs can be scheduled locally; records calls instead of performing them.
create table if not exists net.http_request_log (id bigserial primary key, url text, body jsonb, created_at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
declare rid bigint;
begin
  insert into net.http_request_log (url, body) values (url, body) returning id into rid;
  return rid;
end $$;

grant all on all tables in schema auth to service_role;
grant select on auth.users to authenticated;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant usage on schema net to service_role, postgres;
