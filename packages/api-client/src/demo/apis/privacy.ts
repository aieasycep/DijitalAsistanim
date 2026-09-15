import type { DataExportRequest } from '@da/domain';
import { deleteAccountRequestSchema, deleteHistoryRequestSchema } from '@da/validation';
import type { PrivacyApi } from '../../datasource';
import type { DemoContext } from '../context';
import { appendAudit } from '../core/audit';
import { schedule } from '../latency';
import type { DemoState } from '../state';
import { validate } from '../validate';
import type { DemoAuthApi } from './auth';

const EXPORT_URL_TTL_HOURS = 24;
const EXPORT_SIZE_BYTES = 184_320;

function settleExport(ctx: DemoContext, s: DemoState, exp: DataExportRequest): void {
  if (exp.status !== 'requested' && exp.status !== 'processing') return;
  const now = ctx.nowIso();
  exp.status = 'ready';
  exp.storagePath = `${ctx.userId}/export-${exp.id.slice(-6)}.json`;
  exp.downloadUrl = `${ctx.webUrl}/demo-export.json`;
  exp.urlExpiresAt = ctx.clock.addMinutes(ctx.clock.now(), EXPORT_URL_TTL_HOURS * 60);
  exp.completedAt = now;
  exp.sizeBytes = EXPORT_SIZE_BYTES;
  exp.updatedAt = now;
}

export function createPrivacyApi(ctx: DemoContext, auth: DemoAuthApi): PrivacyApi {
  return {
    requestExport: () =>
      ctx.run((): DataExportRequest => {
        const now = ctx.nowIso();
        const exp: DataExportRequest = {
          id: ctx.nextId(),
          userId: ctx.userId,
          status: 'requested',
          storagePath: null,
          downloadUrl: null,
          urlExpiresAt: null,
          failureReason: null,
          completedAt: null,
          sizeBytes: null,
          createdAt: now,
          updatedAt: now,
        };
        ctx.store.mutate((s) => {
          s.exports.push(exp);
          appendAudit(ctx, s, 'data.export', {
            targetType: 'data_export',
            targetId: exp.id,
            metadata: { status: 'requested' },
          });
        });
        schedule(0, () => {
          ctx.store.mutate((s) => {
            const e = s.exports.find((x) => x.id === exp.id);
            if (e && e.status === 'requested') {
              e.status = 'processing';
              e.updatedAt = ctx.nowIso();
            }
          });
        });
        schedule(ctx.timings.exportProcessingMs, () => {
          ctx.store.mutate((s) => {
            const e = s.exports.find((x) => x.id === exp.id);
            if (e) settleExport(ctx, s, e);
          });
        });
        return { ...exp };
      }),
    getExportStatus: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          for (const e of s.exports) {
            const elapsed = Date.parse(ctx.nowIso()) - Date.parse(e.createdAt);
            if (
              (e.status === 'requested' || e.status === 'processing') &&
              elapsed > ctx.timings.exportProcessingMs + 1000
            )
              settleExport(ctx, s, e);
          }
        });
        const exports = ctx.store.state.exports;
        const found = id
          ? exports.find((e) => e.id === id)
          : [...exports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        return found ? { ...found } : null;
      }),
    deleteHistory: (input) =>
      ctx.run(() => {
        const clean = validate(deleteHistoryRequestSchema, input ?? {});
        const cutoff = ctx.clock.addMinutes(ctx.clock.now(), -(clean.olderThanDays ?? 0) * 24 * 60);
        return ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          const older = (iso: string): boolean => iso <= cutoff;
          const memoryBefore = s.memory.length;
          s.memory = s.memory.filter((m) => !older(m.occurredAt));
          let emailAnalyses = 0;
          for (const t of s.threads) {
            if (t.analysis && older(t.lastMessageAt)) {
              t.analysis = null;
              emailAnalyses += 1;
            }
          }
          let insights = 0;
          for (const i of s.insights) {
            if (!i.deletedAt && i.status !== 'active' && older(i.createdAt)) {
              i.deletedAt = now;
              insights += 1;
            }
          }
          let captures = 0;
          for (const c of s.captures) {
            if (!c.deletedAt && older(c.createdAt)) {
              c.deletedAt = now;
              c.extractedText = null;
              captures += 1;
            }
          }
          let assistantThreads = 0;
          for (const t of s.assistantThreads) {
            if (!t.deletedAt && older(t.lastMessageAt)) {
              t.deletedAt = now;
              assistantThreads += 1;
            }
          }
          const messagesBefore = s.assistantMessages.length;
          const deletedThreadIds = new Set(
            s.assistantThreads.filter((t) => t.deletedAt).map((t) => t.id),
          );
          s.assistantMessages = s.assistantMessages.filter(
            (m) => !deletedThreadIds.has(m.threadId),
          );
          const notesBefore = s.postMeetingNotes.length;
          s.postMeetingNotes = s.postMeetingNotes.filter((n) => !older(n.createdAt));
          const counts = {
            memoryChunks: memoryBefore - s.memory.length,
            emailAnalyses,
            insights,
            captures,
            assistantThreads,
            assistantMessages: messagesBefore - s.assistantMessages.length,
            postMeetingNotes: notesBefore - s.postMeetingNotes.length,
          };
          appendAudit(ctx, s, 'data.delete_history', {
            targetType: 'user',
            targetId: ctx.userId,
            metadata: { olderThanDays: clean.olderThanDays ?? 0, ...counts },
          });
          return counts;
        });
      }),
    deleteAccount: (input) =>
      ctx.run(async () => {
        validate(deleteAccountRequestSchema, input);
        const wiped = ctx.emptySeed();
        const audit = ctx.store.mutate((s) =>
          appendAudit(ctx, s, 'account.delete', {
            targetType: 'user',
            targetId: ctx.userId,
            metadata: { confirmation: input.confirmation },
          }),
        );
        wiped.auditLogs = [audit];
        wiped.idSeq = ctx.store.state.idSeq;
        ctx.store.replace(wiped);
        await ctx.store.flush();
        await auth.clearSession();
        ctx.pendingChanged.emit(0);
      }),
    listAuditLogs: (input) =>
      ctx.run(() =>
        [...ctx.store.state.auditLogs]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, input?.limit ?? 50)
          .map((log) => ({
            action: log.action,
            actor: log.actor,
            createdAt: log.createdAt,
            targetType: log.targetType ?? null,
          })),
      ),
  };
}
