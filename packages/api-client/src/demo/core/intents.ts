/**
 * Keyword-based intent resolution for the demo assistant. Answers are grounded in demo state (every claim
 * carries a SourceRef); write intents only create approvals — nothing is executed here.
 */
import type {
  ApprovalAction,
  AssistantMessage,
  AssistantRichCard,
  CalendarEvent,
  Contact,
  EmailThread,
  Insight,
  LifeEvent,
  SourceRef,
  UUID,
} from '@da/domain';
import type { DemoClock } from '../clock';
import type { DemoContext } from '../context';
import { createApprovalCore } from './approvals';
import { computeFreeBlocks, eventsOnDay } from './calendar';
import { parseSchedule, stripPhrases } from './dates';
import { followUpDraftFor, replyDraftsFor } from './drafts';
import { selectPriorities, todayInsights } from './insights';
import {
  eventSource,
  eventsForContact,
  findContactByName,
  isUserEmail,
  lifeEventSource,
  threadSource,
  threadsForContact,
} from './lookup';
import {
  dative,
  dayMonthLong,
  dueLabel,
  firstName,
  formatAmount,
  relativeDayLabel,
} from '../format';
import { daysBetweenKeys } from '../clock';
import type { DemoState } from '../state';
import { capitalizeTr, fold, includesAny, truncate } from '../text';

export interface IntentInput {
  message: string;
  inputMode: 'text' | 'voice';
  contactId?: UUID | null;
  userMessageId: UUID;
  lastAssistant?: AssistantMessage | null;
}

export interface IntentResult {
  content: string;
  sources: SourceRef[];
  cards: AssistantRichCard[];
  approvals: ApprovalAction[];
  suggestedFollowUps: string[];
  uncertain: boolean;
}

function emailCard(clock: DemoClock, t: EmailThread, s: DemoState): AssistantRichCard {
  const other = t.participants.find((p) => !isUserEmail(s, p.email));
  return {
    kind: 'email',
    entityId: t.id,
    title: t.subject,
    subtitle:
      `${other?.name ?? other?.email ?? 'Mail'} · ${relativeDayLabel(clock, t.lastMessageAt)} ${clock.hhmm(t.lastMessageAt)}`.trim(),
    source: threadSource(t),
  };
}
function eventCard(clock: DemoClock, e: CalendarEvent): AssistantRichCard {
  return {
    kind: 'event',
    entityId: e.id,
    title: e.title,
    subtitle:
      `${relativeDayLabel(clock, e.startAt)} ${clock.hhmm(e.startAt)} · ${e.location ?? (e.meetingUrl ? 'Online' : '')}`.trim(),
    source: eventSource(e),
  };
}
function lifeCard(clock: DemoClock, l: LifeEvent): AssistantRichCard {
  return {
    kind: 'life_event',
    entityId: l.id,
    title: l.title,
    subtitle: l.eventAt ? dueLabel(clock, l.eventAt) : null,
    source: lifeEventSource(l),
  };
}
function approvalCard(a: ApprovalAction): AssistantRichCard {
  return {
    kind: 'approval',
    entityId: a.id,
    title: a.what,
    subtitle: a.why,
    source: a.source ?? null,
  };
}
function personCard(c: Contact): AssistantRichCard {
  return {
    kind: 'person',
    entityId: c.id,
    title: c.displayName,
    subtitle: [c.title, c.company].filter(Boolean).join(' · ') || null,
    source: null,
  };
}
function insightCard(ctx: DemoContext, s: DemoState, i: Insight): AssistantRichCard | null {
  switch (i.entityType) {
    case 'email_thread': {
      const t = s.threads.find((x) => x.id === i.entityId);
      return t ? emailCard(ctx.clock, t, s) : null;
    }
    case 'calendar_event': {
      const e = s.events.find((x) => x.id === i.entityId);
      return e ? eventCard(ctx.clock, e) : null;
    }
    case 'life_event': {
      const l = s.lifeEvents.find((x) => x.id === i.entityId);
      return l ? lifeCard(ctx.clock, l) : null;
    }
    case 'commitment':
      return {
        kind: 'commitment',
        entityId: i.entityId,
        title: i.title,
        subtitle: i.timeLabel ?? null,
        source: i.source,
      };
    case 'follow_up': {
      const f = s.followUps.find((x) => x.id === i.entityId);
      const t = f ? s.threads.find((x) => x.id === f.threadId) : undefined;
      return t ? emailCard(ctx.clock, t, s) : null;
    }
    default:
      return null;
  }
}

function assistantSource(ctx: DemoContext, input: IntentInput): SourceRef {
  return {
    type: 'assistant',
    id: input.userMessageId,
    label: 'Asistan',
    timestamp: ctx.nowIso(),
    excerpt: truncate(input.message, 200),
  };
}

function stripDot(text: string): string {
  return text.replace(/\.$/, '');
}

// --- read intents -----------------------------------------------------------

function answerFocus(ctx: DemoContext, s: DemoState): IntentResult {
  const priorities = selectPriorities(todayInsights(s, ctx.clock), ctx.clock, 5);
  if (!priorities.length)
    return {
      content: 'Şu an dikkat gerektiren bir konu yok. Yeni bir gelişme olursa söylerim.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: ['Yarın yoğun muyum?'],
      uncertain: false,
    };
  const lead = priorities[0];
  const meeting = priorities.find((i) => i.kind === 'meeting' && i.entityType === 'calendar_event');
  const deadline = priorities.find((i) => i.kind === 'deadline');
  const parts = [`En kritik konu: ${stripDot(lead?.title ?? '')}.`];
  if (meeting && meeting !== lead)
    parts.push(`Sonrasında ${stripDot(meeting.title)} için hazırlanman yeterli.`);
  if (deadline && deadline !== lead) parts.push(stripDot(deadline.title) + '.');
  const top = priorities.slice(0, 3);
  return {
    content: parts.join(' '),
    sources: top.map((i) => i.source),
    cards: top.map((i) => insightCard(ctx, s, i)).filter((c): c is AssistantRichCard => c !== null),
    approvals: [],
    suggestedFollowUps: [
      'Kimlere cevap vermem gerekiyor?',
      meeting
        ? `${stripDot(meeting.title).replace(/^\d{2}:\d{2}\s*/, '')} için hazırlık notu`
        : 'Yarın yoğun muyum?',
    ],
    uncertain: false,
  };
}

function waitingThreads(
  s: DemoState,
  clock: DemoClock,
): Array<{ insight: Insight; thread: EmailThread }> {
  return todayInsights(s, clock)
    .filter(
      (i) =>
        i.entityType === 'email_thread' && (i.kind === 'waiting_for_user' || i.kind === 'priority'),
    )
    .map((insight) => ({ insight, thread: s.threads.find((t) => t.id === insight.entityId) }))
    .filter((x): x is { insight: Insight; thread: EmailThread } =>
      Boolean(x.thread && x.thread.analysis?.requiresUserAction && !x.thread.userMarkedDone),
    )
    .sort((a, b) => (a.insight.dueAt ?? '9').localeCompare(b.insight.dueAt ?? '9'));
}

function answerWaiting(ctx: DemoContext, s: DemoState): IntentResult {
  const waiting = waitingThreads(s, ctx.clock);
  if (!waiting.length)
    return {
      content: 'Şu an senden cevap bekleyen kimse yok.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: ['Bugün neye odaklanmalıyım?'],
      uncertain: false,
    };
  const clauses = waiting.map(({ insight, thread }) => {
    const other = thread.participants.find((p) => !isUserEmail(s, p.email));
    const who = firstName(other?.name ?? other?.email ?? 'Biri');
    const when = insight.dueAt ? dueLabel(ctx.clock, insight.dueAt) : 'süre belirtilmemiş';
    return `${who}'inki ${when}'e kadar`;
  });
  return {
    content: `${waiting.length} kişi senden cevap bekliyor. ${clauses.join('; ')}.`,
    sources: waiting.map(({ thread }) => threadSource(thread)),
    cards: waiting.map(({ thread }) => emailCard(ctx.clock, thread, s)),
    approvals: [],
    suggestedFollowUps: waiting
      .slice(0, 2)
      .map(
        ({ thread }) =>
          `${firstName(thread.participants.find((p) => !isUserEmail(s, p.email))?.name ?? 'Kişi')} için yanıt taslağı hazırla`,
      ),
    uncertain: false,
  };
}

function answerTomorrow(ctx: DemoContext, s: DemoState): IntentResult {
  const tomorrow = ctx.clock.addDays(ctx.clock.today(), 1);
  const events = eventsOnDay(s, ctx.clock, tomorrow);
  const lives = s.lifeEvents.filter(
    (l) =>
      !l.deletedAt &&
      l.status !== 'dismissed' &&
      l.eventAt &&
      ctx.clock.dateKey(l.eventAt) === tomorrow,
  );
  const free = computeFreeBlocks(
    events.map((e) => ({ startAt: e.startAt, endAt: e.endAt })),
    ctx.clock,
    tomorrow,
  ).find((b) => b.minutes >= 120);
  const list = events.map((e) => `${ctx.clock.hhmm(e.startAt)} ${e.title}`).join(', ');
  const busy =
    events.length >= 4
      ? 'Yarın oldukça yoğun'
      : events.length
        ? 'Yarın sakin görünüyor'
        : 'Yarın takvimin boş';
  const parts = [`${busy}${events.length ? `: ${list}.` : '.'}`];
  if (free)
    parts.push(
      `${ctx.clock.hhmm(free.startAt)}–${ctx.clock.hhmm(free.endAt)} arası boş; odaklanmak için uygun.`,
    );
  for (const l of lives)
    parts.push(
      `Ayrıca ${l.eventAt ? ctx.clock.hhmm(l.eventAt) : ''} ${stripDot(l.title)}.`.replace(
        /\s+/g,
        ' ',
      ),
    );
  return {
    content: parts.join(' '),
    sources: [...events.map((e) => eventSource(e)), ...lives.map(lifeEventSource)],
    cards: [
      ...events.map((e) => eventCard(ctx.clock, e)),
      ...lives.map((l) => lifeCard(ctx.clock, l)),
    ],
    approvals: [],
    suggestedFollowUps: ["Bu hafta hangi deadline'lar var?", 'Bugün neye odaklanmalıyım?'],
    uncertain: false,
  };
}

function answerDeadlines(ctx: DemoContext, s: DemoState): IntentResult {
  const today = ctx.clock.today();
  const horizon = ctx.clock.addDays(today, 7);
  const items: Array<{
    title: string;
    at: string;
    source: SourceRef;
    card: AssistantRichCard | null;
    kind: 'payment' | 'subscription' | 'application' | 'other';
  }> = [];
  for (const i of todayInsights(s, ctx.clock)) {
    if (i.kind === 'deadline' && i.dueAt && ctx.clock.dateKey(i.dueAt) <= horizon)
      items.push({
        title: stripDot(i.title),
        at: i.dueAt,
        source: i.source,
        card: insightCard(ctx, s, i),
        kind: /başvuru/i.test(i.title) ? 'application' : 'other',
      });
  }
  for (const l of s.lifeEvents) {
    if (l.deletedAt || l.status === 'dismissed' || l.status === 'done' || !l.eventAt) continue;
    if (
      (l.type === 'payment' || l.type === 'subscription') &&
      ctx.clock.dateKey(l.eventAt) >= today &&
      ctx.clock.dateKey(l.eventAt) <= horizon
    )
      items.push({
        title: stripDot(l.title),
        at: l.eventAt,
        source: lifeEventSource(l),
        card: lifeCard(ctx.clock, l),
        kind: l.type,
      });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  if (!items.length)
    return {
      content: 'Bu hafta kayıtlı bir son tarih yok.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: ['Yarın yoğun muyum?'],
      uncertain: false,
    };
  const payments = items.filter((i) => i.kind === 'payment' || i.kind === 'subscription').length;
  const applications = items.filter((i) => i.kind === 'application').length;
  const breakdown = [
    payments ? `${payments === 1 ? 'biri' : payments === 2 ? 'ikisi' : payments} ödeme` : null,
    applications ? `${applications === 1 ? 'biri' : applications} başvuru` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    content: `Bu hafta ${items.length} son tarih var${breakdown ? `. ${capitalizeTr(breakdown)}` : ''}: ${items.map((i) => `${i.title} (${dueLabel(ctx.clock, i.at)})`).join('; ')}.`,
    sources: items.map((i) => i.source),
    cards: items.map((i) => i.card).filter((c): c is AssistantRichCard => c !== null),
    approvals: [],
    suggestedFollowUps: ['Elektrik faturası için hatırlat', 'Bugün neye odaklanmalıyım?'],
    uncertain: false,
  };
}

function answerLastConversation(
  ctx: DemoContext,
  s: DemoState,
  contact: Contact,
  message: string,
): IntentResult {
  const chunks = s.memory
    .filter((m) => m.contactId === contact.id)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const threads = threadsForContact(s, contact);
  const first = firstName(contact.displayName);
  const followUp = s.followUps.find(
    (f) => f.contactId === contact.id && (f.status === 'nudge_due' || f.status === 'watching'),
  );
  const asksReply = includesAny(message, [
    'cevap geldi',
    'yanit geldi',
    'dondu mu',
    'donus yapti',
    'cevap verdi',
  ]);
  if (asksReply) {
    if (followUp) {
      const days = daysBetweenKeys(ctx.clock.dateKey(followUp.sentAt), ctx.clock.today());
      const thread = s.threads.find((t) => t.id === followUp.threadId);
      return {
        content: `Henüz gelmedi. ${followUp.topic} mailini ${days} gün önce gönderdin. İstersen kısa bir takip mesajı hazırlayıp onayına sunabilirim.`,
        sources: [followUp.source],
        cards: thread ? [emailCard(ctx.clock, thread, s)] : [],
        approvals: [],
        suggestedFollowUps: ['Evet, hazırla.', `${first} ile en son ne konuştuk?`],
        uncertain: false,
      };
    }
    const latestFromThem = threads.find((t) => !t.lastFromUser);
    return latestFromThem
      ? {
          content: `Evet: ${first} en son ${relativeDayLabel(ctx.clock, latestFromThem.lastMessageAt).toLowerCase()} ${ctx.clock.hhmm(latestFromThem.lastMessageAt)}'de yazdı — ${latestFromThem.analysis?.summary ?? latestFromThem.snippet}`,
          sources: [threadSource(latestFromThem)],
          cards: [emailCard(ctx.clock, latestFromThem, s)],
          approvals: [],
          suggestedFollowUps: [`${dative(first)} yanıt taslağı hazırla`],
          uncertain: false,
        }
      : {
          content: `${first} ile bekleyen bir yazışma bulamadım.`,
          sources: [],
          cards: [personCard(contact)],
          approvals: [],
          suggestedFollowUps: [],
          uncertain: true,
        };
  }
  // "ne konuştuk / görüştük" asks about the last conversation → prefer a meeting note over a mail chunk.
  const asksConversation = includesAny(message, ['konus', 'gorus']);
  const latest =
    (asksConversation ? chunks.find((c) => c.sourceType === 'meeting_note') : undefined) ??
    chunks[0];
  if (!latest && !threads.length)
    return {
      content: `${first} ile henüz kayıtlı bir etkileşim yok.`,
      sources: [],
      cards: [personCard(contact)],
      approvals: [],
      suggestedFollowUps: [],
      uncertain: true,
    };
  const parts: string[] = [];
  const sources: SourceRef[] = [];
  if (latest) {
    parts.push(
      `${first} ile en son ${dayMonthLong(ctx.clock.dateKey(latest.occurredAt))}'de ${latest.sourceType === 'meeting_note' ? 'görüştün' : 'yazıştın'}: ${latest.content}`,
    );
    sources.push(latest.source);
  }
  const latestThread = threads[0];
  if (latestThread && (!latest || latestThread.id !== latest.sourceId)) {
    parts.push(
      `Son mail ${relativeDayLabel(ctx.clock, latestThread.lastMessageAt).toLowerCase()} ${ctx.clock.hhmm(latestThread.lastMessageAt)}: ${latestThread.analysis?.summary ?? latestThread.snippet}`,
    );
    sources.push(threadSource(latestThread));
  }
  if (followUp)
    parts.push(
      `Gönderdiğin ${followUp.topic} mailine ${daysBetweenKeys(ctx.clock.dateKey(followUp.sentAt), ctx.clock.today())} gündür yanıt yok.`,
    );
  const upcoming = eventsForContact(s, contact).find(
    (e) => Date.parse(e.endAt) >= ctx.clock.now().getTime(),
  );
  return {
    content: parts.join(' '),
    sources,
    cards: [
      personCard(contact),
      ...(latestThread ? [emailCard(ctx.clock, latestThread, s)] : []),
      ...(upcoming ? [eventCard(ctx.clock, upcoming)] : []),
    ],
    approvals: [],
    suggestedFollowUps: [
      `${ablativeLike(first)} cevap geldi mi?`,
      ...(upcoming ? [`${upcoming.title} için hazırlık notu`] : []),
    ],
    uncertain: false,
  };
}

function ablativeLike(name: string): string {
  const lower = name.toLowerCase();
  const back = /[aıou](?!.*[eiöü])/.test(lower);
  const hard = /[fstkçşhp]$/.test(lower);
  return `${name}'${hard ? 't' : 'd'}${back ? 'an' : 'en'}`;
}

function answerPayments(ctx: DemoContext, s: DemoState): IntentResult {
  const items = s.lifeEvents
    .filter(
      (l) =>
        !l.deletedAt &&
        l.status !== 'dismissed' &&
        l.status !== 'done' &&
        (l.type === 'payment' || l.type === 'subscription'),
    )
    .sort((a, b) => (a.eventAt ?? '').localeCompare(b.eventAt ?? ''));
  if (!items.length)
    return {
      content: 'Yaklaşan bir ödeme bulamadım.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: [],
      uncertain: false,
    };
  const sentences = items.map((l) => {
    const amount =
      l.details.amount != null
        ? `${formatAmount(l.details.amount)} ${l.details.currency === 'TRY' ? 'TL' : (l.details.currency ?? '')}`
        : null;
    if (l.type === 'payment')
      return `${l.details.payee ?? 'Ödeme'} faturan${amount ? ` ${amount}` : ''}${l.details.dueAt ? `, son ödeme ${dayMonthLong(ctx.clock.dateKey(l.details.dueAt))}` : ''}.`;
    return `${l.details.serviceName ?? l.title}${l.details.renewsAt ? ` ${dayMonthLong(ctx.clock.dateKey(l.details.renewsAt))}'de` : ''}${amount ? ` ${amount} ile` : ''} yenilenecek.`;
  });
  return {
    content: sentences.join(' '),
    sources: items.map(lifeEventSource),
    cards: items.map((l) => lifeCard(ctx.clock, l)),
    approvals: [],
    suggestedFollowUps: ['Elektrik faturası için hatırlat', "Bu hafta hangi deadline'lar var?"],
    uncertain: false,
  };
}

function answerFlight(ctx: DemoContext, s: DemoState, message: string): IntentResult {
  const flight = s.lifeEvents.find((l) => l.type === 'flight' && !l.deletedAt);
  if (!flight)
    return {
      content: 'Kayıtlı bir uçuş bulamadım.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: [],
      uncertain: true,
    };
  const d = flight.details;
  const asksPrice = includesAny(message, ['ne kadar', 'kac para', 'tutar', 'fiyat', 'ucret']);
  const core =
    `${d.flightNumber ?? ''} ${d.from ?? ''} → ${d.to ?? ''}, ${d.departureAt ? `${relativeDayLabel(ctx.clock, d.departureAt).toLowerCase()} ${ctx.clock.hhmm(d.departureAt)} kalkış` : ''}${d.arrivalAt ? ` (varış ${ctx.clock.hhmm(d.arrivalAt)})` : ''}. PNR ${d.pnr ?? '—'}${d.checkInUrl ? '; online check-in açık' : ''}.`.replace(
      /\s+/g,
      ' ',
    );
  return {
    content: asksPrice
      ? `Biletin tutarı mailde yer almıyor; kaynakta kesinleşmiyor. Bulduğum bilet: ${core}`
      : core,
    sources: [lifeEventSource(flight)],
    cards: [lifeCard(ctx.clock, flight)],
    approvals: [],
    suggestedFollowUps: ['Uçuş için alarm kur', 'Yarın yoğun muyum?'],
    uncertain: asksPrice,
  };
}

function answerShipment(ctx: DemoContext, s: DemoState): IntentResult {
  const ship = s.lifeEvents.find(
    (l) => l.type === 'shipment' && !l.deletedAt && l.status !== 'dismissed',
  );
  if (!ship)
    return {
      content: 'Yolda olan bir kargo görünmüyor.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: [],
      uncertain: false,
    };
  const w = ship.details.deliveryWindow;
  return {
    content:
      `${ship.details.merchant ?? 'Siparişin'} siparişin ${w?.start ? `${relativeDayLabel(ctx.clock, w.start).toLowerCase()} ${ctx.clock.hhmm(w.start)}${w.end ? `–${ctx.clock.hhmm(w.end)}` : ''} arasında` : ''} ${ship.details.carrier ? `${ship.details.carrier} ile` : ''} teslim edilecek.${ship.details.trackingNumber ? ` Takip no ${ship.details.trackingNumber}.` : ''}`.replace(
        /\s+/g,
        ' ',
      ),
    sources: [lifeEventSource(ship)],
    cards: [lifeCard(ctx.clock, ship)],
    approvals: [],
    suggestedFollowUps: ['Kargo gelince hatırlat'],
    uncertain: false,
  };
}

function answerBriefing(ctx: DemoContext, s: DemoState): IntentResult {
  const briefing = s.briefings.find((b) => b.kind === 'morning' && b.forDate === ctx.clock.today());
  if (!briefing)
    return {
      content: 'Bugün için hazır bir brifing yok.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: [],
      uncertain: false,
    };
  const sourced = briefing.items.filter((i) => i.source);
  const cards = briefing.items
    .filter((i) => i.section === 'priorities')
    .map((i) => {
      const insight = i.insightId ? s.insights.find((x) => x.id === i.insightId) : undefined;
      return insight ? insightCard(ctx, s, insight) : null;
    })
    .filter((c): c is AssistantRichCard => c !== null);
  return {
    content: `${briefing.headline} ${briefing.narrative}`,
    sources: sourced.map((i) => i.source as SourceRef),
    cards,
    approvals: [],
    suggestedFollowUps: ['Bugün neye odaklanmalıyım?', 'Kimlere cevap vermem gerekiyor?'],
    uncertain: false,
  };
}

function answerPerson(ctx: DemoContext, s: DemoState, contact: Contact): IntentResult {
  const first = firstName(contact.displayName);
  const threads = threadsForContact(s, contact);
  const latest = threads[0];
  const upcoming = eventsForContact(s, contact).find(
    (e) => Date.parse(e.endAt) >= ctx.clock.now().getTime(),
  );
  const open = s.commitments.filter(
    (c) =>
      c.counterpartContactId === contact.id && (c.status === 'open' || c.status === 'postponed'),
  );
  const parts = [
    latest
      ? `${first} ile son iletişim ${relativeDayLabel(ctx.clock, latest.lastMessageAt).toLowerCase()} ${ctx.clock.hhmm(latest.lastMessageAt)}: ${latest.analysis?.summary ?? latest.snippet}`
      : `${first} ile kayıtlı bir yazışma yok.`,
    upcoming
      ? `Yaklaşan: ${relativeDayLabel(ctx.clock, upcoming.startAt)} ${ctx.clock.hhmm(upcoming.startAt)} ${upcoming.title}.`
      : null,
    open.length ? `Açık konu: ${open.map((c) => c.text).join(', ')}.` : null,
  ].filter((p): p is string => Boolean(p));
  return {
    content: parts.join(' '),
    sources: latest ? [threadSource(latest)] : [],
    cards: [personCard(contact), ...(upcoming ? [eventCard(ctx.clock, upcoming)] : [])],
    approvals: [],
    suggestedFollowUps: [
      `${first} ile en son ne konuştuk?`,
      `${ablativeLike(first)} cevap geldi mi?`,
    ],
    uncertain: !latest,
  };
}

function answerGeneric(ctx: DemoContext, s: DemoState, message: string): IntentResult {
  const today = todayInsights(s, ctx.clock);
  const mails = today.filter(
    (i) => i.entityType === 'email_thread' && i.tags.includes('important'),
  ).length;
  const events = eventsOnDay(s, ctx.clock, ctx.clock.today()).length;
  const followUps = s.followUps.filter(
    (f) => f.status === 'nudge_due' || f.status === 'watching',
  ).length;
  const contact = findContactByName(s, message);
  return {
    content: `Bunu kaynaklarında kesin olarak bulamadım; kaynakta kesinleşmiyor. Bugün ${mails} önemli mail, ${events} etkinlik ve ${followUps} takip analiz edildi. Sorunu biraz daha netleştirir misin?`,
    sources: [],
    cards: contact ? [personCard(contact)] : [],
    approvals: [],
    suggestedFollowUps: [
      'Bugün neye odaklanmalıyım?',
      'Kimlere cevap vermem gerekiyor?',
      "Bu hafta hangi deadline'lar var?",
    ],
    uncertain: true,
  };
}

// --- write intents -----------------------------------------------------------

function reminderIntent(ctx: DemoContext, s: DemoState, input: IntentInput): IntentResult {
  const sched = parseSchedule(input.message, ctx.clock, { defaultTime: '09:10' });
  const folded = fold(input.message);
  const remindAt = sched.iso ?? ctx.clock.addMinutes(ctx.clock.now(), 60);
  const option = folded.includes('yarin sabah')
    ? 'tomorrow_morning'
    : /\b(bu )?aksam/.test(folded) && !sched.time
      ? 'this_evening'
      : sched.iso
        ? 'custom'
        : 'smart';
  let title = stripPhrases(input.message, sched.phrases)
    .replace(
      /\b(hatırlat(ır mısın| lütfen)?|hatirlat|bana|beni|lütfen|diye|hakkında|için)\b/gi,
      ' ',
    )
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const contact = findContactByName(s, input.message);
  const thread = contact
    ? (threadsForContact(s, contact).find(
        (t) => t.analysis?.requiresUserAction && !t.userMarkedDone,
      ) ?? threadsForContact(s, contact)[0])
    : undefined;
  const life = /(fatura|odeme)/.test(folded)
    ? s.lifeEvents.find((l) => l.type === 'payment' && !l.deletedAt)
    : undefined;
  if (!title) title = thread ? thread.subject : life ? life.title : 'Hatırlatıcı';
  title = capitalizeTr(title);
  const approval = createApprovalCore(ctx, {
    type: 'reminder_create',
    what: `${title} · ${dueLabel(ctx.clock, remindAt)}`,
    why: 'Asistana söyledin.',
    changeSummary: [
      '1 hatırlatıcı · Takvimine yazılmaz',
      `Zaman: ${dueLabel(ctx.clock, remindAt)}`,
    ],
    payload: {
      title,
      body: null,
      remindAt,
      option,
      targetType: thread ? 'email_thread' : life ? 'life_event' : null,
      targetId: thread?.id ?? life?.id ?? null,
      smartReason: option === 'smart' ? 'Zaman belirtilmedi; bir saat sonrasını önerdim.' : null,
    },
    source: thread
      ? threadSource(thread)
      : life
        ? lifeEventSource(life)
        : assistantSource(ctx, input),
    requestedBy: input.inputMode === 'voice' ? 'voice' : 'assistant',
    idempotencyKey: `assistant:reminder:${input.userMessageId}`,
  });
  return {
    content: `Hatırlatıcıyı onayına sundum: “${title}” · ${dueLabel(ctx.clock, remindAt)}. Onaylayınca kurulur.`,
    sources: approval.source ? [approval.source] : [],
    cards: [approvalCard(approval)],
    approvals: [approval],
    suggestedFollowUps: ['Onayla', 'Zamanı değiştir'],
    uncertain: false,
  };
}

function calendarCreateIntent(ctx: DemoContext, s: DemoState, input: IntentInput): IntentResult {
  const sched = parseSchedule(input.message, ctx.clock, { defaultTime: '10:00' });
  if (!sched.dateKey)
    return {
      content: 'Ne zaman ekleyeyim? Örneğin: “yarın 15:00 Ahmet ile toplantı ekle”.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: ['Yarın 15:00'],
      uncertain: false,
    };
  const startAt = sched.iso ?? ctx.clock.atIso(sched.dateKey, '10:00');
  const endAt = ctx.clock.addMinutes(startAt, 60);
  const contact = findContactByName(s, input.message);
  let title = stripPhrases(input.message, sched.phrases)
    .replace(
      /\b(takvim(e|ime|imde)?|ekle(r misin)?|ekleyelim|oluştur|olustur|ayarla|kur|lütfen|bana|bir)\b/gi,
      ' ',
    )
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) title = contact ? `${contact.displayName} ile toplantı` : 'Yeni etkinlik';
  title = capitalizeTr(title);
  const account =
    s.accounts.find((a) => !a.deletedAt && a.kinds.includes('calendar') && a.isPrimary) ??
    s.accounts.find((a) => !a.deletedAt && a.kinds.includes('calendar'));
  const approval = createApprovalCore(ctx, {
    type: 'calendar_create',
    what: `Takvime "${title}" ekle`,
    why: 'Asistana söyledin.',
    changeSummary: [
      `Başlık: ${title}`,
      `Ne zaman: ${dueLabel(ctx.clock, startAt)}–${ctx.clock.hhmm(endAt)}`,
      `Takvim: ${account?.displayName ?? 'Google'}`,
    ],
    payload: {
      accountId: account?.id ?? s.accounts[0]?.id ?? ctx.userId,
      title,
      startAt,
      endAt,
      attendees:
        contact && contact.emails[0]
          ? [{ name: contact.displayName, email: contact.emails[0] }]
          : [],
    },
    source: assistantSource(ctx, input),
    requestedBy: input.inputMode === 'voice' ? 'voice' : 'assistant',
    idempotencyKey: `assistant:calendar_create:${input.userMessageId}`,
  });
  return {
    content: `Takvime eklemek için onayına sundum: ${title} · ${dueLabel(ctx.clock, startAt)}–${ctx.clock.hhmm(endAt)}.`,
    sources: [],
    cards: [approvalCard(approval)],
    approvals: [approval],
    suggestedFollowUps: ['Onayla', 'Süreyi 30 dakika yap'],
    uncertain: false,
  };
}

function calendarUpdateIntent(
  ctx: DemoContext,
  s: DemoState,
  input: IntentInput,
): IntentResult | null {
  const contact = findContactByName(s, input.message);
  const now = ctx.clock.now().getTime();
  const todayEvents = eventsOnDay(s, ctx.clock, ctx.clock.today());
  const words = fold(input.message).split(/[^a-z0-9]+/);
  let event: CalendarEvent | undefined = contact
    ? eventsForContact(s, contact).find((e) => Date.parse(e.endAt) >= now)
    : undefined;
  if (!event)
    event = todayEvents.find(
      (e) =>
        fold(e.title)
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3)
          .filter((w) => words.includes(w)).length >= 1 && Date.parse(e.endAt) >= now,
    );
  if (!event && /toplanti/.test(fold(input.message)))
    event = todayEvents.find(
      (e) => Date.parse(e.endAt) >= now && (e.attendees.length > 0 || /toplant/i.test(e.title)),
    );
  if (!event) return null;
  const sched = parseSchedule(input.message, ctx.clock, {
    defaultTime: ctx.clock.hhmm(event.startAt),
  });
  if (!sched.time)
    return {
      content: `${event.title} etkinliğini hangi saate alayım?`,
      sources: [eventSource(event)],
      cards: [eventCard(ctx.clock, event)],
      approvals: [],
      suggestedFollowUps: ["16:30'a al", 'Yarın aynı saate al'],
      uncertain: false,
    };
  const dayKey = sched.dateKey ?? ctx.clock.dateKey(event.startAt);
  const startAt = ctx.clock.atIso(dayKey, sched.time);
  const duration = Date.parse(event.endAt) - Date.parse(event.startAt);
  const endAt = new Date(Date.parse(startAt) + duration).toISOString();
  const clash = eventsOnDay(s, ctx.clock, dayKey).find(
    (e) =>
      e.id !== event.id &&
      Date.parse(e.startAt) < Date.parse(endAt) &&
      Date.parse(e.endAt) > Date.parse(startAt),
  );
  const others = event.attendees.filter((a) => !isUserEmail(s, a.email)).length;
  const approval = createApprovalCore(ctx, {
    type: 'calendar_update',
    what: `${event.title} → ${dueLabel(ctx.clock, startAt)}`,
    why: contact
      ? `${firstName(contact.displayName)} ile konuştuğun saate göre.`
      : 'Asistana söyledin.',
    changeSummary: [
      `${ctx.clock.hhmm(event.startAt)} → ${ctx.clock.hhmm(startAt)}`,
      ...(others ? [`${others} katılımcıya bildirim gider`] : []),
      ...(clash ? [`Dikkat: ${clash.title} ile çakışıyor`] : []),
    ],
    payload: {
      accountId: event.accountId,
      eventId: event.id,
      externalEventId: event.externalEventId,
      expectedProviderUpdatedAt: event.providerUpdatedAt ?? null,
      changes: { startAt, endAt },
    },
    source: eventSource(event),
    requestedBy: input.inputMode === 'voice' ? 'voice' : 'assistant',
    insightId:
      s.insights.find(
        (i) =>
          i.entityType === 'calendar_event' && i.entityId === event?.id && i.status === 'active',
      )?.id ?? null,
    idempotencyKey: `assistant:calendar_update:${input.userMessageId}`,
  });
  return {
    content: `${event.title} etkinliğini ${dueLabel(ctx.clock, startAt)}'a taşımak için onayına sundum.${clash ? ` Not: bu saat ${clash.title} ile çakışıyor.` : ''}`,
    sources: [eventSource(event)],
    cards: [approvalCard(approval), eventCard(ctx.clock, event)],
    approvals: [approval],
    suggestedFollowUps: [
      'Onayla',
      clash ? `${ctx.clock.hhmm(clash.endAt)}'a al` : 'Katılımcılara not ekle',
    ],
    uncertain: false,
  };
}

function emailSendIntent(ctx: DemoContext, s: DemoState, input: IntentInput): IntentResult | null {
  const folded = fold(input.message);
  const contact = findContactByName(s, input.message);
  const wantsFollowUp =
    /takip/.test(folded) ||
    Boolean(input.lastAssistant && /takip mesajı/.test(input.lastAssistant.content));
  let thread: EmailThread | undefined;
  let followUpId: UUID | null = null;
  if (contact) {
    const threads = threadsForContact(s, contact);
    const followUp = s.followUps.find(
      (f) => f.contactId === contact.id && (f.status === 'nudge_due' || f.status === 'watching'),
    );
    if (wantsFollowUp && followUp) {
      thread = threads.find((t) => t.id === followUp.threadId);
      followUpId = followUp.id;
    } else
      thread =
        threads.find((t) => t.analysis?.requiresUserAction && !t.userMarkedDone) ??
        threads.find((t) => !t.lastFromUser) ??
        threads[0];
  } else if (input.lastAssistant?.cards.length) {
    const card = input.lastAssistant.cards.find((c) => c.kind === 'email');
    thread = card ? s.threads.find((t) => t.id === card.entityId) : undefined;
    const followUp = thread
      ? s.followUps.find(
          (f) => f.threadId === thread?.id && (f.status === 'nudge_due' || f.status === 'watching'),
        )
      : undefined;
    followUpId = followUp?.id ?? null;
  } else if (wantsFollowUp) {
    const followUp =
      s.followUps.find((f) => f.status === 'nudge_due') ??
      s.followUps.find((f) => f.status === 'watching');
    thread = followUp ? s.threads.find((t) => t.id === followUp.threadId) : undefined;
    followUpId = followUp?.id ?? null;
  }
  if (!thread) return null;
  const other = thread.participants.find((p) => !isUserEmail(s, p.email));
  if (!other) return null;
  const followUp = followUpId ? s.followUps.find((f) => f.id === followUpId) : undefined;
  const body = followUp
    ? followUpDraftFor(ctx, followUp, thread)
    : replyDraftsFor(ctx, thread).professional;
  const lastMessage = s.messages
    .filter((m) => m.threadId === thread?.id)
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
  const insight = s.insights.find(
    (i) =>
      i.status === 'active' &&
      ((i.entityType === 'email_thread' && i.entityId === thread?.id) ||
        (followUpId && i.entityType === 'follow_up' && i.entityId === followUpId)),
  );
  const name = other.name ?? other.email;
  const days = followUp
    ? daysBetweenKeys(ctx.clock.dateKey(followUp.sentAt), ctx.clock.today())
    : 0;
  const approval = createApprovalCore(ctx, {
    type: 'email_send',
    what: followUp ? `${dative(name)} takip mesajı gönder` : `${dative(name)} yanıt gönder`,
    why: followUp
      ? `${followUp.topic} mailine ${days} gündür yanıt gelmedi.`
      : (thread.analysis?.summary ?? 'Senden cevap bekliyor.'),
    changeSummary: [
      `Kime: ${name}`,
      `Konu: ${/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`}`,
      '1 mail gönderilecek · Profesyonel ton · Ek yok',
    ],
    payload: {
      accountId: thread.accountId,
      threadId: thread.id,
      inReplyToExternalId: lastMessage?.externalMessageId ?? null,
      to: [{ name: other.name ?? null, email: other.email }],
      subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
      bodyText: body,
      tone: 'professional',
    },
    source: threadSource(thread),
    requestedBy: input.inputMode === 'voice' ? 'voice' : 'assistant',
    insightId: insight?.id ?? null,
    idempotencyKey: `assistant:email_send:${input.userMessageId}`,
  });
  const deadline = thread.analysis?.deadlineText;
  return {
    content: `Hazırladım. Profesyonel tonda${deadline ? `, ${deadline} teslimini teyit ediyor` : ''}. Göndermek için onaylaman yeterli.`,
    sources: [threadSource(thread)],
    cards: [approvalCard(approval), emailCard(ctx.clock, thread, s)],
    approvals: [approval],
    suggestedFollowUps: ['Göndermeyi Onayla', 'Daha kısa yaz'],
    uncertain: false,
  };
}

function nextMeetingPrep(ctx: DemoContext, s: DemoState): IntentResult | null {
  const now = ctx.clock.now().getTime();
  const next = eventsOnDay(s, ctx.clock, ctx.clock.today()).find(
    (e) => Date.parse(e.endAt) >= now && (e.attendees.length > 0 || /toplant/i.test(e.title)),
  );
  if (!next) return null;
  const contact = next.attendees
    .map(
      (a) =>
        (a.contactId ? s.contacts.find((c) => c.id === a.contactId) : undefined) ??
        findContactByName(s, a.name ?? ''),
    )
    .find((c): c is Contact => Boolean(c));
  const threads = contact ? threadsForContact(s, contact).slice(0, 2) : [];
  const points = threads.flatMap((t) => t.analysis?.keyPoints.slice(0, 1) ?? []);
  return {
    content: `${ctx.clock.hhmm(next.startAt)} ${next.title} için ${points.length ? `şunlara hazırlan: ${points.join(', ')}.` : 'gündem takvim davetinde belirtilmemiş.'} Detaylı hazırlık notunu toplantı ekranında bulabilirsin.`,
    sources: [eventSource(next), ...threads.map((t) => threadSource(t))],
    cards: [eventCard(ctx.clock, next), ...threads.map((t) => emailCard(ctx.clock, t, s))],
    approvals: [],
    suggestedFollowUps: contact
      ? [`${firstName(contact.displayName)} ile en son ne konuştuk?`]
      : [],
    uncertain: false,
  };
}

export function resolveIntent(ctx: DemoContext, s: DemoState, input: IntentInput): IntentResult {
  const folded = fold(input.message);
  const scopedContact = input.contactId
    ? s.contacts.find((c) => c.id === input.contactId)
    : undefined;
  const contact = findContactByName(s, input.message) ?? scopedContact;
  const affirmative = /^(evet|olur|tamam|hazirla|hazırla|lutfen|lütfen)\b/.test(folded);
  const lastOfferedDraft = Boolean(
    input.lastAssistant &&
    /takip mesajı hazırlayıp|yanıt taslağı/.test(input.lastAssistant.content),
  );

  if (/hatirlat/.test(folded)) return reminderIntent(ctx, s, input);
  if (
    /\b(tasi|kaydir|ileri al|geri al|ertele)\b/.test(folded) ||
    (/\b(al|alalim|alabilir misin)\b/.test(folded) &&
      /\d{1,2}[:.]\d{2}/.test(folded) &&
      /(toplanti|randevu|etkinlik)/.test(folded))
  ) {
    const moved = calendarUpdateIntent(ctx, s, input);
    if (moved) return moved;
  }
  if (
    /\b(ekle|olustur|ayarla|kur|planla)\b/.test(folded) &&
    /(takvim|toplanti|etkinlik|randevu|gorusme)/.test(folded)
  )
    return calendarCreateIntent(ctx, s, input);
  const wantsEmail =
    (/(mail|e-posta|eposta|yanit|cevap|taslak|takip mesaji)/.test(folded) &&
      /(gonder|yanitla|hazirla|yaz|olustur)/.test(folded)) ||
    (affirmative && lastOfferedDraft);
  if (wantsEmail) {
    const sent = emailSendIntent(ctx, s, input);
    if (sent) return sent;
    return {
      content: 'Kime yazmamı istersin? Örneğin: “Ahmet’e yanıt taslağı hazırla”.',
      sources: [],
      cards: [],
      approvals: [],
      suggestedFollowUps: ["Ahmet'e yanıt taslağı hazırla"],
      uncertain: false,
    };
  }

  if (/brifing/.test(folded)) return answerBriefing(ctx, s);
  if (
    contact &&
    includesAny(input.message, [
      'cevap geldi',
      'yanit geldi',
      'dondu mu',
      'donus yapti',
      'cevap verdi',
      'konus',
      'en son',
      'ne dedi',
      'ne demis',
      'hakkinda',
      'son gorus',
    ])
  )
    return answerLastConversation(ctx, s, contact, input.message);
  if (/(ucak|bilet|ucus|pnr|check-in|checkin)/.test(folded))
    return answerFlight(ctx, s, input.message);
  if (/(kargo|siparis|teslimat|paket)/.test(folded)) return answerShipment(ctx, s);
  if (/(fatura|odeme|ode\b|abonelik|borc)/.test(folded)) return answerPayments(ctx, s);
  if (/(son tarih|deadline|bitis tarihi|basvuru tarihi)/.test(folded))
    return answerDeadlines(ctx, s);
  if (/yarin/.test(folded) && /(yogun|ne var|program|bos|takvim|nasil)/.test(folded))
    return answerTomorrow(ctx, s);
  if (/(cevap|yanit)/.test(folded) && /(kim|bekle|vermem|vermeliyim)/.test(folded))
    return answerWaiting(ctx, s);
  if (/(toplanti)/.test(folded) && /(hazirl|ne konus|gundem)/.test(folded)) {
    const prep = nextMeetingPrep(ctx, s);
    if (prep) return prep;
  }
  if (/(odaklan|oncelik|onemli|ne var|bugun)/.test(folded) && !/yarin/.test(folded))
    return answerFocus(ctx, s);
  if (scopedContact) return answerPerson(ctx, s, scopedContact);
  if (contact) return answerPerson(ctx, s, contact);
  return answerGeneric(ctx, s, input.message);
}
