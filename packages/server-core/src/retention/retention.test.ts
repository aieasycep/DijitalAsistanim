import { describe, expect, it } from 'vitest';
import {
  EXPORT_EXCLUDED_TABLES,
  RETENTION_PROTECTED_TABLES,
  accountDeletionPlan,
  buildCleanupPlan,
  deleteHistoryPlan,
  exportBundleManifest,
  exportUrlExpiry,
  retentionCutoff,
} from './index';

const now = '2026-09-05T08:00:00.000Z';

describe('retention · retentionCutoff', () => {
  it('maps options to cutoffs and forever to null', () => {
    expect(retentionCutoff('30d', now)).toBe('2026-08-06T08:00:00.000Z');
    expect(retentionCutoff('90d', now)).toBe('2026-06-07T08:00:00.000Z');
    expect(retentionCutoff('1y', now)).toBe('2025-09-05T08:00:00.000Z');
    expect(retentionCutoff('forever', now)).toBeNull();
  });
});

describe('retention · buildCleanupPlan', () => {
  const plans = buildCleanupPlan({
    now,
    users: [
      { userId: 'u-ayse', retention: '30d' },
      { userId: 'u-mehmet', retention: 'forever' },
      { userId: 'u-zeynep', retention: '1y' },
    ],
  });

  it('skips forever users and sets per-user cutoffs', () => {
    expect(plans.map((p) => p.userId)).toEqual(['u-ayse', 'u-zeynep']);
    expect(plans[0]?.cutoff).toBe('2026-08-06T08:00:00.000Z');
    expect(plans[1]?.cutoff).toBe('2025-09-05T08:00:00.000Z');
  });

  it('covers every retention-limited table with the right column and op', () => {
    const steps = plans[0]?.steps ?? [];
    const byTable = Object.fromEntries(steps.map((s) => [s.table, s]));
    expect(byTable['email_messages']).toMatchObject({ column: 'sent_at', op: 'delete', cutoff: '2026-08-06T08:00:00.000Z' });
    expect(byTable['email_threads']).toMatchObject({ column: 'last_message_at', op: 'delete' });
    expect(byTable['memory_chunks']).toMatchObject({ column: 'occurred_at', op: 'delete' });
    expect(byTable['captures']).toMatchObject({ column: 'created_at', op: 'soft_delete', storagePathColumn: 'storage_path' });
    expect(byTable['android_notifications']).toMatchObject({ column: 'posted_at', op: 'delete' });
    expect(byTable['assistant_messages']).toMatchObject({ column: 'created_at', op: 'delete' });
    expect(byTable['briefings']).toMatchObject({ column: 'generated_at', op: 'delete' });
    expect(byTable['insights']).toMatchObject({ column: 'for_date', excludeStatuses: { column: 'status', values: ['active'] } });
    expect(steps).toHaveLength(8);
  });

  it('never touches credentials, approvals or subscriptions', () => {
    const touched = new Set(plans.flatMap((p) => p.steps.map((s) => String(s.table))));
    for (const protectedTable of RETENTION_PROTECTED_TABLES) expect(touched.has(protectedTable)).toBe(false);
  });
});

describe('retention · deleteHistoryPlan', () => {
  it('deletes everything when no age is given, else rows older than N days', () => {
    const all = deleteHistoryPlan('u1', { now });
    expect(all.cutoff).toBeNull();
    expect(all.steps.every((s) => s.cutoff === null)).toBe(true);
    expect(all.steps.map((s) => s.table)).toContain('captures');

    const older = deleteHistoryPlan('u1', { now, olderThanDays: 10 });
    expect(older.cutoff).toBe('2026-08-26T08:00:00.000Z');
    expect(older.steps.every((s) => s.cutoff === '2026-08-26T08:00:00.000Z')).toBe(true);
    expect(() => deleteHistoryPlan('u1', { now, olderThanDays: -1 })).toThrow(RangeError);
  });
});

describe('retention · accountDeletionPlan', () => {
  it('orders steps: revoke → storage → revenuecat → audit → auth user, with user-scoped prefixes', () => {
    const plan = accountDeletionPlan('u-42');
    expect(plan.steps.map((s) => s.step)).toEqual(['revoke_tokens', 'delete_storage_prefixes', 'unlink_revenuecat', 'anonymize_audit', 'delete_auth_user']);
    const storage = plan.steps[1];
    expect(storage?.step === 'delete_storage_prefixes' && storage.prefixes).toEqual([
      'captures/u-42',
      'exports/u-42',
      'briefing-audio/u-42',
      'attachments-cache/u-42',
    ]);
  });
});

describe('retention · export', () => {
  it('export URLs expire after 24 hours', () => {
    expect(exportUrlExpiry(now)).toBe('2026-09-06T08:00:00.000Z');
  });

  it('manifest excludes secrets and infra tables, dedupes and sorts', () => {
    const m = exportBundleManifest(['email_threads', 'oauth_credentials', 'captures', 'rate_limits', 'oauth_states', 'captures', ' profiles ']);
    expect(m.version).toBe(1);
    expect(m.tables.map((t) => t.name)).toEqual(['captures', 'email_threads', 'profiles']);
    expect(m.tables[0]).toEqual({ name: 'captures', file: 'captures.json' });
    expect(m.excluded).toEqual(['oauth_credentials', 'rate_limits', 'oauth_states']);
    for (const t of EXPORT_EXCLUDED_TABLES) expect(m.tables.some((x) => x.name === t)).toBe(false);
  });
});
