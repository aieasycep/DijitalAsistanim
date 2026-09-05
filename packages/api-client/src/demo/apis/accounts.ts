import type { CalendarEvent, ConnectedAccount, OAuthStartResponse, UUID } from '@da/domain';
import { oauthStartRequestSchema } from '@da/validation';
import type { AccountsApi, DeviceApprovalResult } from '../../datasource';
import { ClientApiError } from '../../errors';
import type { DemoContext } from '../context';
import { emitPending } from '../core/approvals';
import { appendAudit } from '../core/audit';
import { syncConflicts } from '../core/calendar';
import { DEFAULT_CONTROLS, GOOGLE_READ_SCOPES } from '../fixtures/accounts';
import type { DemoState, PendingOAuth } from '../state';
import { notFound, validate } from '../validate';

const MICROSOFT_READ_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'Mail.Read',
  'Calendars.Read',
];

const WRITE_SCOPES: Record<'google' | 'microsoft', Record<PendingOAuth['scopeGroup'], string[]>> = {
  google: {
    read: [],
    mail_send: ['https://www.googleapis.com/auth/gmail.send'],
    calendar_write: ['https://www.googleapis.com/auth/calendar.events'],
    tasks_write: ['https://www.googleapis.com/auth/tasks'],
  },
  microsoft: {
    read: [],
    mail_send: ['Mail.Send'],
    calendar_write: ['Calendars.ReadWrite'],
    tasks_write: ['Tasks.ReadWrite'],
  },
};

function appScheme(ctx: DemoContext): string {
  const raw = ctx.config.appScheme;
  const idx = raw.indexOf('://');
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

function findAccount(state: DemoState, id: UUID, includeDeleted = false): ConnectedAccount {
  const account = state.accounts.find((a) => a.id === id && (includeDeleted || !a.deletedAt));
  if (!account) throw notFound('Hesap', id);
  return account;
}

/**
 * Mirrors device-calendar-upsert: an approval the device executed moves from `executing` (handler
 * `device`) to `executed` / `failed`. Any other state is left untouched (idempotent re-uploads).
 */
function applyDeviceApprovalResult(
  ctx: DemoContext,
  s: DemoState,
  accountId: UUID,
  result: DeviceApprovalResult,
  now: string,
): void {
  const approval = s.approvals.find((a) => a.id === result.approvalId);
  if (!approval || approval.status !== 'executing') return;
  const handler = (approval.executionResult as { handler?: unknown } | null)?.handler;
  if (handler !== 'device') return;
  if (result.outcome === 'executed') {
    approval.status = 'executed';
    approval.executedAt = now;
    approval.updatedAt = now;
    approval.failureReason = null;
    approval.executionResult = {
      handler: 'device',
      externalEventId: result.externalEventId ?? null,
    };
    if (result.externalEventId) {
      const event = s.events.find(
        (e) => e.accountId === accountId && e.externalEventId === result.externalEventId,
      );
      if (event) event.isAiCreated = true;
    }
    if (approval.insightId) {
      const insight = s.insights.find((i) => i.id === approval.insightId);
      if (insight && insight.status === 'active') {
        insight.status = 'completed';
        insight.updatedAt = now;
      }
    }
    appendAudit(ctx, s, 'approval.execute', {
      targetType: 'approval_action',
      targetId: approval.id,
      metadata: { type: approval.type, kind: 'device' },
    });
    appendAudit(ctx, s, 'calendar.write', {
      targetType: 'calendar_event',
      targetId: result.externalEventId ?? null,
      metadata: { op: approval.type === 'calendar_update' ? 'update' : 'create', kind: 'device' },
    });
    return;
  }
  approval.status = 'failed';
  approval.failureReason = result.failureReason ?? 'device_write_failed';
  approval.updatedAt = now;
  appendAudit(ctx, s, 'approval.fail', {
    targetType: 'approval_action',
    targetId: approval.id,
    metadata: { type: approval.type, kind: 'device', reason: approval.failureReason },
  });
}

function demoEmailFor(state: DemoState, provider: 'google' | 'microsoft'): string {
  const base = (state.profile.firstName || 'yunus').toLowerCase().replace(/[^a-z]/g, '') || 'yunus';
  const taken = new Set(state.accounts.map((a) => a.email?.toLowerCase()).filter(Boolean));
  const candidates =
    provider === 'google'
      ? [`${base}.emre@gmail.com`, `${base}.demo@gmail.com`]
      : [`${base}@sirket.com`, `${base}@outlook.com`];
  return (
    candidates.find((c) => !taken.has(c)) ??
    `${base}+${state.accounts.length}@${provider === 'google' ? 'gmail.com' : 'outlook.com'}`
  );
}

export function createAccountsApi(ctx: DemoContext): AccountsApi {
  const startFlow = (input: {
    provider: 'google' | 'microsoft';
    kinds: ('email' | 'calendar' | 'tasks')[];
    scopeGroup: PendingOAuth['scopeGroup'];
    redirectTo: string;
    accountId?: UUID;
  }): OAuthStartResponse => {
    const state = `demo-${ctx.latency.token(10)}`;
    const accountId = input.accountId ?? ctx.nextId();
    ctx.store.mutate((s) => {
      s.pendingOAuth = s.pendingOAuth.filter(
        (p) => Date.parse(p.createdAt) > Date.parse(ctx.nowIso()) - 60 * 60_000,
      );
      s.pendingOAuth.push({
        state,
        provider: input.provider,
        kinds: input.kinds,
        scopeGroup: input.scopeGroup,
        accountId,
        existing: Boolean(input.accountId),
        redirectTo: input.redirectTo,
        createdAt: ctx.nowIso(),
      });
    });
    return {
      authorizationUrl: `${appScheme(ctx)}://oauth/${input.provider}?state=${state}&status=ok&accountId=${accountId}`,
      state,
    };
  };

  return {
    listAccounts: () =>
      ctx.run(() => ctx.store.state.accounts.filter((a) => !a.deletedAt).map((a) => ({ ...a }))),
    startOAuth: (req) =>
      ctx.run(() => {
        const clean = validate(oauthStartRequestSchema, req);
        if (clean.accountId) findAccount(ctx.store.state, clean.accountId, true);
        return startFlow({
          provider: clean.provider,
          kinds: clean.kinds,
          scopeGroup: clean.scopeGroup ?? 'read',
          redirectTo: clean.redirectTo,
          accountId: clean.accountId,
        });
      }),
    completeOAuth: (input) =>
      ctx.run(() => {
        const pending = ctx.store.state.pendingOAuth.find((p) => p.state === input.state);
        if (!pending)
          throw new ClientApiError({
            code: 'validation',
            message: 'OAuth durumu tanınmadı; bağlantıyı yeniden başlat.',
          });
        if (input.status === 'error') {
          ctx.store.mutate((s) => {
            s.pendingOAuth = s.pendingOAuth.filter((p) => p.state !== input.state);
            appendAudit(ctx, s, 'oauth.connect', {
              targetType: 'connected_account',
              targetId: pending.accountId,
              metadata: { provider: pending.provider, ok: false, error: input.error ?? null },
            });
          });
          return null;
        }
        return ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          s.pendingOAuth = s.pendingOAuth.filter((p) => p.state !== input.state);
          const extraScopes = WRITE_SCOPES[pending.provider][pending.scopeGroup];
          const existing = s.accounts.find((a) => a.id === pending.accountId);
          if (existing) {
            existing.deletedAt = null;
            existing.status = 'active';
            existing.lastError = null;
            existing.grantedScopes = Array.from(
              new Set([...existing.grantedScopes, ...extraScopes]),
            );
            existing.kinds = Array.from(new Set([...existing.kinds, ...pending.kinds]));
            existing.lastSyncAt = now;
            existing.updatedAt = now;
            appendAudit(
              ctx,
              s,
              pending.scopeGroup === 'read' ? 'oauth.connect' : 'oauth.scope_upgrade',
              {
                targetType: 'connected_account',
                targetId: existing.id,
                metadata: { provider: pending.provider, scopeGroup: pending.scopeGroup },
              },
            );
            return { ...existing };
          }
          const email = demoEmailFor(s, pending.provider);
          const hasEmail = pending.kinds.includes('email');
          const displayName =
            pending.provider === 'google'
              ? `${hasEmail ? 'Gmail' : 'Google Takvim'} · ${email}`
              : `${hasEmail ? 'Outlook' : 'Microsoft Takvim'} · ${email}`;
          const account: ConnectedAccount = {
            id: pending.accountId,
            userId: ctx.userId,
            provider: pending.provider,
            kinds: pending.kinds,
            externalAccountId: email,
            displayName,
            email,
            status: 'active',
            grantedScopes: [
              ...(pending.provider === 'google' ? GOOGLE_READ_SCOPES : MICROSOFT_READ_SCOPES),
              ...extraScopes,
            ],
            controls: {
              ...DEFAULT_CONTROLS,
              readEmail: hasEmail,
              prepareDrafts: hasEmail,
              analyzeAttachments: hasEmail && s.preferences.analyzeAttachments,
              readEvents: pending.kinds.includes('calendar'),
              readTasks: pending.kinds.includes('tasks'),
            },
            lastSyncAt: now,
            lastError: null,
            backfillCompleted: true,
            isPrimary: !s.accounts.some((a) => !a.deletedAt && a.isPrimary),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          s.accounts.push(account);
          appendAudit(ctx, s, 'oauth.connect', {
            targetType: 'connected_account',
            targetId: account.id,
            metadata: { provider: pending.provider, kinds: pending.kinds.join(',') },
          });
          return { ...account };
        });
      }),
    registerDeviceCalendar: (input) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          const existing = s.accounts.find(
            (a) => a.provider === input.provider && a.externalAccountId === 'device',
          );
          if (existing) {
            existing.deletedAt = null;
            existing.status = 'active';
            existing.displayName = input.displayName;
            existing.grantedScopes = [...input.calendarIds];
            existing.lastSyncAt = now;
            existing.updatedAt = now;
            return { ...existing };
          }
          const account: ConnectedAccount = {
            id: ctx.nextId(),
            userId: ctx.userId,
            provider: input.provider,
            kinds: ['calendar'],
            externalAccountId: 'device',
            displayName: input.displayName,
            email: null,
            status: 'active',
            grantedScopes: [...input.calendarIds],
            controls: {
              ...DEFAULT_CONTROLS,
              readEmail: false,
              analyzeAttachments: false,
              prepareDrafts: false,
              readTasks: false,
            },
            lastSyncAt: now,
            lastError: null,
            backfillCompleted: true,
            isPrimary: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          s.accounts.push(account);
          appendAudit(ctx, s, 'oauth.connect', {
            targetType: 'connected_account',
            targetId: account.id,
            metadata: { provider: input.provider, calendars: input.calendarIds.length },
          });
          return { ...account };
        }),
      ),
    updateControls: (accountId, controls) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const account = findAccount(s, accountId);
          account.controls = { ...account.controls, ...controls };
          account.updatedAt = ctx.nowIso();
          return { ...account };
        }),
      ),
    setPrimary: (accountId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          findAccount(s, accountId);
          for (const a of s.accounts) {
            a.isPrimary = a.id === accountId;
          }
        });
      }),
    disconnect: (accountId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const account = findAccount(s, accountId);
          const now = ctx.nowIso();
          account.deletedAt = now;
          account.status = 'disconnected';
          account.updatedAt = now;
          if (account.isPrimary) {
            account.isPrimary = false;
            const next = s.accounts.find((a) => !a.deletedAt);
            if (next) next.isPrimary = true;
          }
          appendAudit(ctx, s, 'oauth.revoke', {
            targetType: 'connected_account',
            targetId: account.id,
            metadata: { provider: account.provider },
          });
        });
      }),
    reconnect: (accountId, redirectTo) =>
      ctx.run(() => {
        const account = findAccount(ctx.store.state, accountId, true);
        if (account.provider !== 'google' && account.provider !== 'microsoft') {
          throw new ClientApiError({
            code: 'validation',
            message: 'Bu hesap türü yeniden bağlanmayı desteklemiyor.',
          });
        }
        return startFlow({
          provider: account.provider,
          kinds: account.kinds.filter(
            (k): k is 'email' | 'calendar' | 'tasks' =>
              k === 'email' || k === 'calendar' || k === 'tasks',
          ),
          scopeGroup: 'read',
          redirectTo,
          accountId,
        });
      }),
    syncNow: (input) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          for (const a of s.accounts) {
            if (a.deletedAt) continue;
            if (input?.accountId && a.id !== input.accountId) continue;
            a.lastSyncAt = now;
            a.backfillCompleted = true;
            a.updatedAt = now;
          }
          s.stats.lastAnalyzedAt = now;
          appendAudit(ctx, s, 'sync.run', {
            actor: 'user',
            targetType: 'connected_account',
            targetId: input?.accountId ?? null,
            metadata: { resource: input?.resource ?? 'all' },
          });
        });
      }),
    upsertDeviceEvents: (accountId, events, approvalResult) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          findAccount(s, accountId);
          const now = ctx.nowIso();
          for (const incoming of events) {
            const existing = s.events.find(
              (e) => e.accountId === accountId && e.externalEventId === incoming.externalEventId,
            );
            if (existing) {
              Object.assign(existing, incoming, { accountId, userId: ctx.userId, updatedAt: now });
              continue;
            }
            const created: CalendarEvent = {
              ...incoming,
              id: ctx.nextId(),
              userId: ctx.userId,
              accountId,
              createdAt: now,
              updatedAt: now,
            };
            s.events.push(created);
          }
          syncConflicts(s, ctx.clock, () => ctx.nextId(), now);
          if (approvalResult) applyDeviceApprovalResult(ctx, s, accountId, approvalResult, now);
        });
        if (approvalResult) emitPending(ctx);
      }),
  };
}
