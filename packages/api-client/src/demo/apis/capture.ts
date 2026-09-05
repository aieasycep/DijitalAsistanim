import type { Capture, CaptureAnalysis, SuggestedAction } from '@da/domain';
import { captureCreateRequestSchema } from '@da/validation';
import type { CaptureApi } from '../../datasource';
import { ClientApiError } from '../../errors';
import type { DemoContext } from '../context';
import { eventsOnDay } from '../core/calendar';
import { parseSchedule, stripPhrases } from '../core/dates';
import { findContactByName } from '../core/lookup';
import { dueLabel } from '../format';
import { sleep } from '../latency';
import type { DemoState } from '../state';
import { capitalizeTr, fold, truncate } from '../text';
import { notFound, validate } from '../validate';

const CAPTURE_QUOTA_PRO = 100;

function getCapture(s: DemoState, id: string): Capture {
  const capture = s.captures.find((c) => c.id === id && !c.deletedAt);
  if (!capture) throw notFound('Yakalama', id);
  return capture;
}

function leaveNote(ctx: DemoContext, startAt: string): string {
  const day = ctx.clock.dateKey(startAt);
  const busy = eventsOnDay(ctx.store.state, ctx.clock, day).filter(
    (e) => Math.abs(Date.parse(e.startAt) - Date.parse(startAt)) < 3 * 60 * 60_000,
  );
  const leave = ctx.clock.hhmm(ctx.clock.addMinutes(startAt, -50));
  return `${busy.length ? `O akşam takviminde ${busy[0]?.title} var.` : 'O akşam takvimin boş.'} ${leave}'da çıkman gerekebilir.`;
}

function concertAnalysis(ctx: DemoContext, source: 'image' | 'link'): CaptureAnalysis {
  const sched = parseSchedule('12 Eylül 20:00', ctx.clock, { defaultTime: '20:00' });
  const startAt = sched.iso ?? ctx.nowIso();
  const endAt = ctx.clock.addMinutes(startAt, 120);
  const title = 'Konser · Zorlu PSM';
  const actions: SuggestedAction[] = [
    {
      kind: 'add_to_calendar',
      label: 'Takvime Ekle',
      payload: { title, startAt, endAt, location: 'Zorlu PSM' },
    },
    {
      kind: 'remind',
      label: 'Hatırlat',
      payload: { remindAt: ctx.clock.addMinutes(startAt, -50), title },
    },
  ];
  const extra = source === 'link' ? " Bilet satışı 8 Eylül 10:00'da açılıyor." : '';
  return {
    detectedType: 'event',
    title,
    summary: `${leaveNote(ctx, startAt)}${extra}`,
    event: { title, startAt, endAt, location: 'Zorlu PSM', dateText: '12 Eylül · 20:00' },
    keyPoints: [
      '12 Eylül',
      '20:00',
      'Zorlu PSM',
      ...(source === 'link' ? ['2 bilet · 1.450 TL'] : []),
    ],
    dates: [{ text: '12 Eylül 20:00', iso: startAt }],
    suggestedActions: actions,
    confidence: 0.91,
  };
}

function billAnalysis(ctx: DemoContext): CaptureAnalysis {
  const due = parseSchedule('15 Eylül', ctx.clock, { defaultTime: '23:59' });
  const dueAt = due.iso ?? ctx.nowIso();
  const remindAt = parseSchedule('13 Eylül 10:00', ctx.clock).iso ?? dueAt;
  return {
    detectedType: 'payment',
    title: 'Elektrik · CK Enerji',
    summary: 'Son ödeme 15 Eylül · Abone no ···· 4821',
    payment: { payee: 'CK Enerji', amount: 1842, currency: 'TRY', dueAt },
    deadline: { title: 'Elektrik faturası son ödeme', dueAt, dueText: '15 Eylül' },
    keyPoints: ['1.842 TL', 'Son ödeme 15 Eylül', 'Abone no ···· 4821'],
    dates: [{ text: '15 Eylül', iso: dueAt }],
    suggestedActions: [
      {
        kind: 'remind',
        label: 'Hatırlat',
        payload: {
          remindAt,
          title: 'Elektrik faturası · 1.842 TL',
          smartReason: 'Takvimine göre: 13 Eylül 10:00',
        },
      },
      { kind: 'pay', label: 'Öde', payload: { amount: 1842, currency: 'TRY', payee: 'CK Enerji' } },
    ],
    confidence: 0.9,
  };
}

function contractAnalysis(ctx: DemoContext): CaptureAnalysis {
  const sign = parseSchedule('19 Eylül', ctx.clock, { defaultTime: '18:00' }).iso ?? ctx.nowIso();
  const legal = parseSchedule('12 Eylül', ctx.clock, { defaultTime: '18:00' }).iso ?? ctx.nowIso();
  const meeting = parseSchedule('17 Eylül 11:00', ctx.clock).iso ?? ctx.nowIso();
  const block = parseSchedule('10 Eylül 14:00', ctx.clock).iso ?? ctx.nowIso();
  const signReminder = parseSchedule('18 Eylül 09:10', ctx.clock).iso ?? sign;
  return {
    detectedType: 'deadline',
    title: 'Hizmet Sözleşmesi · Yılmaz Endüstri',
    summary: 'Taraflar, 12 aylık hizmet, 3 tarih ve 1 yükümlülük bulundu.',
    deadline: { title: 'İmza için son gün', dueAt: sign, dueText: '19 Eylül' },
    task: { title: 'Hukuktan 4. madde yorumu iste', dueAt: legal },
    event: {
      title: 'Sözleşme görüşmesi',
      startAt: meeting,
      endAt: ctx.clock.addMinutes(meeting, 60),
      location: null,
      dateText: '17 Eylül 11:00',
    },
    person: { name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com', company: 'Yılmaz Endüstri' },
    keyPoints: [
      'İmza için son gün · 19 Eylül (s.14, madde 9.2)',
      "Hukuktan 4. madde yorumu iste · 12 Eylül'e kadar (s.3, cezai şart maddesi)",
      'Sözleşme görüşmesi · 17 Eylül 11:00 (s.9 · o saat takvimin boş)',
      '12 aylık hizmet süresi',
    ],
    dates: [
      { text: '19 Eylül', iso: sign },
      { text: '12 Eylül', iso: legal },
      { text: '17 Eylül 11:00', iso: meeting },
    ],
    suggestedActions: [
      {
        kind: 'add_to_calendar',
        label: 'Takvime Ekle',
        payload: {
          title: 'Sözleşme görüşmesi',
          startAt: meeting,
          endAt: ctx.clock.addMinutes(meeting, 60),
        },
      },
      {
        kind: 'create_task',
        label: 'Görev Oluştur',
        payload: {
          title: 'Hukuktan 4. madde yorumu iste',
          dueAt: legal,
          scheduledStartAt: block,
          scheduledEndAt: ctx.clock.addMinutes(block, 60),
        },
      },
      {
        kind: 'remind',
        label: 'Hatırlat',
        payload: {
          title: 'İmza son günü · 19 Eyl',
          remindAt: signReminder,
          smartReason: 'Uygun zamanda: 18 Eyl 09:10',
        },
      },
    ],
    confidence: 0.87,
  };
}

function linkAnalysis(ctx: DemoContext, url: string): CaptureAnalysis {
  let host = url;
  let path = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, '');
    path = parsed.pathname;
  } catch {
    host = url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
  const foldedPath = fold(path);
  if (/(konser|zorlu)/.test(foldedPath)) return concertAnalysis(ctx, 'link');
  if (/(etkinlik|bilet|event)/.test(foldedPath)) {
    const slug = path.split('/').filter(Boolean).pop() ?? '';
    const sched = parseSchedule(slug.replace(/-/g, ' '), ctx.clock, { defaultTime: '19:00' });
    const words = stripPhrases(slug.replace(/-/g, ' '), sched.phrases)
      .split(' ')
      .filter(Boolean)
      .map(capitalizeTr);
    const title = words.join(' ') || host;
    return {
      detectedType: 'event',
      title,
      summary: sched.iso
        ? `${host} bağlantısında etkinlik bulundu: ${title} · ${dueLabel(ctx.clock, sched.iso)}.`
        : `${host} bağlantısında etkinlik bulundu; tarih sayfa adresinde belirtilmemiş.`,
      event: {
        title,
        startAt: sched.iso,
        endAt: sched.iso ? ctx.clock.addMinutes(sched.iso, 120) : null,
        location: null,
        dateText: sched.text,
      },
      keyPoints: [title, ...(sched.text ? [sched.text] : [])],
      dates: sched.phrases.map((p) => ({ text: p.text, iso: p.iso })),
      suggestedActions: sched.iso
        ? [
            {
              kind: 'add_to_calendar',
              label: 'Takvime Ekle',
              payload: { title, startAt: sched.iso, endAt: ctx.clock.addMinutes(sched.iso, 120) },
            },
          ]
        : [{ kind: 'open_link', label: 'Bağlantıyı Aç', payload: { url } }],
      confidence: sched.iso ? 0.72 : 0.5,
    };
  }
  return {
    detectedType: 'note',
    title: host,
    summary: `${host} adresindeki bağlantı kaydedildi. Sayfa içeriğinden tarih veya görev çıkarılamadı.`,
    keyPoints: [url],
    dates: [],
    suggestedActions: [{ kind: 'open_link', label: 'Bağlantıyı Aç', payload: { url } }],
    confidence: 0.6,
  };
}

/** Folded (accent-free, lower-case) words that mark a clause with a date as a calendar event rather than a task. */
const EVENT_WORDS =
  /(kahve|toplanti|randevu|gorusme|yemek|bulusma|etkinlik|konser|bilet|sinema|tiyatro|mac\b|konferans|seminer|dugun|webinar)/;
const TASK_VERB = /\b(bitir|hazirla|gonder|ara|yaz|oku|kontrol et|iste|tamamla|yap|sor|ilet)$/;

function turkishCount(n: number): string {
  return ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş'][n] ?? String(n);
}

function textAnalysis(ctx: DemoContext, s: DemoState, text: string): CaptureAnalysis {
  const clauses = text
    .split(/[.;\n]+|,\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
  let event: CaptureAnalysis['event'] = null;
  let task: CaptureAnalysis['task'] = null;
  let person: CaptureAnalysis['person'] = null;
  let reminder: { title: string; remindAt: string; note: string } | null = null;
  const dates: CaptureAnalysis['dates'] = [];
  const keyPoints: string[] = [];
  const notes: string[] = [];
  for (const clause of clauses) {
    const folded = fold(clause);
    const sched = parseSchedule(clause, ctx.clock, { defaultTime: '10:00' });
    for (const p of sched.phrases) dates.push({ text: p.text, iso: p.iso });
    if (folded.includes('hatirlat')) {
      const remindAt =
        sched.iso ??
        (event?.startAt
          ? ctx.clock.addMinutes(event.startAt, -60)
          : ctx.clock.atIso(ctx.clock.addDays(ctx.clock.today(), 1), '09:10'));
      const subject = task?.title ?? event?.title ?? 'Not';
      reminder = {
        title: `${subject} için hatırlat`,
        remindAt,
        note:
          sched.time === '19:00'
            ? '“Akşam” = 19:00 (brifing saatin)'
            : (sched.text ?? 'Zaman belirtilmedi'),
      };
      keyPoints.push(`Hatırlatıcı · ${dueLabel(ctx.clock, remindAt)}`);
      continue;
    }
    if (TASK_VERB.test(folded.replace(/[.!?]+$/, ''))) {
      const cleaned = stripPhrases(clause, sched.phrases)
        .replace(/^(oncesinde|öncesinde|sonrasında|sonrasinda|ayrıca|ayrica)\s+/i, '')
        .trim();
      const before = /^(oncesinde|öncesinde)/i.test(clause.trim());
      const dueAt =
        sched.iso ?? (before && event?.startAt ? ctx.clock.addMinutes(event.startAt, -60) : null);
      task = { title: capitalizeTr(cleaned), dueAt };
      keyPoints.push(`Görev · ${task.title}${dueAt ? ` · ${dueLabel(ctx.clock, dueAt)}` : ''}`);
      if (before && event)
        notes.push(
          `${task.title.split(' ')[0]} görevini ${event.title.split(' ').slice(-1)[0]}den 1 saat önceye koydum.`,
        );
      continue;
    }
    const withMatch = clause.match(/(\S+)\s+ile\b/i);
    if (withMatch?.[1]) {
      const rawName = withMatch[1].replace(/['’].*$/, '');
      const contact = findContactByName(s, rawName);
      person = contact
        ? { name: contact.displayName, email: contact.emails[0] ?? null }
        : { name: capitalizeTr(rawName) };
    }
    if (sched.iso && (withMatch || EVENT_WORDS.test(folded))) {
      const title = capitalizeTr(stripPhrases(clause, sched.phrases).trim() || 'Etkinlik');
      event = {
        title,
        startAt: sched.iso,
        endAt: ctx.clock.addMinutes(sched.iso, 60),
        location: null,
        dateText: sched.text,
      };
      keyPoints.push(`Takvim olayı · ${title} · ${dueLabel(ctx.clock, sched.iso)}`);
      continue;
    }
    if (sched.iso && !event && !task) {
      keyPoints.push(`Tarih · ${sched.text ?? dueLabel(ctx.clock, sched.iso)}`);
      continue;
    }
    keyPoints.push(truncate(clause, 80));
  }
  const actions: SuggestedAction[] = [];
  if (event)
    actions.push({
      kind: 'add_to_calendar',
      label: 'Takvime Ekle',
      payload: {
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        attendee: person?.email ?? null,
      },
    });
  if (task)
    actions.push({
      kind: 'create_task',
      label: 'Görev Oluştur',
      payload: { title: task.title, dueAt: task.dueAt },
    });
  if (reminder)
    actions.push({
      kind: 'remind',
      label: 'Hatırlat',
      payload: { title: reminder.title, remindAt: reminder.remindAt },
    });
  const counts = [
    event ? 'bir takvim olayı' : null,
    task ? 'bir görev' : null,
    reminder ? 'bir hatırlatıcı' : null,
  ].filter((x): x is string => Boolean(x));
  const summary = counts.length
    ? `${capitalizeTr(counts.length === 1 ? (counts[0] ?? '') : `${counts.slice(0, -1).join(', ')} ve ${counts[counts.length - 1]}`)}. ${notes.join(' ')}`.trim()
    : 'Not olarak kaydettim; tarih veya görev bulamadım.';
  const detectedType: CaptureAnalysis['detectedType'] = event
    ? 'event'
    : task
      ? 'task'
      : reminder
        ? 'deadline'
        : 'note';
  const itemCount = counts.length;
  return {
    detectedType,
    title: event?.title ?? task?.title ?? reminder?.title ?? truncate(text, 60),
    summary: itemCount
      ? `${summary} (${turkishCount(itemCount)} öğe)`.replace(' (bir öğe)', '')
      : summary,
    event,
    task,
    person,
    deadline: reminder
      ? { title: reminder.title, dueAt: reminder.remindAt, dueText: reminder.note }
      : null,
    keyPoints,
    dates,
    suggestedActions: actions,
    confidence: itemCount ? 0.82 : 0.5,
  };
}

function analyze(ctx: DemoContext, s: DemoState, capture: Capture): CaptureAnalysis {
  const hint = fold(`${capture.storagePath ?? ''} ${capture.mimeType ?? ''}`);
  switch (capture.kind) {
    case 'image':
      return /(fatura|invoice|bill)/.test(hint) ? billAnalysis(ctx) : concertAnalysis(ctx, 'image');
    case 'pdf':
      return /(fatura|invoice)/.test(hint) ? billAnalysis(ctx) : contractAnalysis(ctx);
    case 'file':
      return /pdf/.test(hint)
        ? contractAnalysis(ctx)
        : {
            detectedType: 'note',
            title: capture.storagePath?.split('/').pop() ?? 'Dosya',
            summary: 'Dosya kaydedildi; bu dosya türünden tarih veya görev çıkarılamadı.',
            keyPoints: [],
            dates: [],
            suggestedActions: [],
            confidence: 0.4,
          };
    case 'link':
      return linkAnalysis(ctx, capture.url ?? '');
    case 'text':
      return textAnalysis(ctx, s, capture.originalText ?? '');
    case 'audio':
      return {
        detectedType: 'note',
        title: 'Ses kaydı',
        summary:
          'Ses kaydı cihaz üstü tanıma ile metne dönüştürülmeli; sunucu tarafında ses analiz edilmez.',
        keyPoints: [],
        dates: [],
        suggestedActions: [],
        confidence: 0.3,
      };
  }
}

export function createCaptureApi(ctx: DemoContext): CaptureApi {
  return {
    uploadCaptureFile: (input) =>
      ctx.run(() => {
        const safeName = input.fileName.replace(/[^\w.\-çğıöşüÇĞİÖŞÜ]+/g, '_');
        return { storagePath: `${ctx.userId}/${ctx.clock.now().getTime()}-${safeName}` };
      }),
    createCapture: (req) =>
      ctx.run(() => {
        const clean = validate(captureCreateRequestSchema, req);
        return ctx.store.mutate((s): Capture => {
          const today = ctx.clock.today();
          if (s.usage.date !== today) s.usage = { date: today, assistantQueries: 0, captures: 0 };
          if (s.usage.captures >= CAPTURE_QUOTA_PRO)
            throw new ClientApiError(
              { code: 'quota_exceeded', message: 'Günlük yakalama kotası doldu.' },
              429,
            );
          s.usage.captures += 1;
          const now = ctx.nowIso();
          const capture: Capture = {
            id: ctx.nextId(),
            userId: ctx.userId,
            kind: clean.kind,
            status: 'uploaded',
            storagePath: clean.storagePath ?? null,
            mimeType: clean.mimeType ?? null,
            sizeBytes: clean.sizeBytes ?? null,
            originalText: clean.text ?? null,
            url: clean.url ?? null,
            extractedText: null,
            analysis: null,
            failureReason: null,
            origin: clean.origin,
            approvalIds: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          s.captures.push(capture);
          return { ...capture };
        });
      }),
    analyzeCapture: (id) =>
      ctx.run(async () => {
        ctx.store.mutate((s) => {
          const c = getCapture(s, id);
          if (c.status === 'analyzed') return;
          c.status = 'analyzing';
          c.updatedAt = ctx.nowIso();
        });
        await sleep(ctx.timings.captureAnalyzeMs);
        return ctx.store.mutate((s): Capture => {
          const c = getCapture(s, id);
          if (c.status !== 'analyzed') {
            c.analysis = analyze(ctx, s, c);
            c.extractedText =
              c.kind === 'text'
                ? c.originalText
                : c.kind === 'link'
                  ? c.url
                  : `${c.analysis.title} · ${c.analysis.keyPoints.join(' · ')}`;
            c.status = 'analyzed';
            c.updatedAt = ctx.nowIso();
          }
          return { ...c };
        });
      }),
    getCapture: (id) => ctx.run(() => ({ ...getCapture(ctx.store.state, id) })),
    listCaptures: () =>
      ctx.run(() =>
        ctx.store.state.captures
          .filter((c) => !c.deletedAt)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((c) => ({ ...c })),
      ),
    deleteCapture: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const c = getCapture(s, id);
          c.deletedAt = ctx.nowIso();
          c.updatedAt = c.deletedAt;
        });
      }),
  };
}
