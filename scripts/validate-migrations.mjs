#!/usr/bin/env node
// Applies every migration to a fresh database (plus the Supabase shim) and verifies the expected tables exist.
// Usage: DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres node scripts/validate-migrations.mjs
import { ADMIN_URL, applyShimAndMigrations, createFreshDatabase, hasPsql, psql } from './db-lib.mjs';

const REQUIRED_TABLES = [
  'profiles', 'user_preferences', 'connected_accounts', 'oauth_credentials', 'sync_states', 'email_threads', 'email_messages',
  'calendar_events', 'tasks', 'commitments', 'reminders', 'contacts', 'vip_people', 'priority_rules', 'insights', 'life_events',
  'briefings', 'briefing_items', 'approval_actions', 'assistant_threads', 'assistant_messages', 'memory_chunks', 'captures',
  'notification_preferences', 'push_tokens', 'subscriptions', 'referrals', 'referral_credits', 'ai_feedback', 'audit_logs',
  'data_export_requests', 'follow_ups', 'learned_preferences', 'android_notifications', 'push_deliveries', 'usage_counters',
  'ai_usage', 'rate_limits', 'webhook_events', 'calendar_conflicts', 'post_meeting_notes', 'first_analysis_runs', 'oauth_states',
];

if (!hasPsql()) {
  console.error('psql not found on PATH — install PostgreSQL client tools.');
  process.exit(2);
}

const dbName = process.env.DB_TEST_NAME ?? 'da_migrations_check';
console.log(`Creating fresh database ${dbName} …`);
const url = createFreshDatabase(ADMIN_URL, dbName);
applyShimAndMigrations(url);

const res = psql(url, ['-At', '-c', "select table_name from information_schema.tables where table_schema = 'public' order by 1"]);
const tables = new Set(res.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
if (missing.length) {
  console.error(`Missing tables: ${missing.join(', ')}`);
  process.exit(1);
}

const rls = psql(url, [
  '-At',
  '-c',
  "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
]);
const unprotected = rls.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
if (unprotected.length) {
  console.error(`Tables without RLS: ${unprotected.join(', ')}`);
  process.exit(1);
}

console.log(`✓ ${tables.size} public tables, all with RLS enabled. Migrations apply cleanly.`);
