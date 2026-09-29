import type {
  AssistantAskResponse,
  AssistantMessage,
  AssistantThread,
  SuggestedQuestionsResponse,
} from '@da/domain';
import { PRO_QUOTAS } from '@da/domain';
import { assistantAskRequestSchema } from '@da/validation';
import type { AssistantApi } from '../../datasource';
import { ClientApiError } from '../../errors';
import type { DemoContext } from '../context';
import { eventsOnDay } from '../core/calendar';
import { resolveIntent } from '../core/intents';
import { todayInsights } from '../core/insights';
import { getContact, isUserEmail } from '../core/lookup';
import { firstName } from '../format';
import { truncate } from '../text';
import { notFound, validate } from '../validate';

export function createAssistantApi(ctx: DemoContext): AssistantApi {
  return {
    ask: (req) =>
      ctx.run((): AssistantAskResponse => {
        const clean = validate(assistantAskRequestSchema, req);
        const now = ctx.nowIso();
        const today = ctx.clock.today();
        const { thread, userMessage, lastAssistant } = ctx.store.mutate((s) => {
          if (s.usage.date !== today) s.usage = { date: today, assistantQueries: 0, captures: 0 };
          if (s.usage.assistantQueries >= PRO_QUOTAS.assistantQueriesPerDay)
            throw new ClientApiError(
              {
                code: 'quota_exceeded',
                message: 'Günlük asistan kotası doldu.',
                retryAfterSec: 3600,
              },
              429,
            );
          s.usage.assistantQueries += 1;
          let existing = clean.threadId
            ? s.assistantThreads.find((t) => t.id === clean.threadId && !t.deletedAt)
            : undefined;
          if (clean.threadId && !existing) throw notFound('Sohbet', clean.threadId);
          if (!existing) {
            existing = {
              id: ctx.nextId(),
              userId: ctx.userId,
              title: truncate(clean.message, 60),
              lastMessageAt: now,
              contactId: clean.contactId ?? null,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            };
            s.assistantThreads.push(existing);
          }
          const previous =
            s.assistantMessages
              .filter((m) => m.threadId === existing?.id && m.role === 'assistant')
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
          const message: AssistantMessage = {
            id: ctx.nextId(),
            userId: ctx.userId,
            threadId: existing.id,
            role: 'user',
            content: clean.message,
            inputMode: clean.inputMode,
            sources: [],
            cards: [],
            approvalIds: [],
            uncertain: false,
            tokensIn: null,
            tokensOut: null,
            model: null,
            createdAt: now,
            updatedAt: now,
          };
          s.assistantMessages.push(message);
          return { thread: existing, userMessage: message, lastAssistant: previous };
        });
        const result = resolveIntent(ctx, ctx.store.state, {
          message: clean.message,
          inputMode: clean.inputMode,
          contactId: clean.contactId ?? thread.contactId ?? null,
          userMessageId: userMessage.id,
          lastAssistant,
        });
        const answer = ctx.store.mutate((s): AssistantMessage => {
          const created: AssistantMessage = {
            id: ctx.nextId(),
            userId: ctx.userId,
            threadId: thread.id,
            role: 'assistant',
            content: result.content,
            inputMode: clean.inputMode,
            sources: result.sources,
            cards: result.cards,
            approvalIds: result.approvals.map((a) => a.id),
            uncertain: result.uncertain,
            tokensIn: Math.ceil(clean.message.length / 4),
            tokensOut: Math.ceil(result.content.length / 4),
            model: 'demo',
            createdAt: ctx.nowIso(),
            updatedAt: ctx.nowIso(),
          };
          s.assistantMessages.push(created);
          const t = s.assistantThreads.find((x) => x.id === thread.id);
          if (t) {
            t.lastMessageAt = created.createdAt;
            t.updatedAt = created.createdAt;
          }
          return created;
        });
        return {
          threadId: thread.id,
          message: { ...answer },
          cards: result.cards,
          approvals: result.approvals,
          suggestedFollowUps: result.suggestedFollowUps,
        };
      }),
    suggestedQuestions: (input) =>
      ctx.run((): SuggestedQuestionsResponse => {
        const s = ctx.store.state;
        if (input?.contactId) {
          const contact = getContact(s, input.contactId);
          const first = firstName(contact.displayName);
          return {
            questions: [
              { id: 'last', text: `${first} ile en son ne konuştuk?`, reason: 'Kişi sayfası' },
              {
                id: 'reply',
                text: `${first}'ten cevap geldi mi?`,
                reason: s.followUps.some((f) => f.contactId === contact.id && f.status !== 'closed')
                  ? 'Açık takip var'
                  : null,
              },
              { id: 'open', text: `${first} ile açık konular neler?`, reason: null },
              { id: 'next', text: `${first} ile bir sonraki toplantım ne zaman?`, reason: null },
            ],
          };
        }
        const today = ctx.clock.today();
        const questions: SuggestedQuestionsResponse['questions'] = [
          { id: 'focus', text: 'Bugün neye odaklanmalıyım?', reason: null },
        ];
        const active = todayInsights(s, ctx.clock);
        if (active.some((i) => i.kind === 'waiting_for_user' || i.kind === 'priority'))
          questions.push({
            id: 'waiting',
            text: 'Kimlere cevap vermem gerekiyor?',
            reason: 'Açık cevap bekleyenler var',
          });
        if (eventsOnDay(s, ctx.clock, ctx.clock.addDays(today, 1)).length >= 1)
          questions.push({
            id: 'tomorrow',
            text: 'Yarın yoğun muyum?',
            reason: 'Yarın etkinliklerin var',
          });
        if (
          active.some((i) => i.kind === 'deadline') ||
          s.lifeEvents.some((l) => l.type === 'payment')
        )
          questions.push({
            id: 'deadlines',
            text: "Bu hafta hangi deadline'lar var?",
            reason: 'Bu hafta son tarihler var',
          });
        const meeting = eventsOnDay(s, ctx.clock, today).find((e) =>
          e.attendees.some((a) => !isUserEmail(s, a.email) && (a.contactId || a.name)),
        );
        const attendee = meeting?.attendees.find(
          (a) => !isUserEmail(s, a.email) && (a.contactId || a.name),
        );
        if (attendee)
          questions.push({
            id: 'meeting',
            text: `${firstName(attendee.name ?? 'Kişi')} ile en son ne konuştuk?`,
            reason: `Bugün ${ctx.clock.hhmm(meeting?.startAt ?? ctx.nowIso())} toplantın var`,
          });
        return { questions: questions.slice(0, 5) };
      }),
    listThreads: () =>
      ctx.run(() =>
        ctx.store.state.assistantThreads
          .filter((t) => !t.deletedAt)
          .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
          .map((t): AssistantThread => ({ ...t })),
      ),
    getThreadMessages: (threadId) =>
      ctx.run(() => {
        const s = ctx.store.state;
        if (!s.assistantThreads.some((t) => t.id === threadId && !t.deletedAt))
          throw notFound('Sohbet', threadId);
        return s.assistantMessages
          .filter((m) => m.threadId === threadId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
          .map((m) => ({ ...m }));
      }),
    deleteThread: (threadId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const t = s.assistantThreads.find((x) => x.id === threadId);
          if (!t) throw notFound('Sohbet', threadId);
          t.deletedAt = ctx.nowIso();
          t.updatedAt = t.deletedAt;
        });
      }),
    transcribe: () => ctx.run(() => null),
  };
}
