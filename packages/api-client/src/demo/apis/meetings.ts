import type {
  CalendarEvent,
  Commitment,
  Contact,
  MeetingPrep,
  PostMeetingResponse,
  SourceRef,
} from '@da/domain';
import { postMeetingRequestSchema } from '@da/validation';
import type { MeetingApi } from '../../datasource';
import type { DemoContext } from '../context';
import { createApprovalCore } from '../core/approvals';
import { parseSchedule, stripPhrases } from '../core/dates';
import {
  findContactByEmail,
  findContactByName,
  getEvent,
  isUserEmail,
  threadSource,
  threadsForEmails,
} from '../core/lookup';
import { dayMonthLong, dueLabel, firstName, relativeDayLabel } from '../format';
import {
  CONTACT_MEHMET,
  EVENT_MEHMET_MEETING,
  POST_MEETING_NOTE_MEHMET,
  THREAD_HUKUK_SOZLESME,
  THREAD_MEHMET_TEKLIF_V2,
  THREAD_MEHMET_TOPLANTI,
} from '../ids';
import type { DemoState } from '../state';
import { capitalizeTr, fold } from '../text';
import { validate } from '../validate';

const DEFAULT_RECENT_HOURS = 3;

function commitmentsFor(
  s: DemoState,
  contact: Contact | undefined,
): { mine: Commitment[]; theirs: Commitment[] } {
  const open = s.commitments.filter(
    (c) => !c.deletedAt && (c.status === 'open' || c.status === 'postponed'),
  );
  const related = contact ? open.filter((c) => c.counterpartContactId === contact.id) : [];
  return {
    mine: related.filter((c) => c.direction === 'user_owes'),
    theirs: related.filter((c) => c.direction === 'other_owes'),
  };
}

function mehmetPrep(
  ctx: DemoContext,
  s: DemoState,
  event: CalendarEvent,
  generatedAt: string,
): MeetingPrep {
  const contact = s.contacts.find((c) => c.id === CONTACT_MEHMET) ?? null;
  const noteSource: SourceRef = {
    type: 'meeting_note',
    id: POST_MEETING_NOTE_MEHMET,
    label: 'Toplantı notu',
    person: 'Mehmet Yılmaz',
    timestamp: ctx.clock.lt(-4, '15:31'),
  };
  const teklifThread = s.threads.find((t) => t.id === THREAD_MEHMET_TEKLIF_V2);
  const rescheduleThread = s.threads.find((t) => t.id === THREAD_MEHMET_TOPLANTI);
  const hukukThread = s.threads.find((t) => t.id === THREAD_HUKUK_SOZLESME);
  const lastMeetingDay = dayMonthLong(ctx.clock.addDays(ctx.clock.today(), -4));
  const teklifDay = dayMonthLong(ctx.clock.addDays(ctx.clock.today(), -3));
  const { mine, theirs } = commitmentsFor(s, contact ?? undefined);
  return {
    eventId: event.id,
    event,
    primaryPerson: contact,
    purpose: 'Eylül teklifinin son hâlini netleştirmek ve Ekim teslimatı için onay almak.',
    lastContact: {
      at: ctx.clock.lt(-4, '15:31'),
      summary: `${lastMeetingDay} · Fiyat aralığı ve teslim süresi konuşuldu. Mehmet revize teklif istedi; sen Cuma göndereceğini söyledin.`,
      source: noteSource,
    },
    relevantEmails: [
      ...(teklifThread
        ? [
            {
              thread: teklifThread,
              why: teklifThread.lastFromUser
                ? 'Teklif v2 gönderildi (PDF) · yanıt bekleniyor'
                : 'Teklif v2 dizisinde yeni mesaj var',
            },
          ]
        : []),
      ...(rescheduleThread && !rescheduleThread.userMarkedDone
        ? [{ thread: rescheduleThread, why: "Toplantıyı 16:00'ya almak istiyor" }]
        : []),
    ],
    openLoops: [
      ...(hukukThread
        ? [{ text: 'Sözleşme taslağı hukuk yorumu bekliyor', source: threadSource(hukukThread) }]
        : []),
      { text: 'Nakliye maliyeti kimde?', source: noteSource },
    ],
    userCommitments: mine,
    theirCommitments: theirs,
    relevantFiles: teklifThread
      ? [
          {
            name: 'Teklif_v2.pdf',
            mimeType: 'application/pdf',
            source: threadSource(teklifThread, { label: 'Ek' }),
          },
        ]
      : [],
    talkingPoints: [
      {
        title: 'Revize fiyat',
        detail: "Revize teklif 17:00'ye kadar bekleniyor; %8 indirim sınırını netleştir.",
        source: noteSource,
      },
      {
        title: 'Teslim tarihi',
        detail: "Ekim başı için onay istiyor; üretim takvimi 6 Ekim'i gösteriyor.",
        source: teklifThread ? threadSource(teklifThread) : noteSource,
      },
      {
        title: 'Sözleşme maddesi',
        detail: 'Taslak 2 haftadır açık; hukuk yorumu bekliyor.',
        source: hukukThread ? threadSource(hukukThread) : noteSource,
      },
    ],
    twoMinuteSummary: `Mehmet ile en son ${lastMeetingDay}'de konuştunuz. Fiyat aralığını ve teslim süresini ele aldınız; Mehmet Ekim başı teslimat için revize teklif istedi, sen Cuma göndereceğini söyledin. Teklif v2'yi ${teklifDay}'de gönderdin; henüz yanıt gelmedi.\n\nTeklif v2'de fiyat ve teslim takvimi güncellendi. Bu, %8 indirim sınırını ve üretim takviminin gösterdiği 6 Ekim tarihini konuşmanı gerektiriyor.\n\nSözleşme taslağı iki haftadır hukuk yorumu bekliyor; Mehmet'in bunu sorması muhtemel. Nakliye maliyetinin kimde olacağı ilk görüşmede açık kalmıştı.`,
    travel: null,
    generatedAt,
    confidence: 0.9,
  };
}

function genericPrep(
  ctx: DemoContext,
  s: DemoState,
  event: CalendarEvent,
  generatedAt: string,
): MeetingPrep {
  const others = event.attendees.filter((a) =>
    !isUserEmail(s, a.email) && !a.isOrganizer === !event.organizerIsUser
      ? true
      : !isUserEmail(s, a.email),
  );
  const contacts = others
    .map(
      (a) =>
        (a.contactId ? s.contacts.find((c) => c.id === a.contactId) : undefined) ??
        findContactByEmail(s, a.email),
    )
    .filter((c): c is Contact => Boolean(c));
  const primary = contacts[0] ?? null;
  const emails = others.map((a) => a.email).filter((e): e is string => Boolean(e));
  const threads = threadsForEmails(s, emails).slice(0, 3);
  const { mine, theirs } = commitmentsFor(s, primary ?? undefined);
  const followUps = s.followUps.filter(
    (f) =>
      threads.some((t) => t.id === f.threadId) && f.status !== 'closed' && f.status !== 'replied',
  );
  const files = s.messages
    .filter((m) => threads.some((t) => t.id === m.threadId) && m.hasAttachments)
    .flatMap((m) =>
      m.attachments.map((a) => ({
        name: a.filename,
        mimeType: a.mimeType,
        source: { type: 'gmail' as const, id: m.threadId, label: 'Ek', timestamp: m.sentAt },
      })),
    );
  const talkingPoints = threads
    .flatMap((t) =>
      (t.analysis?.keyPoints ?? []).slice(0, 1).map((point) => ({
        title: point,
        detail: t.analysis?.summary ?? t.snippet,
        source: threadSource(t),
      })),
    )
    .slice(0, 3);
  if (!talkingPoints.length) {
    talkingPoints.push({
      title: event.title,
      detail:
        event.description ??
        'Gündem takvim davetinde belirtilmemiş; katılımcılarla amacı netleştir.',
      source: { type: event.source, id: event.id, label: 'Takvim', timestamp: event.startAt },
    });
  }
  const latest = threads[0];
  const who = primary ? firstName(primary.displayName) : (others[0]?.name ?? 'Katılımcılar');
  const summaryParts = [
    latest
      ? `${who} ile en son ${dayMonthLong(ctx.clock.dateKey(latest.lastMessageAt))}'de yazıştınız: ${latest.analysis?.summary ?? latest.snippet}`
      : `${who} ile kayıtlı bir yazışma bulunmuyor; hazırlık takvim davetine dayanıyor.`,
    event.description ? `Davet notu: ${event.description}.` : null,
    mine.length ? `Senin açık taahhüdün: ${mine.map((c) => c.text).join(', ')}.` : null,
    theirs.length ? `Beklediklerin: ${theirs.map((c) => c.text).join(', ')}.` : null,
  ].filter((p): p is string => Boolean(p));
  return {
    eventId: event.id,
    event,
    primaryPerson: primary,
    purpose: event.description ? event.description : `${event.title} için gündemi netleştirmek.`,
    lastContact: latest
      ? {
          at: latest.lastMessageAt,
          summary: latest.analysis?.summary ?? latest.snippet,
          source: threadSource(latest),
        }
      : null,
    relevantEmails: threads.map((t) => ({ thread: t, why: t.analysis?.summary ?? t.snippet })),
    openLoops: followUps.map((f) => ({
      text: `${f.counterpartName} · ${f.topic} yanıt bekliyor`,
      source: { ...f.source },
    })),
    userCommitments: mine,
    theirCommitments: theirs,
    relevantFiles: files.slice(0, 3),
    talkingPoints,
    twoMinuteSummary: summaryParts.join(' '),
    travel:
      event.location && !/online|meet|teams|zoom/i.test(event.location) && event.location !== 'Ofis'
        ? {
            leaveAt: ctx.clock.addMinutes(event.startAt, -40),
            durationMin: 40,
            provider: 'estimate',
          }
        : null,
    generatedAt,
    confidence: threads.length ? 0.78 : 0.55,
  };
}

interface ExtractedCommitment {
  text: string;
  quote: string;
  direction: 'user_owes' | 'other_owes';
  counterpartName: string | null;
  dueAt: string | null;
  dueText: string | null;
}

const USER_VERBS: Array<[string, string]> = [
  ['gonderecegim', 'gönder'],
  ['gonderirim', 'gönder'],
  ['yollayacagim', 'gönder'],
  ['yollarim', 'gönder'],
  ['arayacagim', 'ara'],
  ['ararim', 'ara'],
  ['paylasacagim', 'paylaş'],
  ['paylasirim', 'paylaş'],
  ['iletecegim', 'ilet'],
  ['iletirim', 'ilet'],
  ['hazirlayacagim', 'hazırla'],
  ['hazirlarim', 'hazırla'],
  ['isteyecegim', 'iste'],
  ['isterim', 'iste'],
  ['yazacagim', 'yaz'],
  ['soracagim', 'sor'],
  ['bitirecegim', 'bitir'],
  ['yapacagim', 'yap'],
  ['bakacagim', 'bak'],
  ['donecegim', 'dön'],
  ['donus yapacagim', 'dönüş yap'],
];
const OTHER_VERBS: Array<[string, string]> = [
  ['gonderecek', 'gönderecek'],
  ['yollayacak', 'gönderecek'],
  ['arayacak', 'arayacak'],
  ['paylasacak', 'paylaşacak'],
  ['iletecek', 'iletecek'],
  ['donecek', 'dönecek'],
  ['donus yapacak', 'dönüş yapacak'],
  ['hazirlayacak', 'hazırlayacak'],
];

export function extractCommitments(
  ctx: DemoContext,
  s: DemoState,
  text: string,
): ExtractedCommitment[] {
  const sentences = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: ExtractedCommitment[] = [];
  for (const sentence of sentences) {
    const folded = fold(sentence);
    const words = sentence.replace(/[.!?;]+$/, '').split(/\s+/);
    const foldedWords = words.map(fold);
    let direction: ExtractedCommitment['direction'] | null = null;
    let verbIndex = -1;
    let imperative = '';
    for (const [needle, base] of USER_VERBS) {
      const idx = foldedWords.findIndex((w) => w === needle || folded.includes(needle));
      if (idx >= 0 || folded.includes(needle)) {
        direction = 'user_owes';
        verbIndex = foldedWords.findIndex((w) => w.startsWith(needle.split(' ')[0] ?? needle));
        imperative = base;
        break;
      }
    }
    if (!direction) {
      for (const [needle, base] of OTHER_VERBS) {
        if (folded.includes(needle)) {
          direction = 'other_owes';
          verbIndex = foldedWords.findIndex((w) => w.startsWith(needle.split(' ')[0] ?? needle));
          imperative = base;
          break;
        }
      }
    }
    if (!direction) continue;
    const schedule = parseSchedule(sentence, ctx.clock, { defaultTime: '18:00' });
    const contact = findContactByName(s, sentence);
    const counterpartWord = words.find(
      (w) =>
        /['’](e|a|ye|ya|ten|tan|den|dan)$/i.test(w) ||
        (/(tan|ten|dan|den)$/i.test(w) && w.length > 5),
    );
    const counterpartName =
      contact?.displayName ??
      (counterpartWord
        ? capitalizeTr(counterpartWord.replace(/['’].*$/, '').replace(/(tan|ten|dan|den)$/i, ''))
        : null);
    let body = words.filter((_, i) => i !== verbIndex).join(' ');
    body = stripPhrases(body, schedule.phrases)
      .replace(/\b(kadar|için|bana|lütfen)\b/gi, ' ')
      .replace(/[.!?;]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const textOut =
      direction === 'user_owes'
        ? `${body} ${imperative}`.trim()
        : `${counterpartName ?? 'Karşı taraf'} ${body.replace(counterpartName ?? '', '').trim()} ${imperative}`
            .replace(/\s+/g, ' ')
            .trim();
    out.push({
      text: capitalizeTr(textOut),
      quote: sentence.replace(/[.!?;]+$/, ''),
      direction,
      counterpartName,
      dueAt: schedule.iso,
      dueText: schedule.text ? schedule.text.toLowerCase() : null,
    });
  }
  return out;
}

export function createMeetingApi(ctx: DemoContext): MeetingApi {
  return {
    getMeetingPrep: (eventId, opts) =>
      ctx.run((): MeetingPrep => {
        const s = ctx.store.state;
        const event = getEvent(s, eventId);
        const now = ctx.nowIso();
        const generatedAt =
          opts?.regenerate || !event.prepGeneratedAt ? now : event.prepGeneratedAt;
        ctx.store.mutate((st) => {
          const e = st.events.find((x) => x.id === eventId);
          if (e) e.prepGeneratedAt = generatedAt;
        });
        const prep =
          event.id === EVENT_MEHMET_MEETING
            ? mehmetPrep(ctx, s, event, generatedAt)
            : genericPrep(ctx, s, event, generatedAt);
        return prep;
      }),
    submitPostMeeting: (input) =>
      ctx.run((): PostMeetingResponse => {
        const clean = validate(postMeetingRequestSchema, input);
        const s = ctx.store.state;
        const event = getEvent(s, clean.eventId);
        const extracted = extractCommitments(ctx, s, clean.text);
        const noteId = ctx.nextId();
        const now = ctx.nowIso();
        const noteSource: SourceRef = {
          type: 'meeting_note',
          id: noteId,
          label: 'Toplantı notu',
          person: event.attendees.find((a) => !isUserEmail(s, a.email))?.name ?? undefined,
          timestamp: now,
          excerpt: clean.text.slice(0, 200),
        };
        const proposals = extracted.map((c, index) => {
          const approval = createApprovalCore(ctx, {
            type: 'commitment_create',
            what: c.text,
            why: `“${c.quote}” dedin.`,
            changeSummary: [
              `Taahhüt: ${c.text}`,
              ...(c.dueText
                ? [
                    `Ne zaman: ${c.dueText}${c.dueAt ? ` (${relativeDayLabel(ctx.clock, c.dueAt)})` : ''}`,
                  ]
                : []),
              ...(c.counterpartName ? [`Kime: ${c.counterpartName}`] : []),
            ],
            payload: {
              text: c.text,
              direction: c.direction,
              counterpartName: c.counterpartName,
              dueAt: c.dueAt,
              dueText: c.dueText,
              quote: c.quote,
              relatedEventId: event.id,
            },
            source: noteSource,
            requestedBy: 'post_meeting',
            idempotencyKey: `commitment_create:${event.id}:${noteId}:${index}`,
          });
          const contact = c.counterpartName ? findContactByName(s, c.counterpartName) : undefined;
          return {
            approvalId: approval.id,
            commitment: {
              text: c.text,
              quote: c.quote,
              direction: c.direction,
              counterpartName: c.counterpartName,
              counterpartContactId: contact?.id ?? null,
              dueAt: c.dueAt,
              dueText: c.dueText ?? (c.dueAt ? dueLabel(ctx.clock, c.dueAt) : null),
              status: 'proposed' as const,
              source: noteSource,
              confidence: 0.85,
              completedAt: null,
              postponedUntil: null,
              relatedEventId: event.id,
              deletedAt: null,
            },
          };
        });
        ctx.store.mutate((st) => {
          st.postMeetingNotes.push({
            id: noteId,
            userId: ctx.userId,
            eventId: event.id,
            text: clean.text,
            inputMode: clean.inputMode,
            extractedCommitmentIds: [],
            createdAt: now,
            updatedAt: now,
          });
          const e = st.events.find((x) => x.id === event.id);
          if (e) {
            e.postMeetingHandledAt = now;
            e.updatedAt = now;
          }
          st.memory.push({
            id: ctx.nextId(),
            userId: ctx.userId,
            sourceType: 'meeting_note',
            sourceId: noteId,
            source: noteSource,
            content: `${event.title} sonrası not: ${clean.text}`,
            topic: event.title,
            personName: noteSource.person ?? null,
            contactId: event.attendees.find((a) => a.contactId)?.contactId ?? null,
            occurredAt: now,
            hasEmbedding: false,
            tokenCount: Math.ceil(clean.text.length / 4),
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
          });
        });
        return { proposals };
      }),
    markPostMeetingHandled: (eventId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const e = getEvent(s, eventId);
          e.postMeetingHandledAt = ctx.nowIso();
          e.updatedAt = e.postMeetingHandledAt;
        });
      }),
    listRecentlyEndedMeetings: (input) =>
      ctx.run(() => {
        const hours = input?.hours ?? DEFAULT_RECENT_HOURS;
        const now = ctx.clock.now().getTime();
        const from = now - hours * 60 * 60_000;
        return ctx.store.state.events
          .filter(
            (e) =>
              !e.deletedAt &&
              e.status !== 'cancelled' &&
              !e.allDay &&
              !e.postMeetingHandledAt &&
              Date.parse(e.endAt) <= now &&
              Date.parse(e.endAt) >= from,
          )
          .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))
          .map((e) => ({ ...e }));
      }),
  };
}
