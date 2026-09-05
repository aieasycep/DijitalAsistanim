-- Dijital Asistan · 0003 · core identity, preferences, connections, people, rules

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function internal.random_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  first_name text not null default '',
  email text,
  avatar_url text,
  timezone text not null default 'Europe/Istanbul',
  locale public.locale_t not null default 'tr',
  onboarding_completed_at timestamptz,
  first_analysis_completed_at timestamptz,
  referral_code text not null unique default internal.random_referral_code(),
  referred_by_code text,
  plan public.plan_t not null default 'free',
  revenuecat_app_user_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_referred_by_idx on public.profiles (referred_by_code);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Create profile + default preference rows when an auth user is created.
create or replace function internal.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  full_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1));
begin
  insert into public.profiles (id, display_name, first_name, email, avatar_url)
  values (new.id, full_name, split_part(full_name, ' ', 1), new.email, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme public.theme_preference_t not null default 'system',
  locale public.locale_t not null default 'tr',
  timezone text not null default 'Europe/Istanbul',
  briefing jsonb not null default jsonb_build_object(
    'morningTime', '07:30', 'middayEnabled', true, 'middayTime', '13:00', 'eveningEnabled', true, 'eveningTime', '19:00',
    'weeklyEnabled', true, 'weeklyDay', 0, 'weeklyTime', '18:00', 'weekendEnabled', false, 'quietDays', '[]'::jsonb
  ),
  interests text[] not null default '{}',
  learn_from_interactions boolean not null default true,
  default_reminder_lead_minutes int not null default 30 check (default_reminder_lead_minutes between 0 and 1440),
  retention public.retention_option_t not null default '90d',
  analyze_attachments boolean not null default false,
  reduced_motion boolean not null default false,
  haptics_enabled boolean not null default true,
  android_notification_scope public.android_notification_scope_t not null default 'selected',
  android_allowed_packages text[] not null default '{}',
  android_notification_upload_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  categories jsonb not null default jsonb_build_object(
    'morning', true, 'midday', true, 'evening', true, 'weekly', true, 'critical_email', true, 'meeting', true,
    'deadline', true, 'follow_up', true, 'life_event', true, 'approval', true, 'reminder', true
  ),
  only_when_important boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start text not null default '22:00',
  quiet_hours_end text not null default '08:00',
  lock_screen_privacy public.lock_screen_privacy_t not null default 'full',
  meeting_lead_minutes int not null default 20 check (meeting_lead_minutes between 0 and 240),
  system_permission_granted boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();

-- trigger on auth.users (after dependent tables exist)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function internal.handle_new_user();

-- ---------------------------------------------------------------------------
-- connected_accounts
-- ---------------------------------------------------------------------------
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.provider_t not null,
  kinds public.account_kind_t[] not null default '{}',
  external_account_id text not null,
  display_name text not null default '',
  email text,
  status public.connection_status_t not null default 'active',
  granted_scopes text[] not null default '{}',
  controls jsonb not null default jsonb_build_object(
    'readEmail', true, 'analyzeAttachments', false, 'detectDeadlines', true, 'prepareDrafts', true,
    'readEvents', true, 'suggestSchedule', true, 'createEventsWithApproval', true, 'readTasks', true
  ),
  last_sync_at timestamptz,
  last_error text,
  backfill_completed boolean not null default false,
  is_primary boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_account_id)
);
create index connected_accounts_user_idx on public.connected_accounts (user_id) where deleted_at is null;
create index connected_accounts_status_idx on public.connected_accounts (status) where deleted_at is null;
create trigger connected_accounts_updated_at before update on public.connected_accounts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- oauth_credentials — encrypted at rest (AES-256-GCM, key in TOKEN_ENCRYPTION_KEY env of edge functions).
-- Never exposed to clients: no RLS policy grants select to authenticated (see 0007).
-- ---------------------------------------------------------------------------
create table public.oauth_credentials (
  account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.provider_t not null,
  access_token_enc text,
  refresh_token_enc text,
  access_token_expires_at timestamptz,
  scope text[] not null default '{}',
  token_type text not null default 'Bearer',
  key_version int not null default 1,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index oauth_credentials_user_idx on public.oauth_credentials (user_id);
create trigger oauth_credentials_updated_at before update on public.oauth_credentials for each row execute function public.set_updated_at();

-- Short-lived OAuth state (CSRF) records. Cleaned by retention job.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.provider_t not null,
  kinds public.account_kind_t[] not null,
  scope_group text not null default 'read',
  account_id uuid references public.connected_accounts (id) on delete cascade,
  code_verifier_enc text not null,
  redirect_to text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expires_idx on public.oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- sync_states
-- ---------------------------------------------------------------------------
create table public.sync_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  resource public.sync_resource_t not null,
  cursor text,
  subscription_id text,
  subscription_expires_at timestamptz,
  mode public.sync_mode_t not null default 'polling',
  last_run_at timestamptz,
  last_success_at timestamptz,
  backfill_until timestamptz,
  backfill_page_token text,
  error_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, resource)
);
create index sync_states_user_idx on public.sync_states (user_id);
create index sync_states_due_idx on public.sync_states (mode, last_run_at);
create index sync_states_subscription_idx on public.sync_states (subscription_expires_at) where subscription_id is not null;
create trigger sync_states_updated_at before update on public.sync_states for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- first analysis progress (onboarding)
-- ---------------------------------------------------------------------------
create table public.first_analysis_runs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  step public.first_analysis_step_t not null default 'scanning',
  emails_found int not null default 0,
  potential_important int not null default 0,
  upcoming_events int not null default 0,
  possible_follow_ups int not null default 0,
  window_hours int not null default 72,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  briefing_id uuid,
  updated_at timestamptz not null default now()
);
create trigger first_analysis_runs_updated_at before update on public.first_analysis_runs for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contacts / vip_people
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  company text,
  title text,
  avatar_url text,
  last_contact_at timestamptz,
  interaction_count int not null default 0,
  is_vip boolean not null default false,
  source public.contact_source_t not null default 'communication',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_user_idx on public.contacts (user_id) where deleted_at is null;
create index contacts_emails_gin on public.contacts using gin (emails);
create index contacts_name_trgm on public.contacts using gin (display_name extensions.gin_trgm_ops);
create index contacts_last_contact_idx on public.contacts (user_id, last_contact_at desc);
create trigger contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();

create table public.vip_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  display_name text not null,
  email text,
  relation text,
  notify_always boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vip_people_user_email_uq on public.vip_people (user_id, lower(email)) where email is not null;
create unique index vip_people_user_contact_uq on public.vip_people (user_id, contact_id) where contact_id is not null;
create index vip_people_user_idx on public.vip_people (user_id);
create trigger vip_people_updated_at before update on public.vip_people for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- priority_rules / learned_preferences
-- ---------------------------------------------------------------------------
create table public.priority_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.priority_rule_type_t not null,
  value text not null,
  label text not null,
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, value)
);
create index priority_rules_user_idx on public.priority_rules (user_id, enabled);
create trigger priority_rules_updated_at before update on public.priority_rules for each row execute function public.set_updated_at();

create table public.learned_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.learned_preference_kind_t not null,
  statement text not null,
  subject_key text not null,
  weight real not null default 0 check (weight between -1 and 1),
  evidence_count int not null default 1,
  enabled boolean not null default true,
  last_reinforced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, subject_key)
);
create index learned_preferences_user_idx on public.learned_preferences (user_id, enabled);
create trigger learned_preferences_updated_at before update on public.learned_preferences for each row execute function public.set_updated_at();
