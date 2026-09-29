import type { AndroidNotificationItem, EmailAnalysis, Insight, LifeEvent } from '@da/domain';
import { androidNotificationIngestSchema } from '@da/validation';
import type { AndroidNotificationsApi } from '../../datasource';
import type { DemoContext } from '../context';
import { parseSchedule } from '../core/dates';
import { dueLabel } from '../format';
import type { DemoState } from '../state';
import { fold, truncate } from '../text';
import { validate } from '../validate';

const OTP_PATTERN = /\b\d{4,8}\b/;
const OTP_WORDS = ['kod', 'sifre', 'otp', 'dogrulama', 'onay kodu', 'tek kullanimlik'];

type Signal = { type: 'shipment' | 'payment' | 'meeting'; words: string[] };
const SIGNALS: Signal[] = [
  { type: 'shipment', words: ['kargo', 'teslim', 'siparis', 'dagitim'] },
  { type: 'payment', words: ['odeme', 'fatura', 'son odeme', 'borc'] },
  { type: 'meeting', words: ['toplanti', 'gorusme', 'meeting'] },
];

function looksLikeOtp(text: string): boolean {
  const folded = fold(text);
  return OTP_PATTERN.test(folded) && OTP_WORDS.some((w) => folded.includes(w));
}

function detect(text: string): Signal['type'] | null {
  const folded = fold(text);
  for (const s of SIGNALS) if (s.words.some((w) => folded.includes(w))) return s.type;
  return null;
}

function createSignalInsight(
  ctx: DemoContext,
  s: DemoState,
  item: AndroidNotificationItem,
  type: Signal['type'],
): { insight: Insight; analysis: EmailAnalysis } {
  const now = ctx.nowIso();
  const text = `${item.title} ${item.text}`.trim();
  const sched = parseSchedule(text, ctx.clock, { defaultTime: '18:00' });
  const source = {
    type: 'android_notification' as const,
    id: item.id,
    label: item.appName,
    timestamp: item.postedAt,
    excerpt: truncate(text, 200),
  };
  const category = type === 'shipment' ? 'shipment' : type === 'payment' ? 'payment' : 'meeting';
  const analysis: EmailAnalysis = {
    summary: truncate(text, 140),
    importance: type === 'meeting' ? 'high' : 'normal',
    category,
    reasonImportant:
      type === 'shipment'
        ? 'Kargo/teslimat bildirimi'
        : type === 'payment'
          ? 'Ödeme bildirimi'
          : 'Toplantı bildirimi',
    requiresUserAction: type !== 'shipment',
    deadline: sched.iso,
    deadlineText: sched.text,
    keyPoints: [item.title, ...(sched.text ? [sched.text] : [])].filter(Boolean),
    people: [],
    commitments: [],
    followUp: null,
    suggestedActions:
      type === 'shipment'
        ? [{ kind: 'track', label: 'Takip Et' }]
        : type === 'payment'
          ? [{ kind: 'remind', label: 'Hatırlat' }]
          : [{ kind: 'add_to_calendar', label: 'Takvime Ekle' }],
    lifeEvent: null,
    confidence: 0.75,
    producedBy: 'heuristic',
  };
  let entityType: Insight['entityType'] = 'suggestion';
  let entityId = item.id;
  if (type !== 'meeting') {
    const life: LifeEvent = {
      id: ctx.nextId(),
      userId: ctx.userId,
      type,
      title: truncate(item.title || text, 80),
      details:
        type === 'shipment'
          ? { merchant: item.appName }
          : { payee: item.appName, dueAt: sched.iso },
      eventAt: sched.iso ?? item.postedAt,
      status:
        sched.iso && ctx.clock.dateKey(sched.iso) === ctx.clock.today() ? 'today' : 'upcoming',
      source,
      confidence: 0.75,
      dedupeKey: `life:${type}:${item.fingerprint}`,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    s.lifeEvents.push(life);
    entityType = 'life_event';
    entityId = life.id;
  }
  const insight: Insight = {
    id: ctx.nextId(),
    userId: ctx.userId,
    kind: type === 'meeting' ? 'priority' : 'life_event',
    badge: type === 'meeting' ? 'meeting' : 'personal',
    title: truncate(item.title || text, 90),
    subtitle: item.title ? truncate(item.text, 120) : null,
    reason: `${item.appName} bildirimi · ${analysis.reasonImportant}`,
    importance: analysis.importance,
    priorityScore: type === 'meeting' ? 550 : 320,
    priorityReasons: [analysis.reasonImportant ?? 'Bildirim'],
    timeLabel: sched.iso ? dueLabel(ctx.clock, sched.iso) : ctx.clock.hhmm(item.postedAt),
    dueAt: sched.iso,
    status: 'active',
    snoozedUntil: null,
    source,
    actions: analysis.suggestedActions.map((a) => ({
      id: a.kind,
      label: a.label,
      kind: a.kind,
      primary: true,
    })),
    entityType,
    entityId,
    tags: type === 'meeting' ? ['important', 'calendar'] : ['personal'],
    forDate: ctx.clock.today(),
    confidence: 0.75,
    isLowConfidence: false,
    dedupeKey: `android:${type}:${item.fingerprint}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  s.insights.push(insight);
  return { insight, analysis };
}

export function createAndroidNotificationsApi(ctx: DemoContext): AndroidNotificationsApi {
  return {
    ingest: (items) =>
      ctx.run(() => {
        const clean = validate(androidNotificationIngestSchema, { items });
        return ctx.store.mutate((s) => {
          let accepted = 0;
          for (const raw of clean.items) {
            if (s.androidNotifications.some((n) => n.fingerprint === raw.fingerprint)) continue;
            const now = ctx.nowIso();
            const item: AndroidNotificationItem = {
              ...raw,
              id: ctx.nextId(),
              userId: ctx.userId,
              analysis: null,
              insightId: null,
              createdAt: now,
              updatedAt: now,
            };
            const text = `${raw.title} ${raw.text}`;
            const type = looksLikeOtp(text) ? null : detect(text);
            if (type) {
              const { insight, analysis } = createSignalInsight(ctx, s, item, type);
              item.analysis = analysis;
              item.insightId = insight.id;
            }
            s.androidNotifications.push(item);
            accepted += 1;
          }
          return { accepted };
        });
      }),
    listRecent: (input) =>
      ctx.run(() =>
        [...ctx.store.state.androidNotifications]
          .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
          .slice(0, input?.limit ?? 50)
          .map((n) => ({ ...n })),
      ),
    clearAll: () =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          s.androidNotifications = [];
        });
      }),
  };
}
