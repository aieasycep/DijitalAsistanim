-- Dijital Asistan · 0004 · content: email, calendar, tasks, commitments, follow-ups, reminders, insights,
-- life events, briefings, approvals, assistant, memory, captures, meeting notes, conflicts, android notifications

-- ---------------------------------------------------------------------------
-- email_threads / email_messages
-- ---------------------------------------------------------------------------
create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  external_thread_id text not null,
  subject text not null default '',
  snippet text not null default '',
  participants jsonb not null default '[]'::jsonb,
  last_message_at timestamptz not null,
  message_count int not null default 1,
  last_from_user boolean not null default false,
  is_read boolean not null default false,
  labels text[] not null default '{}',
  importance public.importance_t not null default 'normal',
  category public.email_category_t not null default 'information',
  analysis jsonb,
  priority_score int not null default 0,
  priority_reasons text[] not null default '{}',
  triage public.triage_bucket_t not null default 'ai',
  fingerprint text not null,
  user_dismissed boolean not null default false,
  user_marked_done boolean not null default false,
  analyzed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_thread_id)
);
create index email_threads_user_last_idx on public.email_threads (user_id, last_message_at desc) where deleted_at is null;
create index email_threads_user_priority_idx on public.email_threads (user_id, priority_score desc) where deleted_at is null and user_dismissed = false;
create index email_threads_user_category_idx on public.email_threads (user_id, category) where deleted_at is null;
create index email_threads_fingerprint_idx on public.email_threads (user_id, fingerprint);
create index email_threads_followup_idx on public.email_threads (user_id, last_from_user, last_message_at) where deleted_at is null;
create trigger email_threads_updated_at before update on public.email_threads for each row execute function public.set_updated_at();

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  external_message_id text not null,
  from_participant jsonb not null,
  to_participants jsonb not null default '[]'::jsonb,
  cc_participants jsonb not null default '[]'::jsonb,
  subject text not null default '',
  snippet text not null default '',
  body_text text,
  sent_at timestamptz not null,
  is_from_user boolean not null default false,
  has_attachments boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  labels text[] not null default '{}',
  web_url text,
  fingerprint text not null,
  analysis jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_message_id)
);
create index email_messages_thread_idx on public.email_messages (thread_id, sent_at);
create index email_messages_user_sent_idx on public.email_messages (user_id, sent_at desc) where deleted_at is null;
create index email_messages_fingerprint_idx on public.email_messages (user_id, fingerprint);
create trigger email_messages_updated_at before update on public.email_messages for each row execute function public.set_updated_at();

-- Fingerprints of content already analyzed by AI (hash-based dedupe, cost control).
create table public.ai_analysis_cache (
  user_id uuid not null references public.profiles (id) on delete cascade,
  fingerprint text not null,
  purpose text not null,
  result jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (user_id, fingerprint, purpose)
);

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  external_event_id text not null,
  calendar_id text not null default 'primary',
  title text not null default '',
  description text,
  location text,
  meeting_url text,
  meeting_provider text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  attendees jsonb not null default '[]'::jsonb,
  organizer_is_user boolean not null default false,
  status public.event_status_t not null default 'confirmed',
  provider_updated_at timestamptz,
  source public.source_type_t not null default 'google_calendar',
  prep jsonb,
  prep_generated_at timestamptz,
  post_meeting_handled_at timestamptz,
  is_ai_created boolean not null default false,
  etag text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_event_id),
  check (end_at >= start_at)
);
create index calendar_events_user_start_idx on public.calendar_events (user_id, start_at) where deleted_at is null and status <> 'cancelled';
create index calendar_events_user_end_idx on public.calendar_events (user_id, end_at) where deleted_at is null;
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks / reminders
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid references public.connected_accounts (id) on delete set null,
  external_task_id text,
  title text not null,
  notes text,
  due_at timestamptz,
  status public.task_status_t not null default 'open',
  completed_at timestamptz,
  source jsonb,
  provider text not null default 'internal',
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  priority public.importance_t not null default 'normal',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tasks_external_uq on public.tasks (account_id, external_task_id) where external_task_id is not null;
create index tasks_user_status_idx on public.tasks (user_id, status, due_at) where deleted_at is null;
create index tasks_user_scheduled_idx on public.tasks (user_id, scheduled_start_at) where scheduled_start_at is not null and deleted_at is null;
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  option public.reminder_option_t not null default 'custom',
  status public.reminder_status_t not null default 'scheduled',
  target_type public.reminder_target_t,
  target_id uuid,
  source jsonb,
  smart_reason text,
  local_notification_id text,
  fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_due_idx on public.reminders (user_id, remind_at) where status = 'scheduled';
create index reminders_due_idx on public.reminders (remind_at) where status = 'scheduled';
create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- commitments / follow_ups
-- ---------------------------------------------------------------------------
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  quote text,
  direction public.commitment_direction_t not null,
  counterpart_name text,
  counterpart_contact_id uuid references public.contacts (id) on delete set null,
  due_at timestamptz,
  due_text text,
  status public.commitment_status_t not null default 'open',
  source jsonb not null,
  confidence real not null default 0.5 check (confidence between 0 and 1),
  completed_at timestamptz,
  postponed_until timestamptz,
  related_event_id uuid references public.calendar_events (id) on delete set null,
  dedupe_key text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index commitments_user_status_idx on public.commitments (user_id, status, due_at) where deleted_at is null;
create index commitments_counterpart_idx on public.commitments (counterpart_contact_id) where counterpart_contact_id is not null;
create trigger commitments_updated_at before update on public.commitments for each row execute function public.set_updated_at();

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  counterpart_name text not null,
  topic text not null,
  sent_at timestamptz not null,
  nudge_after_days int not null default 3,
  status public.follow_up_status_t not null default 'watching',
  snoozed_until timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  last_nudged_at timestamptz,
  source jsonb not null,
  dismiss_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, thread_id)
);
create index follow_ups_user_status_idx on public.follow_ups (user_id, status);
create trigger follow_ups_updated_at before update on public.follow_ups for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- life_events
-- ---------------------------------------------------------------------------
create table public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.life_event_type_t not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  event_at timestamptz,
  status public.life_event_status_t not null default 'upcoming',
  source jsonb not null,
  confidence real not null default 0.5 check (confidence between 0 and 1),
  dedupe_key text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index life_events_user_event_idx on public.life_events (user_id, event_at) where deleted_at is null;
create index life_events_user_status_idx on public.life_events (user_id, status) where deleted_at is null;
create trigger life_events_updated_at before update on public.life_events for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_conflicts
-- ---------------------------------------------------------------------------
create table public.calendar_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_a_id uuid not null references public.calendar_events (id) on delete cascade,
  event_b_id uuid not null references public.calendar_events (id) on delete cascade,
  overlap_minutes int not null,
  suggestions jsonb not null default '[]'::jsonb,
  status public.conflict_status_t not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_a_id, event_b_id)
);
create index calendar_conflicts_user_idx on public.calendar_conflicts (user_id, status);
create trigger calendar_conflicts_updated_at before update on public.calendar_conflicts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- insights (Today / Flow cards)
-- ---------------------------------------------------------------------------
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.insight_kind_t not null,
  badge public.insight_badge_t not null,
  title text not null,
  subtitle text,
  reason text,
  importance public.importance_t not null default 'normal',
  priority_score int not null default 0,
  priority_reasons text[] not null default '{}',
  time_label text,
  due_at timestamptz,
  status public.insight_status_t not null default 'active',
  snoozed_until timestamptz,
  source jsonb not null,
  actions jsonb not null default '[]'::jsonb,
  entity_type public.insight_entity_t not null,
  entity_id uuid not null,
  tags text[] not null default '{}',
  for_date date not null,
  confidence real not null default 0.7 check (confidence between 0 and 1),
  is_low_confidence boolean not null default false,
  dedupe_key text not null,
  completed_at timestamptz,
  dismissed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index insights_user_date_idx on public.insights (user_id, for_date desc, priority_score desc) where deleted_at is null and status = 'active';
create index insights_user_status_idx on public.insights (user_id, status);
create index insights_entity_idx on public.insights (entity_type, entity_id);
create index insights_tags_gin on public.insights using gin (tags);
create trigger insights_updated_at before update on public.insights for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- briefings / briefing_items
-- ---------------------------------------------------------------------------
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.briefing_kind_t not null,
  for_date date not null,
  generated_at timestamptz not null default now(),
  headline text not null,
  highlight_number int not null default 0,
  subline text not null default '',
  mood text not null default '',
  narrative text not null default '',
  outlook text,
  counts jsonb not null default '{}'::jsonb,
  audio jsonb,
  estimated_read_sec int not null default 90,
  opened_at timestamptz,
  closed_at timestamptz,
  weekly jsonb,
  has_changes boolean not null default true,
  version int not null default 1,
  produced_by text not null default 'fallback',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, for_date, version)
);
create index briefings_user_kind_idx on public.briefings (user_id, kind, for_date desc);
create trigger briefings_updated_at before update on public.briefings for each row execute function public.set_updated_at();

create table public.briefing_items (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  section public.briefing_section_t not null,
  position int not null default 0,
  icon text not null default 'mail',
  title text not null,
  meta text,
  source jsonb,
  insight_id uuid references public.insights (id) on delete set null,
  entity_type public.insight_entity_t,
  entity_id uuid,
  chapter_index int,
  status text,
  created_at timestamptz not null default now()
);
create index briefing_items_briefing_idx on public.briefing_items (briefing_id, section, position);

-- ---------------------------------------------------------------------------
-- approval_actions — the product's core safety mechanism
-- ---------------------------------------------------------------------------
create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.approval_action_type_t not null,
  status public.approval_status_t not null default 'pending',
  what text not null,
  why text not null,
  change_summary text[] not null default '{}',
  source jsonb,
  payload jsonb not null,
  original_payload jsonb not null,
  edited_by_user boolean not null default false,
  idempotency_key text not null,
  expires_at timestamptz not null default now() + interval '72 hours',
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  failure_reason text,
  attempt_count int not null default 0,
  requested_by public.approval_requested_by_t not null,
  insight_id uuid references public.insights (id) on delete set null,
  required_scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index approval_actions_user_status_idx on public.approval_actions (user_id, status, created_at desc);
create index approval_actions_expires_idx on public.approval_actions (expires_at) where status = 'pending';
create trigger approval_actions_updated_at before update on public.approval_actions for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assistant_threads / assistant_messages
-- ---------------------------------------------------------------------------
create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  last_message_at timestamptz not null default now(),
  contact_id uuid references public.contacts (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_threads_user_idx on public.assistant_threads (user_id, last_message_at desc) where deleted_at is null;
create trigger assistant_threads_updated_at before update on public.assistant_threads for each row execute function public.set_updated_at();

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.assistant_threads (id) on delete cascade,
  role public.message_role_t not null,
  content text not null,
  input_mode public.input_mode_t not null default 'text',
  sources jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  approval_ids uuid[] not null default '{}',
  uncertain boolean not null default false,
  tokens_in int,
  tokens_out int,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_messages_thread_idx on public.assistant_messages (thread_id, created_at);
create index assistant_messages_user_idx on public.assistant_messages (user_id, created_at desc);
create trigger assistant_messages_updated_at before update on public.assistant_messages for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memory_chunks — pgvector + Turkish FTS fallback
-- ---------------------------------------------------------------------------
create table public.memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_type public.source_type_t not null,
  source_id uuid not null,
  source jsonb not null,
  content text not null,
  topic text,
  person_name text,
  contact_id uuid references public.contacts (id) on delete set null,
  occurred_at timestamptz not null,
  embedding extensions.vector(1536),
  token_count int not null default 0,
  expires_at timestamptz,
  tsv tsvector generated always as (
    to_tsvector('turkish', public.immutable_unaccent(coalesce(content, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(person_name, '')))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);
create index memory_chunks_user_occurred_idx on public.memory_chunks (user_id, occurred_at desc);
create index memory_chunks_tsv_gin on public.memory_chunks using gin (tsv);
create index memory_chunks_embedding_hnsw on public.memory_chunks using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index memory_chunks_contact_idx on public.memory_chunks (contact_id) where contact_id is not null;
create trigger memory_chunks_updated_at before update on public.memory_chunks for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- captures
-- ---------------------------------------------------------------------------
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.capture_kind_t not null,
  status public.capture_status_t not null default 'uploaded',
  storage_path text,
  mime_type text,
  size_bytes bigint,
  original_text text,
  url text,
  extracted_text text,
  analysis jsonb,
  failure_reason text,
  origin public.capture_origin_t not null default 'in_app',
  approval_ids uuid[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index captures_user_idx on public.captures (user_id, created_at desc) where deleted_at is null;
create trigger captures_updated_at before update on public.captures for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- post_meeting_notes
-- ---------------------------------------------------------------------------
create table public.post_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  text text not null,
  input_mode public.input_mode_t not null default 'text',
  extracted_commitment_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index post_meeting_notes_event_idx on public.post_meeting_notes (event_id);
create trigger post_meeting_notes_updated_at before update on public.post_meeting_notes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- android_notifications (Android-only Notification Intelligence; opt-in upload)
-- ---------------------------------------------------------------------------
create table public.android_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  package_name text not null,
  app_name text not null,
  title text not null default '',
  text text not null default '',
  posted_at timestamptz not null,
  fingerprint text not null,
  analysis jsonb,
  insight_id uuid references public.insights (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index android_notifications_user_idx on public.android_notifications (user_id, posted_at desc);
create trigger android_notifications_updated_at before update on public.android_notifications for each row execute function public.set_updated_at();
