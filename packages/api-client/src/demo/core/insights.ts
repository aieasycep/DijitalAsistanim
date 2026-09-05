import type { Commitment, Insight, InsightKind, ISODate, ISODateTime, UUID } from '@da/domain';
import type { DemoClock } from '../clock';
import type { DemoContext } from '../context';
import { dueLabel } from '../format';
import type { DemoState } from '../state';

/** Diversification order for the Today "ÖNCELİKLERİN" list (one card per kind first). */
const KIND_ORDER: InsightKind[] = [
  'priority',
  'meeting',
  'deadline',
  'follow_up',
  'life_event',
  'waiting_for_user',
  'security',
  'commitment',
  'conflict',
  'suggestion',
];

export function isActiveInsight(insight: Insight, nowIso: ISODateTime): boolean {
  if (insight.deletedAt) return false;
  if (insight.status === 'active') return true;
  if (insight.status === 'snoozed') return !insight.snoozedUntil || insight.snoozedUntil <= nowIso;
  return false;
}

/** Active insights that belong to today or earlier (carried items are bucketed by forDate). */
export function todayInsights(state: DemoState, clock: DemoClock): Insight[] {
  const today = clock.today();
  const now = clock.nowIso();
  return state.insights.filter((i) => isActiveInsight(i, now) && i.forDate <= today);
}

export function allActiveInsights(state: DemoState, clock: DemoClock): Insight[] {
  const now = clock.nowIso();
  return state.insights.filter((i) => isActiveInsight(i, now));
}

function dueToday(insight: Insight, clock: DemoClock): boolean {
  return Boolean(insight.dueAt && clock.dateKey(insight.dueAt) === clock.today());
}

export function sortByPriority(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const da = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
    const db = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/** Up to `limit` cards, diversified by kind (best of each kind in KIND_ORDER, then fill by score). */
export function selectPriorities(insights: Insight[], clock: DemoClock, limit = 5): Insight[] {
  const picked: Insight[] = [];
  const used = new Set<UUID>();
  for (const kind of KIND_ORDER) {
    if (picked.length >= limit) break;
    const candidates = insights.filter((i) => i.kind === kind && !used.has(i.id));
    if (!candidates.length) continue;
    const best = [...candidates].sort((a, b) => {
      const ta = dueToday(a, clock) ? 1 : 0;
      const tb = dueToday(b, clock) ? 1 : 0;
      if (tb !== ta) return tb - ta;
      return b.priorityScore - a.priorityScore;
    })[0];
    if (best) {
      picked.push(best);
      used.add(best.id);
    }
  }
  for (const i of sortByPriority(insights)) {
    if (picked.length >= limit) break;
    if (!used.has(i.id)) {
      picked.push(i);
      used.add(i.id);
    }
  }
  return picked;
}

export function setInsightStatus(
  state: DemoState,
  id: UUID,
  status: Insight['status'],
  nowIso: ISODateTime,
  snoozedUntil?: ISODateTime | null,
): Insight | undefined {
  const insight = state.insights.find((i) => i.id === id);
  if (!insight) return undefined;
  insight.status = status;
  insight.snoozedUntil = status === 'snoozed' ? (snoozedUntil ?? null) : null;
  insight.updatedAt = nowIso;
  return insight;
}

export function completeInsightsFor(
  state: DemoState,
  entityType: Insight['entityType'],
  entityId: UUID,
  nowIso: ISODateTime,
): void {
  for (const insight of state.insights) {
    if (
      insight.entityType === entityType &&
      insight.entityId === entityId &&
      insight.status === 'active'
    ) {
      insight.status = 'completed';
      insight.updatedAt = nowIso;
    }
  }
}

export function createCommitmentInsight(
  ctx: DemoContext,
  state: DemoState,
  commitment: Commitment,
  forDate: ISODate,
): Insight {
  const now = ctx.nowIso();
  const insight: Insight = {
    id: ctx.nextId(),
    userId: ctx.userId,
    kind: 'commitment',
    badge: 'commitment',
    title: commitment.text,
    subtitle: commitment.quote ? `Toplantı sonrası “${commitment.quote}” dedin.` : null,
    reason:
      commitment.direction === 'user_owes'
        ? 'Verdiğin sözü kaynağıyla birlikte yakaladım.'
        : 'Karşı tarafın verdiği söz.',
    importance: 'normal',
    priorityScore: 600,
    priorityReasons: [
      commitment.direction === 'user_owes' ? 'Senin taahhüdün' : 'Karşı tarafın taahhüdü',
    ],
    timeLabel: commitment.dueAt
      ? dueLabel(ctx.clock, commitment.dueAt)
      : (commitment.dueText ?? null),
    dueAt: commitment.dueAt ?? null,
    status: 'active',
    snoozedUntil: null,
    source: { ...commitment.source },
    actions: [
      { id: 'plan', label: 'Planla', kind: 'plan', primary: true },
      { id: 'postpone', label: 'Ertele', kind: 'postpone', primary: false },
    ],
    entityType: 'commitment',
    entityId: commitment.id,
    tags: ['follow_up'],
    forDate,
    confidence: commitment.confidence,
    isLowConfidence: commitment.confidence < 0.7,
    dedupeKey: `commitment:commitment:${commitment.id}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  state.insights.push(insight);
  return insight;
}

/** Re-labels the time of a calendar insight after its event moved. */
export function relabelEventInsights(
  state: DemoState,
  clock: DemoClock,
  eventId: UUID,
  startAt: ISODateTime,
  nowIso: ISODateTime,
): void {
  const hhmm = clock.hhmm(startAt);
  for (const insight of state.insights) {
    if (insight.entityType !== 'calendar_event' || insight.entityId !== eventId) continue;
    insight.dueAt = startAt;
    insight.timeLabel = clock.dateKey(startAt) === clock.today() ? hhmm : dueLabel(clock, startAt);
    insight.title = insight.title.replace(/^\d{2}:\d{2}/, hhmm);
    insight.priorityReasons = insight.priorityReasons.map((r) => r.replace(/\d{2}:\d{2}/, hhmm));
    insight.updatedAt = nowIso;
  }
}
