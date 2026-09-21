/** BriefingsApi + BillingApi + PrivacyApi + AndroidNotificationsApi. */
import type { Briefing, BriefingRequest } from '@da/domain';
import type { AndroidNotificationsApi, BillingApi, BriefingsApi, PrivacyApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, write, type SupabaseContext } from './client';
import { clearLocalState } from './localState';
import { toAndroidNotification, toAuditLogEntry, toBriefing, toSubscription } from './mappers';
import type { AndroidNotificationRow, AuditLogRow, BriefingRow, SubscriptionRow } from './rows';

/** Briefing with its items embedded (FK briefing_items.briefing_id). */
export const BRIEFING_SELECT = '*, items:briefing_items(*)';

const DEFAULT_AUDIT_LIMIT = 50;
const DEFAULT_NOTIFICATION_LIMIT = 50;

export function createBriefingsApi(ctx: SupabaseContext): BriefingsApi {
  const briefings = () => ctx.table<BriefingRow>('briefings');

  /** The function answers `not_found` when no briefing exists for that day (and none should be generated). */
  async function fetchBriefing(req: BriefingRequest): Promise<Briefing | null> {
    try {
      return await ctx.call('briefing', req);
    } catch (e) {
      if (e instanceof ClientApiError && e.code === 'not_found') return null;
      throw e;
    }
  }

  return {
    getBriefing: (input) =>
      fetchBriefing({ kind: input.kind, date: input.date, regenerate: input.regenerate }),

    getBriefingById: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toBriefing(
          await exec(
            briefings().select(BRIEFING_SELECT).eq('user_id', userId).eq('id', id).single(),
          ),
        );
      }),

    markOpened: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          briefings()
            .update({ opened_at: ctx.now().toISOString() })
            .eq('user_id', userId)
            .eq('id', id)
            .is('opened_at', null),
        );
      }),

    closeDay: (input) => ctx.call('briefing-close-day', input),

    getAudio: (briefingId) => ctx.call('briefing-audio', { briefingId }),

    getWeekly: (input) => fetchBriefing({ kind: 'weekly', date: input?.weekStart }),
  };
}

export function createBillingApi(ctx: SupabaseContext): BillingApi {
  return {
    getEntitlement: () => ctx.call('entitlement', {}),

    listSubscriptions: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          ctx
            .table<SubscriptionRow>('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .order('starts_at', { ascending: false }),
        );
        return rows.map(toSubscription);
      }),

    linkRevenueCatUser: async (appUserId) => {
      await ctx.call('billing-link-revenuecat', { appUserId });
    },

    getReferralStatus: () => ctx.call('referral-status', {}),

    redeemReferral: (input) => ctx.call('referral-redeem', input),
  };
}

export function createPrivacyApi(ctx: SupabaseContext): PrivacyApi {
  return {
    requestExport: () => ctx.call('privacy-export-request', {}),

    getExportStatus: (id) => ctx.call('privacy-export-status', { id }),

    /** `delete_my_history` is a security-definer RPC scoped to auth.uid(); returns per-table deletion counts. */
    deleteHistory: (input) =>
      write(async () => {
        await ctx.requireUserId();
        const counts = await ctx.rpc<Record<string, unknown> | null>('delete_my_history', {
          older_than_days: input?.olderThanDays ?? null,
        });
        const out: Record<string, number> = {};
        for (const [key, value] of Object.entries(counts ?? {})) {
          if (typeof value === 'number') out[key] = value;
        }
        return out;
      }),

    /** Server deletes the auth user; the local session and caches are dropped regardless of the sign-out call's outcome. */
    deleteAccount: (input) =>
      write(async () => {
        await ctx.call('privacy-delete-account', input);
        try {
          await ctx.client.auth.signOut({ scope: 'local' });
        } catch {
          // The account no longer exists server-side; the local session is removed by supabase-js either way.
        }
        await clearLocalState(ctx);
      }),

    listAuditLogs: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          ctx
            .table<AuditLogRow>('audit_logs')
            .select('id, user_id, action, actor, target_type, target_id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(input?.limit ?? DEFAULT_AUDIT_LIMIT),
        );
        return rows.map(toAuditLogEntry);
      }),
  };
}

export function createAndroidNotificationsApi(ctx: SupabaseContext): AndroidNotificationsApi {
  const notifications = () => ctx.table<AndroidNotificationRow>('android_notifications');

  return {
    ingest: async (items) => {
      if (items.length === 0) return { accepted: 0 };
      return ctx.call('android-notifications-ingest', { items });
    },

    listRecent: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          notifications()
            .select('*')
            .eq('user_id', userId)
            .order('posted_at', { ascending: false })
            .limit(input?.limit ?? DEFAULT_NOTIFICATION_LIMIT),
        );
        return rows.map(toAndroidNotification);
      }),

    clearAll: () =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(notifications().delete().eq('user_id', userId));
      }),
  };
}
