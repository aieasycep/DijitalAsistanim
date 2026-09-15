-- Dijital Asistan · 0005 · platform: push, subscriptions, referrals, feedback, audit, exports, quotas, webhooks

-- ---------------------------------------------------------------------------
-- push_tokens / push_deliveries
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform public.device_platform_t not null,
  device_id text not null,
  device_name text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create unique index push_tokens_token_uq on public.push_tokens (token);
create index push_tokens_user_active_idx on public.push_tokens (user_id) where is_active;
create trigger push_tokens_updated_at before update on public.push_tokens for each row execute function public.set_updated_at();

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category public.notification_category_t not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  deep_link text not null,
  status public.push_delivery_status_t not null default 'queued',
  attempt_count int not null default 0,
  sent_at timestamptz,
  receipt_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index push_deliveries_user_idx on public.push_deliveries (user_id, created_at desc);
create index push_deliveries_status_idx on public.push_deliveries (status) where status in ('queued', 'sent');
create trigger push_deliveries_updated_at before update on public.push_deliveries for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions (RevenueCat mirror + referral/promo grants)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.subscription_source_t not null,
  status public.subscription_status_t not null default 'none',
  plan public.plan_t not null default 'free',
  product_id text,
  entitlement_id text not null default 'pro',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_trial boolean not null default false,
  will_renew boolean not null default false,
  store text,
  revenuecat_app_user_id text,
  last_event_id text,
  environment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscriptions_user_source_uq on public.subscriptions (user_id, source);
create index subscriptions_user_idx on public.subscriptions (user_id, status);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- referrals / referral_credits
-- ---------------------------------------------------------------------------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles (id) on delete cascade,
  referred_user_id uuid references public.profiles (id) on delete set null,
  code text not null,
  status public.referral_status_t not null default 'pending',
  redeemed_at timestamptz,
  rejection_reason text,
  device_fingerprint_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index referrals_referred_uq on public.referrals (referred_user_id) where referred_user_id is not null and status = 'redeemed';
create index referrals_referrer_idx on public.referrals (referrer_user_id, status);
create index referrals_device_idx on public.referrals (device_fingerprint_hash) where device_fingerprint_hash is not null;
create trigger referrals_updated_at before update on public.referrals for each row execute function public.set_updated_at();

create table public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  referral_id uuid not null references public.referrals (id) on delete cascade,
  days int not null check (days > 0 and days <= 90),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  role text not null check (role in ('referrer', 'referred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referral_id, role)
);
create index referral_credits_user_idx on public.referral_credits (user_id, expires_at desc);
create trigger referral_credits_updated_at before update on public.referral_credits for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_feedback
-- ---------------------------------------------------------------------------
create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.ai_feedback_kind_t not null,
  entity_type text not null,
  entity_id uuid not null,
  contact_id uuid references public.contacts (id) on delete set null,
  category public.email_category_t,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_feedback_user_idx on public.ai_feedback (user_id, created_at desc);
create index ai_feedback_entity_idx on public.ai_feedback (entity_type, entity_id);
create trigger ai_feedback_updated_at before update on public.ai_feedback for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs (append-only; metadata never contains bodies/tokens)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  actor public.audit_actor_t not null default 'system',
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- ---------------------------------------------------------------------------
-- data_export_requests
-- ---------------------------------------------------------------------------
create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.export_status_t not null default 'requested',
  storage_path text,
  download_url text,
  url_expires_at timestamptz,
  failure_reason text,
  completed_at timestamptz,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_export_requests_user_idx on public.data_export_requests (user_id, created_at desc);
create index data_export_requests_status_idx on public.data_export_requests (status) where status in ('requested', 'processing');
create trigger data_export_requests_updated_at before update on public.data_export_requests for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- usage_counters (free-plan quotas) & ai_usage (cost telemetry, no content)
-- ---------------------------------------------------------------------------
create table public.usage_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  assistant_queries int not null default 0,
  captures int not null default 0,
  ai_tokens int not null default 0,
  voice_seconds int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  purpose text not null,
  provider text not null,
  model text not null,
  tier text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  cached boolean not null default false,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate_limits (fixed-window counters used by edge functions)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);
create index rate_limits_expires_idx on public.rate_limits (expires_at);

-- ---------------------------------------------------------------------------
-- webhook_events (idempotency for Gmail Pub/Sub, Graph, RevenueCat)
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id text primary key,
  source text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text
);
create index webhook_events_received_idx on public.webhook_events (received_at);

-- ---------------------------------------------------------------------------
-- feedback_submissions
-- ---------------------------------------------------------------------------
create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  category text not null,
  message text not null,
  diagnostics jsonb,
  app_version text,
  platform public.device_platform_t,
  created_at timestamptz not null default now()
);
create index feedback_submissions_user_idx on public.feedback_submissions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- notification_log_state — tracks last briefing sends per kind (dedupe per local date)
-- ---------------------------------------------------------------------------
create table public.briefing_send_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.briefing_kind_t not null,
  local_date date not null,
  sent_at timestamptz not null default now(),
  briefing_id uuid references public.briefings (id) on delete set null,
  primary key (user_id, kind, local_date)
);
