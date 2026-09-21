import type {
  Briefing,
  BriefingAudioResponse,
  BriefingItem,
  BriefingKind,
  ISODate,
  WeeklyMetrics,
} from '@da/domain';
import { briefingRequestSchema } from '@da/validation';
import type { BriefingsApi } from '../../datasource';
import { daysBetweenKeys } from '../clock';
import type { DemoContext } from '../context';
import { eventsOnDay } from '../core/calendar';
import { isActiveInsight } from '../core/insights';
import { eventSource, threadSource } from '../core/lookup';
import {
  dayMonthLong,
  dueLabel,
  durationLabel,
  firstName,
  formatMinutes,
  rangeLabel,
  weekdayLong,
} from '../format';
import {
  BRIEFING_EVENING,
  BRIEFING_MIDDAY,
  BRIEFING_WEEKLY,
  EVENT_MEHMET_MEETING,
  FOLLOWUP_MEHMET_TEKLIF,
  INSIGHT_MEHMET_FOLLOWUP,
  INSIGHT_MEHMET_RESCHEDULE,
  LIFE_TRENDYOL,
  seedId,
  THREAD_AHMET_REVIZE,
  THREAD_GIRISIM_BASVURU,
  THREAD_MEHMET_TOPLANTI,
} from '../ids';
import type { DemoState } from '../state';
import { notFound, validate } from '../validate';

const WEEKLY_METRICS = {
  analyzedEmails: 684,
  importantItems: 32,
  followUps: 8,
  followUpsAnswered: 6,
  meetings: 21,
  meetingsWithPrep: 14,
  deadlines: 4,
  deadlinesMissed: 0,
  estimatedTimeSavedMinutes: 168,
};

type ItemSeed = Omit<BriefingItem, 'id' | 'briefingId' | 'position'>;

function withIds(prefix: string, briefingId: string, items: ItemSeed[]): BriefingItem[] {
  return items.map((item, index) => ({
    ...item,
    id: seedId(`${prefix}${(index + 1).toString(16).padStart(2, '0')}`),
    briefingId,
    position: index,
  }));
}

function baseBriefing(
  ctx: DemoContext,
  kind: BriefingKind,
  id: string,
  forDate: ISODate,
  generatedAt: string,
): Pick<
  Briefing,
  | 'id'
  | 'userId'
  | 'kind'
  | 'forDate'
  | 'generatedAt'
  | 'openedAt'
  | 'closedAt'
  | 'weekly'
  | 'outlook'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'audio'
> {
  return {
    id,
    userId: ctx.userId,
    kind,
    forDate,
    generatedAt,
    openedAt: null,
    closedAt: null,
    weekly: null,
    outlook: null,
    version: 1,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    audio: null,
  };
}

function generatedAtFor(ctx: DemoContext, hhmm: string): string {
  const scheduled = ctx.clock.at(ctx.clock.today(), hhmm);
  return scheduled.getTime() <= ctx.clock.now().getTime() ? scheduled.toISOString() : ctx.nowIso();
}

function buildMidday(ctx: DemoContext, s: DemoState): Briefing {
  const today = ctx.clock.today();
  const now = ctx.nowIso();
  const changes: ItemSeed[] = [];
  const reschedule = s.insights.find((i) => i.id === INSIGHT_MEHMET_RESCHEDULE);
  const rescheduleThread = s.threads.find((t) => t.id === THREAD_MEHMET_TOPLANTI);
  if (
    reschedule &&
    isActiveInsight(reschedule, now) &&
    rescheduleThread &&
    !rescheduleThread.userMarkedDone
  ) {
    changes.push({
      section: 'changes',
      icon: 'event_repeat',
      title: "Mehmet toplantıyı 16:00'ya almak istiyor.",
      meta: 'Gmail · Mehmet Yılmaz · 12:12 · 16:00 dolu, 16:30 boş',
      source: threadSource(rescheduleThread),
      insightId: reschedule.id,
      entityType: 'email_thread',
      entityId: rescheduleThread.id,
      chapterIndex: 0,
      status: 'open',
    });
  }
  const followUp = s.followUps.find((f) => f.id === FOLLOWUP_MEHMET_TEKLIF);
  const followUpInsight = s.insights.find((i) => i.id === INSIGHT_MEHMET_FOLLOWUP);
  if (followUp && (followUp.status === 'nudge_due' || followUp.status === 'watching')) {
    const days = daysBetweenKeys(ctx.clock.dateKey(followUp.sentAt), today);
    changes.push({
      section: 'changes',
      icon: 'schedule_send',
      title: `Mehmet'e gönderdiğin teklife hâlâ yanıt yok.`,
      meta: `${days} gündür · Takip mesajı hazır`,
      source: { ...followUp.source },
      insightId: followUpInsight?.id ?? null,
      entityType: 'follow_up',
      entityId: followUp.id,
      chapterIndex: 0,
      status: 'open',
    });
  }
  const remaining = eventsOnDay(s, ctx.clock, today).filter(
    (e) => Date.parse(e.endAt) > ctx.clock.now().getTime(),
  );
  const rest: ItemSeed[] = remaining.map((e) => ({
    section: 'rest_of_day',
    icon: e.meetingUrl ? 'videocam' : 'event',
    title: e.title,
    meta: `${ctx.clock.hhmm(e.startAt)} · ${durationLabel(e.startAt, e.endAt)}${e.location ? ` · ${e.location}` : ''}`,
    source: eventSource(e),
    insightId: null,
    entityType: 'calendar_event',
    entityId: e.id,
    chapterIndex: 1,
    status: 'open',
  }));
  const hasChanges = changes.length > 0;
  const pending = s.approvals.filter((a) => a.status === 'pending').length;
  const generatedAt = generatedAtFor(ctx, s.preferences.briefing.middayTime);
  return {
    ...baseBriefing(ctx, 'midday', BRIEFING_MIDDAY, today, generatedAt),
    headline: hasChanges
      ? `Sabahından beri ${changes.length} önemli gelişme oldu.`
      : 'Her şey planlandığı gibi.',
    highlightNumber: changes.length,
    subline: `${remaining.length} etkinlik kaldı · ${pending} onay bekliyor`,
    mood: hasChanges ? 'Öğleden sonra bir karar seni bekliyor.' : 'Sabah planın hâlâ geçerli.',
    narrative: hasChanges
      ? `${changes.map((c) => c.title).join(' ')} ${remaining.length ? `Günün geri kalanında ${remaining.length} etkinliğin var; ilki ${ctx.clock.hhmm(remaining[0]?.startAt ?? now)} ${remaining[0]?.title ?? ''}.` : 'Günün geri kalanında etkinliğin yok.'}`
      : `Sabah brifingindeki plan değişmedi. ${remaining.length ? `Günün geri kalanında ${remaining.length} etkinliğin var.` : 'Günün geri kalanı boş.'}`,
    counts: {
      importantEmails: changes.filter((c) => c.entityType === 'email_thread').length,
      events: remaining.length,
      followUps: changes.filter((c) => c.entityType === 'follow_up').length,
      deadlines: 0,
      total: changes.length,
      analyzedEmails: s.stats.analyzedEmailsToday,
      analyzedCalendars: s.accounts.filter((a) => !a.deletedAt && a.kinds.includes('calendar'))
        .length,
      analyzedDays: 1,
    },
    items: withIds('b2', BRIEFING_MIDDAY, [...changes, ...rest]),
    estimatedReadSec: 40,
    hasChanges,
  };
}

function buildEvening(ctx: DemoContext, s: DemoState): Briefing {
  const today = ctx.clock.today();
  const tomorrow = ctx.clock.addDays(today, 1);
  const now = ctx.nowIso();
  const ahmet = s.threads.find((t) => t.id === THREAD_AHMET_REVIZE);
  const girisim = s.threads.find((t) => t.id === THREAD_GIRISIM_BASVURU);
  const meeting = s.events.find((e) => e.id === EVENT_MEHMET_MEETING);
  const kargo = s.lifeEvents.find((l) => l.id === LIFE_TRENDYOL);
  const completed: ItemSeed[] = [
    ...(ahmet
      ? [
          {
            section: 'completed' as const,
            icon: 'send',
            title: "Ahmet'e revize teklif gönderildi",
            meta: '15:48',
            source: threadSource(ahmet),
            insightId: null,
            entityType: 'email_thread' as const,
            entityId: ahmet.id,
            chapterIndex: 0,
            status: 'done' as const,
          },
        ]
      : []),
    ...(meeting
      ? [
          {
            section: 'completed' as const,
            icon: 'event',
            title: meeting.title,
            meta: ctx.clock.hhmm(meeting.startAt),
            source: eventSource(meeting),
            insightId: null,
            entityType: 'calendar_event' as const,
            entityId: meeting.id,
            chapterIndex: 0,
            status: 'done' as const,
          },
        ]
      : []),
    ...(girisim
      ? [
          {
            section: 'completed' as const,
            icon: 'flag',
            title: 'Girişim programı başvurusu',
            meta: '16:20',
            source: threadSource(girisim),
            insightId: null,
            entityType: 'email_thread' as const,
            entityId: girisim.id,
            chapterIndex: 0,
            status: 'done' as const,
          },
        ]
      : []),
    ...(kargo
      ? [
          {
            section: 'completed' as const,
            icon: 'package_2',
            title: 'Kargo teslim alındı',
            meta: '16:05',
            source: { ...kargo.source },
            insightId: null,
            entityType: 'life_event' as const,
            entityId: kargo.id,
            chapterIndex: 0,
            status: 'done' as const,
          },
        ]
      : []),
  ];
  const coveredEntities = new Set(completed.map((c) => c.entityId));
  for (const insight of s.insights) {
    if (
      insight.status === 'completed' &&
      ctx.clock.dateKey(insight.updatedAt) === today &&
      !coveredEntities.has(insight.entityId)
    ) {
      coveredEntities.add(insight.entityId);
      completed.push({
        section: 'completed',
        icon: 'check_circle',
        title: insight.title,
        meta: ctx.clock.hhmm(insight.updatedAt),
        source: { ...insight.source },
        insightId: insight.id,
        entityType: insight.entityType,
        entityId: insight.entityId,
        chapterIndex: 0,
        status: 'done',
      });
    }
  }
  const lifeMap = new Map(s.lifeEvents.map((l) => [l.id, l] as const));
  const carriedInsights = s.insights.filter((i) => {
    if (!isActiveInsight(i, now) || i.forDate > today || coveredEntities.has(i.entityId))
      return false;
    if (i.kind === 'waiting_for_user' || i.kind === 'commitment' || i.kind === 'priority')
      return true;
    if (i.kind === 'deadline') return !i.dueAt || ctx.clock.dateKey(i.dueAt) > today;
    if (i.kind === 'life_event') return lifeMap.get(i.entityId)?.type === 'payment';
    return false;
  });
  const carried: ItemSeed[] = carriedInsights.map((i) => {
    const commitment =
      i.entityType === 'email_thread'
        ? s.commitments.find((c) => c.source.id === i.entityId && c.status === 'open')
        : undefined;
    return {
      section: 'carried_over',
      icon:
        i.kind === 'commitment' ? 'handshake' : i.kind === 'life_event' ? 'receipt_long' : 'mail',
      title: commitment?.text ?? i.title,
      meta: i.dueAt ? dueLabel(ctx.clock, i.dueAt) : (i.timeLabel ?? null),
      source: { ...i.source },
      insightId: i.id,
      entityType: i.entityType,
      entityId: i.entityId,
      chapterIndex: 1,
      status: 'open',
    };
  });
  const followUps: ItemSeed[] = s.followUps
    .filter((f) => f.status === 'nudge_due' || f.status === 'watching')
    .map((f) => {
      const day = daysBetweenKeys(ctx.clock.dateKey(f.sentAt), today) + 1;
      const who = f.contactId
        ? firstName(f.counterpartName)
        : f.counterpartName.replace(/ Ekibi$/, '');
      return {
        section: 'follow_ups',
        icon: 'schedule_send',
        title: `${who} · ${f.topic}${/yorum|bildirim/i.test(f.topic) ? '' : ' geri bildirimi'}`,
        meta: `${day}. gün`,
        source: { ...f.source },
        insightId:
          s.insights.find((i) => i.entityType === 'follow_up' && i.entityId === f.id)?.id ?? null,
        entityType: 'follow_up',
        entityId: f.id,
        chapterIndex: 2,
        status: 'open',
      };
    });
  const firstTomorrow = eventsOnDay(s, ctx.clock, tomorrow)[0];
  const first: ItemSeed[] = firstTomorrow
    ? [
        {
          section: 'first_event_tomorrow',
          icon: 'event',
          title: firstTomorrow.title,
          meta: `${ctx.clock.hhmm(firstTomorrow.startAt)} · ${durationLabel(firstTomorrow.startAt, firstTomorrow.endAt)}${firstTomorrow.location ? ` · ${firstTomorrow.location}` : ''}${firstTomorrow.location && !/online/i.test(firstTomorrow.location) ? ` · ${ctx.clock.hhmm(ctx.clock.addMinutes(firstTomorrow.startAt, -70))}'de çıkman yeterli` : ''}`,
          source: eventSource(firstTomorrow),
          insightId: null,
          entityType: 'calendar_event',
          entityId: firstTomorrow.id,
          chapterIndex: 3,
          status: 'open',
        },
      ]
    : [];
  const generatedAt = generatedAtFor(ctx, s.preferences.briefing.eveningTime);
  const firstLabel = firstTomorrow
    ? `Yarın ${ctx.clock.hhmm(firstTomorrow.startAt)} ${firstTomorrow.title}`
    : 'Yarın sabah takvimin boş';
  return {
    ...baseBriefing(ctx, 'evening', BRIEFING_EVENING, today, generatedAt),
    headline: `Bugünden yarına ${carried.length} konu kaldı.`,
    highlightNumber: carried.length,
    subline: `${completed.length} tamamlandı · ${followUps.length} takip · ${firstLabel}`,
    mood: completed.length >= 3 ? 'Verimli bir gündü.' : 'Sakin bir gündü.',
    narrative:
      `Bugün ${completed.length} konuyu kapattın: ${completed.map((c) => c.title.replace(/\.$/, '').toLowerCase()).join(', ')}. ${carried.length ? `Yarına ${carried.length} konu kalıyor; ilki ${carried[0]?.title.replace(/\.$/, '')}${carried[0]?.meta ? ` (${carried[0].meta})` : ''}.` : 'Yarına açık konu kalmadı.'} ${followUps.length ? `${followUps.length} takip hâlâ yanıt bekliyor.` : ''} ${firstTomorrow ? `${firstLabel} ile başlıyorsun${firstTomorrow.location && !/online/i.test(firstTomorrow.location) ? `; ${ctx.clock.hhmm(ctx.clock.addMinutes(firstTomorrow.startAt, -70))}'de çıkman yeterli.` : '.'}` : ''}`
        .replace(/\s+/g, ' ')
        .trim(),
    counts: {
      importantEmails: carried.filter((c) => c.entityType === 'email_thread').length,
      events: firstTomorrow ? 1 : 0,
      followUps: followUps.length,
      deadlines: carried.filter((c) => c.icon === 'receipt_long').length,
      total: carried.length,
      analyzedEmails: s.stats.analyzedEmailsToday,
      analyzedCalendars: s.accounts.filter((a) => !a.deletedAt && a.kinds.includes('calendar'))
        .length,
      analyzedDays: 1,
    },
    items: withIds('b3', BRIEFING_EVENING, [...completed, ...carried, ...followUps, ...first]),
    estimatedReadSec: 55,
    hasChanges: true,
  };
}

function buildWeekly(ctx: DemoContext, s: DemoState): Briefing {
  const today = ctx.clock.today();
  const weekStart = ctx.clock.weekStart(today);
  const weekEnd = ctx.clock.addDays(weekStart, 6);
  const wednesday = ctx.clock.addDays(weekStart, 2);
  const nextTuesday = ctx.clock.addDays(weekStart, 8);
  const nextThursday = ctx.clock.addDays(weekStart, 10);
  const weekly: WeeklyMetrics = {
    weekStart,
    weekEnd,
    ...WEEKLY_METRICS,
    timeSavedBreakdown: {
      unreadMails: WEEKLY_METRICS.analyzedEmails - WEEKLY_METRICS.importantItems,
      prepNotes: WEEKLY_METRICS.meetingsWithPrep,
      followUpDrafts: WEEKLY_METRICS.followUpsAnswered,
    },
    busiestDay: { date: wednesday, meetings: 6, note: `${weekdayLong(wednesday)} 6 toplantı` },
    topPeople: [
      { name: 'Mehmet Yılmaz', count: 9 },
      { name: 'Ahmet Yılmaz', count: 6 },
      { name: 'Selin Kaya', count: 4 },
    ],
    nextWeek: `${weekdayLong(nextTuesday)} 3 son tarih, ${weekdayLong(nextThursday)} öğleden sonra boş`,
  };
  const saved = formatMinutes(WEEKLY_METRICS.estimatedTimeSavedMinutes);
  const items: ItemSeed[] = weekly.topPeople.map((p) => ({
    section: 'priorities',
    icon: 'person',
    title: p.name,
    meta: `${p.count} etkileşim`,
    source: null,
    insightId: null,
    entityType: null,
    entityId: s.contacts.find((c) => c.displayName === p.name)?.id ?? null,
    chapterIndex: 2,
    status: null,
  }));
  const generatedAt = generatedAtFor(ctx, s.preferences.briefing.weeklyTime);
  return {
    ...baseBriefing(ctx, 'weekly', BRIEFING_WEEKLY, weekStart, generatedAt),
    headline: 'Haftan nasıl geçti?',
    highlightNumber: WEEKLY_METRICS.importantItems,
    subline: `${rangeLabel(weekStart, weekEnd)} · ${WEEKLY_METRICS.analyzedEmails} mail · ${WEEKLY_METRICS.meetings} toplantı`,
    mood: `Bu hafta ${WEEKLY_METRICS.analyzedEmails} mailden ${WEEKLY_METRICS.importantItems}'sini öne çıkardım; ${saved} kazandın.`,
    narrative: `Bu hafta ${WEEKLY_METRICS.analyzedEmails} mail analiz edildi ve ${WEEKLY_METRICS.importantItems} önemli konu öne çıkarıldı. ${WEEKLY_METRICS.meetings} toplantının ${WEEKLY_METRICS.meetingsWithPrep}'üne hazırlık notu hazırlandı; en yoğun günün ${weekdayLong(wednesday)}dı, ${dayMonthLong(wednesday)}'de 6 toplantı vardı. ${WEEKLY_METRICS.followUps} takipten ${WEEKLY_METRICS.followUpsAnswered}'sı cevaplandı, ${WEEKLY_METRICS.deadlines} son tarihin hiçbiri kaçmadı. Okunmayan mailler, hazırlık notları ve takip taslakları üzerinden tahminen ${saved} kazandın.`,
    outlook: `Gelecek hafta: ${weekly.nextWeek}. ${weekdayLong(nextThursday)} öğleden sonrayı teklif hazırlığına ayırabilirsin.`,
    counts: {
      importantEmails: WEEKLY_METRICS.importantItems,
      events: WEEKLY_METRICS.meetings,
      followUps: WEEKLY_METRICS.followUps,
      deadlines: WEEKLY_METRICS.deadlines,
      total: WEEKLY_METRICS.importantItems,
      analyzedEmails: WEEKLY_METRICS.analyzedEmails,
      analyzedCalendars: s.accounts.filter((a) => !a.deletedAt && a.kinds.includes('calendar'))
        .length,
      analyzedDays: 7,
    },
    items: withIds('b4', BRIEFING_WEEKLY, items),
    weekly,
    estimatedReadSec: 70,
    hasChanges: true,
  };
}

const SECTION_TITLES: Record<BriefingItem['section'], string> = {
  priorities: 'Bugünün öncelikleri',
  schedule: 'Programın',
  waiting_for_you: 'Senden cevap bekleyenler',
  waiting_for_others: 'Senin cevap beklediklerin',
  deadlines: 'Son tarihler',
  personal: 'Kişisel gelişmeler',
  completed: 'Tamamlananlar',
  carried_over: 'Yarına kalanlar',
  follow_ups: 'Takip edilecekler',
  first_event_tomorrow: 'Yarının ilk etkinliği',
  changes: 'Gelişmeler',
  rest_of_day: 'Günün geri kalanı',
};

function synthesizeAudio(ctx: DemoContext, briefing: Briefing): BriefingAudioResponse {
  const sections = new Map<BriefingItem['section'], BriefingItem[]>();
  for (const item of briefing.items)
    sections.set(item.section, [...(sections.get(item.section) ?? []), item]);
  const intro = `${briefing.kind === 'evening' ? 'İyi akşamlar' : briefing.kind === 'weekly' ? 'Merhaba' : 'Merhaba'} ${ctx.userName}. ${briefing.headline} ${briefing.narrative}`;
  const chapters = [
    {
      index: 0,
      title: 'Genel bakış',
      startSec: 0,
      durationSec: Math.max(8, Math.round(intro.length / 14)),
      text: intro,
    },
  ];
  let cursor = chapters[0]?.durationSec ?? 0;
  for (const [section, items] of sections) {
    const text = `${SECTION_TITLES[section]}: ${items.map((i) => `${i.title}${i.meta ? `, ${i.meta}` : ''}`).join('. ')}.`;
    const durationSec = Math.max(6, Math.round(text.length / 14));
    chapters.push({
      index: chapters.length,
      title: SECTION_TITLES[section],
      startSec: cursor,
      durationSec,
      text,
    });
    cursor += durationSec;
  }
  if (briefing.outlook) {
    chapters.push({
      index: chapters.length,
      title: 'Gelecek hafta',
      startSec: cursor,
      durationSec: Math.max(6, Math.round(briefing.outlook.length / 14)),
      text: briefing.outlook,
    });
  }
  return {
    provider: 'device_tts',
    url: null,
    script: chapters.map((c) => c.text).join(' '),
    chapters,
  };
}

export function createBriefingsApi(ctx: DemoContext): BriefingsApi {
  const materialize = (kind: Exclude<BriefingKind, 'morning'>, regenerate: boolean): Briefing =>
    ctx.store.mutate((s) => {
      const fresh =
        kind === 'midday'
          ? buildMidday(ctx, s)
          : kind === 'evening'
            ? buildEvening(ctx, s)
            : buildWeekly(ctx, s);
      const index = s.briefings.findIndex((b) => b.kind === kind && b.forDate === fresh.forDate);
      const cached = index >= 0 ? s.briefings[index] : undefined;
      const merged: Briefing = {
        ...fresh,
        version: cached ? (regenerate ? cached.version + 1 : cached.version) : 1,
        generatedAt: regenerate || !cached ? fresh.generatedAt : cached.generatedAt,
        openedAt: cached?.openedAt ?? null,
        closedAt: cached?.closedAt ?? null,
        createdAt: cached?.createdAt ?? fresh.createdAt,
        updatedAt: regenerate ? ctx.nowIso() : (cached?.updatedAt ?? fresh.updatedAt),
      };
      if (index >= 0) s.briefings[index] = merged;
      else s.briefings.push(merged);
      return { ...merged };
    });

  const morning = (date: ISODate, regenerate: boolean): Briefing | null =>
    ctx.store.mutate((s) => {
      const b = s.briefings.find((x) => x.kind === 'morning' && x.forDate === date);
      if (!b) return null;
      if (regenerate) {
        b.version += 1;
        b.generatedAt = ctx.nowIso();
        b.updatedAt = b.generatedAt;
      }
      return { ...b };
    });

  return {
    getBriefing: (input) =>
      ctx.run(() => {
        const clean = validate(briefingRequestSchema, input);
        const today = ctx.clock.today();
        const date = clean.date ?? today;
        if (clean.kind === 'morning') return morning(date, Boolean(clean.regenerate));
        if (clean.kind === 'weekly') {
          if (ctx.clock.weekStart(date) !== ctx.clock.weekStart(today))
            return (
              ctx.store.state.briefings.find(
                (b) => b.kind === 'weekly' && b.forDate === ctx.clock.weekStart(date),
              ) ?? null
            );
          return materialize('weekly', Boolean(clean.regenerate));
        }
        if (date !== today)
          return (
            ctx.store.state.briefings.find((b) => b.kind === clean.kind && b.forDate === date) ??
            null
          );
        return materialize(clean.kind, Boolean(clean.regenerate));
      }),
    getBriefingById: (id) =>
      ctx.run(() => {
        const b = ctx.store.state.briefings.find((x) => x.id === id);
        if (!b) throw notFound('Brifing', id);
        if (
          b.kind !== 'morning' &&
          b.forDate ===
            (b.kind === 'weekly' ? ctx.clock.weekStart(ctx.clock.today()) : ctx.clock.today())
        )
          return materialize(b.kind, false);
        return { ...b };
      }),
    markOpened: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const b = s.briefings.find((x) => x.id === id);
          if (!b) throw notFound('Brifing', id);
          b.openedAt = b.openedAt ?? ctx.nowIso();
          b.updatedAt = ctx.nowIso();
        });
      }),
    closeDay: (input) =>
      ctx.run(() => {
        const tomorrow = ctx.clock.addDays(ctx.clock.today(), 1);
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          const b =
            s.briefings.find((x) => x.id === input.briefingId) ??
            (input.briefingId === BRIEFING_EVENING ? buildEvening(ctx, s) : undefined);
          if (!b) throw notFound('Brifing', input.briefingId);
          if (!s.briefings.some((x) => x.id === b.id)) s.briefings.push(b);
          b.closedAt = now;
          b.updatedAt = now;
          s.eveningMutedFor = ctx.clock.today();
          for (const id of input.carryOverInsightIds) {
            const insight = s.insights.find((i) => i.id === id);
            if (insight && isActiveInsight(insight, now)) {
              insight.forDate = tomorrow;
              insight.timeLabel = insight.dueAt
                ? dueLabel(ctx.clock, insight.dueAt)
                : insight.timeLabel;
              insight.updatedAt = now;
            }
          }
        });
        const closed = ctx.store.state.briefings.find((x) => x.id === input.briefingId);
        return closed && closed.kind !== 'morning'
          ? materialize(closed.kind, false)
          : { ...(closed as Briefing) };
      }),
    getAudio: (briefingId) =>
      ctx.run((): BriefingAudioResponse => {
        const b = ctx.store.state.briefings.find((x) => x.id === briefingId);
        if (!b) throw notFound('Brifing', briefingId);
        if (b.audio)
          return {
            provider: b.audio.provider,
            url: b.audio.url ?? null,
            script: b.audio.script,
            chapters: b.audio.chapters,
          };
        return synthesizeAudio(ctx, b);
      }),
    getWeekly: (input) =>
      ctx.run(() => {
        const start = input?.weekStart
          ? ctx.clock.weekStart(input.weekStart)
          : ctx.clock.weekStart(ctx.clock.today());
        if (start !== ctx.clock.weekStart(ctx.clock.today()))
          return (
            ctx.store.state.briefings.find((b) => b.kind === 'weekly' && b.forDate === start) ??
            null
          );
        return materialize('weekly', false);
      }),
  };
}
