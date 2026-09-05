import type {
  AiFeedbackKind,
  EmailThread,
  Insight,
  LifeEvent,
  MailIntelligenceCategory,
  TodayFeed,
  UUID,
} from '@da/domain';
import { aiFeedbackSchema, flowRequestSchema, todayRequestSchema } from '@da/validation';
import type { FeedApi } from '../../datasource';
import type { DemoContext } from '../context';
import {
  allActiveInsights,
  completeInsightsFor,
  selectPriorities,
  setInsightStatus,
  sortByPriority,
  todayInsights,
} from '../core/insights';
import { reinforcePreference } from '../core/learning';
import { findContactByEmail, getInsight, getLifeEvent } from '../core/lookup';
import { fullDateLabel } from '../format';
import type { DemoState } from '../state';
import { validate } from '../validate';

function greetingFor(hour: number, name: string): string {
  if (hour >= 5 && hour < 12) return `Günaydın, ${name}`;
  if (hour >= 12 && hour < 18) return `İyi günler, ${name}`;
  if (hour >= 18 && hour < 23) return `İyi akşamlar, ${name}`;
  return `İyi geceler, ${name}`;
}

function applyEntityCompletion(
  ctx: DemoContext,
  s: DemoState,
  insight: Insight,
  status: 'completed' | 'dismissed' | 'active',
): void {
  const now = ctx.nowIso();
  switch (insight.entityType) {
    case 'email_thread': {
      const thread = s.threads.find((t) => t.id === insight.entityId);
      if (thread) {
        thread.userMarkedDone = status === 'completed';
        thread.userDismissed = status === 'dismissed';
        thread.updatedAt = now;
      }
      break;
    }
    case 'task': {
      const task = s.tasks.find((t) => t.id === insight.entityId);
      if (task) {
        task.status = status === 'completed' ? 'completed' : 'open';
        task.completedAt = status === 'completed' ? now : null;
        task.updatedAt = now;
      }
      break;
    }
    case 'commitment': {
      const c = s.commitments.find((x) => x.id === insight.entityId);
      if (c) {
        c.status =
          status === 'completed' ? 'completed' : status === 'dismissed' ? 'cancelled' : 'open';
        c.completedAt = status === 'completed' ? now : null;
        c.updatedAt = now;
      }
      break;
    }
    case 'follow_up': {
      const f = s.followUps.find((x) => x.id === insight.entityId);
      if (f && status !== 'active') {
        f.status = 'closed';
        f.closedAt = now;
        f.dismissCount += status === 'dismissed' ? 1 : 0;
        f.updatedAt = now;
      }
      break;
    }
    case 'life_event': {
      const l = s.lifeEvents.find((x) => x.id === insight.entityId);
      if (l) {
        l.status =
          status === 'completed'
            ? 'done'
            : status === 'dismissed'
              ? 'dismissed'
              : l.eventAt && ctx.clock.dateKey(l.eventAt) === ctx.clock.today()
                ? 'today'
                : 'upcoming';
        l.updatedAt = now;
      }
      break;
    }
    case 'conflict': {
      const c = s.conflicts.find((x) => x.id === insight.entityId);
      if (c && status !== 'active') c.status = 'ignored';
      break;
    }
    default:
      break;
  }
}

export function applyFeedbackLearning(
  ctx: DemoContext,
  s: DemoState,
  input: { kind: AiFeedbackKind; entityType: string; entityId: UUID; contactId?: UUID | null },
): void {
  const insight = s.insights.find(
    (i) =>
      i.id === input.entityId ||
      (i.entityType === input.entityType && i.entityId === input.entityId),
  );
  const thread = s.threads.find((t) => t.id === input.entityId || t.id === insight?.entityId);
  const person = insight?.source.person ?? thread?.participants[0]?.name ?? null;
  const contact = input.contactId
    ? s.contacts.find((c) => c.id === input.contactId)
    : person
      ? findContactByEmail(s, thread?.participants.find((p) => p.name === person)?.email)
      : undefined;
  const subject = contact
    ? `contact:${contact.id}`
    : thread
      ? `category:${thread.category}`
      : `entity:${input.entityType}`;
  const label =
    contact?.displayName ?? person ?? (thread ? `${thread.category} kategorisindeki` : 'Bu tür');
  switch (input.kind) {
    case 'not_important':
      reinforcePreference(ctx, s, {
        kind: contact ? 'person_priority' : 'category_priority',
        subjectKey: subject,
        statement: `${label} mailleri daha az öne çıkarıyorum.`,
        weight: -0.6,
      });
      if (thread) thread.userDismissed = true;
      break;
    case 'important':
      reinforcePreference(ctx, s, {
        kind: contact ? 'person_priority' : 'category_priority',
        subjectKey: subject,
        statement: `${label} yüksek öncelikli.`,
        weight: 0.6,
      });
      break;
    case 'show_more':
    case 'show_less':
      reinforcePreference(ctx, s, {
        kind: 'briefing_focus',
        subjectKey: `focus:${insight?.kind ?? input.entityType}`,
        statement: `${insight?.kind === 'life_event' ? 'Kişisel gelişmeleri' : 'Bu tür kartları'} ${input.kind === 'show_more' ? 'daha çok' : 'daha az'} gösteriyorum.`,
        weight: input.kind === 'show_more' ? 0.4 : -0.4,
      });
      break;
    case 'make_vip':
      if (contact && !s.vips.some((v) => v.contactId === contact.id)) {
        const now = ctx.nowIso();
        s.vips.push({
          id: ctx.nextId(),
          userId: ctx.userId,
          contactId: contact.id,
          displayName: contact.displayName,
          email: contact.emails[0] ?? null,
          relation: contact.company ? 'Müşteri' : null,
          notifyAlways: true,
          createdAt: now,
          updatedAt: now,
        });
        contact.isVip = true;
        reinforcePreference(ctx, s, {
          kind: 'person_priority',
          subjectKey: `contact:${contact.id}`,
          statement: `${contact.displayName} yüksek öncelikli.`,
          weight: 0.8,
        });
      }
      break;
    case 'stop_following': {
      const now = ctx.nowIso();
      for (const f of s.followUps) {
        if ((contact && f.contactId === contact.id) || (thread && f.threadId === thread.id)) {
          f.status = 'closed';
          f.closedAt = now;
          f.updatedAt = now;
          completeInsightsFor(s, 'follow_up', f.id, now);
        }
      }
      reinforcePreference(ctx, s, {
        kind: 'follow_up_cadence',
        subjectKey: subject,
        statement: `${label} için takip hatırlatması yapmıyorum.`,
        weight: -0.8,
      });
      break;
    }
    case 'correct':
      reinforcePreference(ctx, s, {
        kind: 'dismiss_pattern',
        subjectKey: `accuracy:${insight?.kind ?? input.entityType}`,
        statement: `${insight?.kind ?? 'Bu tür'} kartları genelde doğru buluyorsun.`,
        weight: 0.3,
      });
      break;
    case 'wrong':
      reinforcePreference(ctx, s, {
        kind: 'dismiss_pattern',
        subjectKey: `accuracy:${insight?.kind ?? input.entityType}`,
        statement: `${insight?.kind ?? 'Bu tür'} kartlarında daha temkinli davranıyorum.`,
        weight: -0.3,
      });
      break;
  }
}

function bucket(thread: EmailThread): MailIntelligenceCategory[] {
  const out: MailIntelligenceCategory[] = [];
  const low = thread.importance === 'low' || thread.category === 'promotion';
  if (
    !low &&
    (thread.importance === 'critical' || thread.importance === 'high') &&
    !thread.userMarkedDone
  )
    out.push('important');
  if (
    (thread.category === 'waiting_for_user' || thread.category === 'action_required') &&
    !thread.userMarkedDone
  )
    out.push('waiting_for_user');
  if (thread.category === 'waiting_for_other') out.push('waiting_for_other');
  if (thread.analysis?.deadline) out.push('has_deadline');
  if (low) out.push('low_priority');
  if (!out.length) out.push('information');
  return out;
}

export function createFeedApi(ctx: DemoContext): FeedApi {
  const api: FeedApi = {
    getToday: (input) =>
      ctx.run((): TodayFeed => {
        const clean = validate(todayRequestSchema, input ?? {});
        const s = ctx.store.state;
        const today = ctx.clock.today();
        const date = clean.date ?? today;
        const local = ctx.clock.local();
        const active =
          date === today
            ? todayInsights(s, ctx.clock)
            : allActiveInsights(s, ctx.clock).filter((i) => i.forDate === date);
        const isEvening = local.hour >= 18;
        const morning = s.briefings.find((b) => b.kind === 'morning' && b.forDate === date) ?? null;
        const evening = s.briefings.find((b) => b.kind === 'evening' && b.forDate === date) ?? null;
        const byDue = (a: Insight, b: Insight): number =>
          (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
        const lifeMap = new Map(s.lifeEvents.map((l) => [l.id, l] as const));
        const isPayment = (i: Insight): boolean =>
          i.entityType === 'life_event' && lifeMap.get(i.entityId)?.type === 'payment';
        return {
          greeting: greetingFor(local.hour, ctx.userName),
          dateLabel: fullDateLabel(date),
          briefing: isEvening && evening ? evening : morning,
          priorities: selectPriorities(active, ctx.clock, 5),
          meetings: active
            .filter((i) => i.kind === 'meeting' && i.entityType === 'calendar_event')
            .sort(byDue),
          deadlines: active
            .filter((i) => i.kind === 'deadline' || i.badge === 'deadline' || isPayment(i))
            .sort(byDue),
          lifeEvents: active
            .filter((i) => i.kind === 'life_event' || i.kind === 'security')
            .sort(byDue),
          pendingApprovals: s.approvals.filter((a) => a.status === 'pending').length,
          isEvening,
          lastAnalyzedAt: s.stats.lastAnalyzedAt,
          offline: false,
        };
      }),
    getFlow: (input) =>
      ctx.run(() => {
        const clean = validate(flowRequestSchema, input);
        const all = sortByPriority(allActiveInsights(ctx.store.state, ctx.clock));
        const tag = clean.filter;
        const filtered = tag === 'all' ? all : all.filter((i) => i.tags.includes(tag));
        const offset = Math.max(0, Number.parseInt(clean.cursor ?? '0', 10) || 0);
        const items = filtered.slice(offset, offset + clean.limit);
        const next = offset + clean.limit;
        return { items, nextCursor: next < filtered.length ? String(next) : null };
      }),
    getInsight: (id) => ctx.run(() => ({ ...getInsight(ctx.store.state, id) })),
    resolveInsight: (id, status, feedback) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const insight = getInsight(s, id);
          setInsightStatus(s, id, status, ctx.nowIso());
          applyEntityCompletion(ctx, s, insight, status);
          if (status === 'dismissed') {
            reinforcePreference(ctx, s, {
              kind: 'dismiss_pattern',
              subjectKey: `dismiss:${insight.kind}:${insight.source.person ?? insight.source.label}`,
              statement: `${insight.source.person ?? insight.source.label} kaynaklı ${insight.kind === 'life_event' ? 'kişisel gelişmeleri' : 'kartları'} daha az öne çıkarıyorum.`,
              weight: -0.4,
            });
          }
          if (feedback) {
            s.aiFeedback.push({
              id: ctx.nextId(),
              userId: ctx.userId,
              kind: feedback,
              entityType: 'insight',
              entityId: id,
              contactId: null,
              category: null,
              note: null,
              createdAt: ctx.nowIso(),
              updatedAt: ctx.nowIso(),
            });
            applyFeedbackLearning(ctx, s, { kind: feedback, entityType: 'insight', entityId: id });
          }
          return { ...insight };
        }),
      ),
    snoozeInsight: (id, until) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          getInsight(s, id);
          const insight = setInsightStatus(s, id, 'snoozed', ctx.nowIso(), until);
          return { ...(insight ?? getInsight(s, id)) };
        }),
      ),
    sendFeedback: (input) =>
      ctx.run(() => {
        const clean = validate(aiFeedbackSchema, input);
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          s.aiFeedback.push({
            id: ctx.nextId(),
            userId: ctx.userId,
            kind: clean.kind,
            entityType: clean.entityType,
            entityId: clean.entityId,
            contactId: clean.contactId ?? null,
            category: null,
            note: clean.note ?? null,
            createdAt: now,
            updatedAt: now,
          });
          applyFeedbackLearning(ctx, s, clean);
        });
      }),
    getMailIntelligence: () =>
      ctx.run(() => {
        const s = ctx.store.state;
        const threads = s.threads
          .filter((t) => !t.deletedAt && !t.userDismissed)
          .sort((a, b) => b.priorityScore - a.priorityScore);
        const categories = {
          important: { count: 0, threads: [] as EmailThread[] },
          waiting_for_user: { count: 0, threads: [] as EmailThread[] },
          waiting_for_other: { count: 0, threads: [] as EmailThread[] },
          has_deadline: { count: 0, threads: [] as EmailThread[] },
          information: { count: 0, threads: [] as EmailThread[] },
          low_priority: { count: 0, threads: [] as EmailThread[] },
        };
        for (const thread of threads) {
          for (const key of bucket(thread)) {
            categories[key].threads.push(thread);
            categories[key].count += 1;
          }
        }
        const needsAttention = threads.filter(
          (t) =>
            (t.importance === 'critical' || t.importance === 'high') &&
            t.analysis?.requiresUserAction &&
            !t.userMarkedDone,
        ).length;
        return { totalToday: s.stats.analyzedEmailsToday, needsAttention, categories };
      }),
    listWaitingForUser: () =>
      ctx.run(() => {
        const s = ctx.store.state;
        const threadMap = new Map(s.threads.map((t) => [t.id, t] as const));
        return todayInsights(s, ctx.clock)
          .filter(
            (i) =>
              i.kind === 'waiting_for_user' ||
              (i.kind === 'priority' &&
                i.entityType === 'email_thread' &&
                threadMap.get(i.entityId)?.analysis?.requiresUserAction),
          )
          .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
      }),
    listLifeEvents: () =>
      ctx.run(() =>
        ctx.store.state.lifeEvents
          .filter((l) => !l.deletedAt && l.status !== 'dismissed')
          .sort((a, b) => (a.eventAt ?? '').localeCompare(b.eventAt ?? ''))
          .map((l) => ({ ...l })),
      ),
    getLifeEvent: (id) => ctx.run(() => ({ ...getLifeEvent(ctx.store.state, id) })),
    setLifeEventStatus: (id, status) =>
      ctx.run(() =>
        ctx.store.mutate((s): LifeEvent => {
          const life = getLifeEvent(s, id);
          const now = ctx.nowIso();
          life.status = status;
          life.updatedAt = now;
          if (status === 'done') completeInsightsFor(s, 'life_event', id, now);
          if (status === 'dismissed') {
            for (const i of s.insights) {
              if (i.entityType === 'life_event' && i.entityId === id && i.status === 'active')
                setInsightStatus(s, i.id, 'dismissed', now);
            }
          }
          return { ...life };
        }),
      ),
  };
  return api;
}
