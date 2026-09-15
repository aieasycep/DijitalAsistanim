import type { DraftReplyResponse, EmailDetailResponse, FollowUp } from '@da/domain';
import { draftReplyRequestSchema } from '@da/validation';
import type { EmailApi } from '../../datasource';
import type { DemoContext } from '../context';
import { applyInstructions, followUpDraftFor, replyDraftsFor } from '../core/drafts';
import { completeInsightsFor, setInsightStatus } from '../core/insights';
import { getFollowUp, getThread, isUserEmail, threadSource } from '../core/lookup';
import { validate } from '../validate';

export function createEmailApi(ctx: DemoContext): EmailApi {
  const liveFollowUps = (): FollowUp[] => {
    const s = ctx.store.state;
    const now = ctx.nowIso();
    return s.followUps
      .filter((f) => f.status === 'watching' || f.status === 'nudge_due' || f.status === 'snoozed')
      .map((f) =>
        f.status === 'snoozed' && f.snoozedUntil && f.snoozedUntil <= now
          ? { ...f, status: 'nudge_due' as const }
          : f,
      )
      .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  };

  return {
    getThread: (id) =>
      ctx.run((): EmailDetailResponse => {
        const s = ctx.store.state;
        const thread = getThread(s, id);
        const messages = s.messages
          .filter((m) => m.threadId === id && !m.deletedAt)
          .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
          .map((m) => ({
            id: m.id,
            from: m.from.name ?? m.from.email,
            sentAt: m.sentAt,
            bodyText: m.bodyText ?? m.snippet,
            isFromUser: m.isFromUser,
            webUrl: m.webUrl ?? null,
          }));
        const insights = s.insights
          .filter((i) => i.entityType === 'email_thread' && i.entityId === id && !i.deletedAt)
          .sort((a, b) => b.priorityScore - a.priorityScore);
        const relatedInsight = insights.find((i) => i.status === 'active') ?? insights[0] ?? null;
        const followUp = s.followUps.find((f) => f.threadId === id) ?? null;
        const commitments = s.commitments.filter((c) => !c.deletedAt && c.source.id === id);
        return { thread: { ...thread }, messages, relatedInsight, followUp, commitments };
      }),
    markRead: (id, isRead) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const thread = getThread(s, id);
          thread.isRead = isRead;
          thread.updatedAt = ctx.nowIso();
        });
      }),
    draftReply: (req) =>
      ctx.run((): DraftReplyResponse => {
        const clean = validate(draftReplyRequestSchema, req);
        const s = ctx.store.state;
        const thread = getThread(s, clean.threadId);
        const drafts = replyDraftsFor(ctx, thread);
        const lastMessage = s.messages
          .filter((m) => m.threadId === thread.id)
          .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
        return {
          draft: applyInstructions(drafts[clean.tone], clean.instructions),
          subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
          to: thread.participants
            .filter((p) => !isUserEmail(s, p.email))
            .map((p) => ({ name: p.name ?? null, email: p.email })),
          tone: clean.tone,
          basedOn: [
            threadSource(
              thread,
              lastMessage ? { timestamp: lastMessage.sentAt, excerpt: lastMessage.snippet } : {},
            ),
          ],
        };
      }),
    listFollowUps: () => ctx.run(() => liveFollowUps().map((f) => ({ ...f }))),
    getFollowUp: (id) => ctx.run(() => ({ ...getFollowUp(ctx.store.state, id) })),
    snoozeFollowUp: (id, until) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const f = getFollowUp(s, id);
          const now = ctx.nowIso();
          f.status = 'snoozed';
          f.snoozedUntil = until;
          f.updatedAt = now;
          for (const i of s.insights)
            if (i.entityType === 'follow_up' && i.entityId === id && i.status === 'active')
              setInsightStatus(s, i.id, 'snoozed', now, until);
          return { ...f };
        }),
      ),
    closeFollowUp: (id) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const f = getFollowUp(s, id);
          const now = ctx.nowIso();
          f.status = 'closed';
          f.closedAt = now;
          f.updatedAt = now;
          completeInsightsFor(s, 'follow_up', id, now);
          return { ...f };
        }),
      ),
    draftFollowUpMessage: (followUpId) =>
      ctx.run((): DraftReplyResponse => {
        const s = ctx.store.state;
        const followUp = getFollowUp(s, followUpId);
        const thread = getThread(s, followUp.threadId);
        return {
          draft: followUpDraftFor(ctx, followUp, thread),
          subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
          to: thread.participants
            .filter((p) => !isUserEmail(s, p.email))
            .map((p) => ({ name: p.name ?? null, email: p.email })),
          tone: 'professional',
          basedOn: [threadSource(thread), { ...followUp.source }],
        };
      }),
  };
}
