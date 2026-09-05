/**
 * Schedule suggestions: place tasks into free blocks, add prep time / buffers, move one side of a
 * conflict. Proposed times must lie inside the free blocks we supply; `suggestionsInsideFreeBlocks`
 * enforces that deterministically after the model answers.
 */
import type { Importance } from '@da/domain';
import { scheduleSuggestionAiSchema, type ScheduleSuggestionAi } from '@da/validation';
import { PROMPT_CHAR_LIMITS } from '../redact';
import type { PromptSpec } from '../types';
import { DEFAULT_PROMPT_TIMEZONE, bullets, capList, clipInline, composeSystem, formatPromptTime, joinLines, temporalContext, type PromptBase } from './shared';

export interface ScheduleFreeBlock {
  startAt: string;
  endAt: string;
  minutes: number;
}

export interface ScheduleSuggestionInput extends PromptBase {
  /** Local date the plan is for (YYYY-MM-DD). */
  date: string;
  workHours?: { start: string; end: string };
  events: { id: string; title: string; startAt: string; endAt: string; location?: string | null; attendeeCount?: number }[];
  tasks: { id: string; title: string; dueAt?: string | null; estimatedMinutes?: number | null; priority?: Importance }[];
  /** Open commitments with a due date that may deserve a time block. */
  commitments?: { id: string; text: string; dueAt?: string | null; counterpart?: string | null }[];
  freeBlocks: ScheduleFreeBlock[];
  conflicts?: { eventAId: string; eventBId: string; overlapMinutes: number }[];
  travel?: { eventId: string; leaveAt: string; durationMin: number }[];
}

/** Assumed task length when `estimatedMinutes` is missing (module-private; the calendar module owns the shared default). */
const DEFAULT_TASK_MINUTES = 45;

export function scheduleSuggestion(input: ScheduleSuggestionInput): PromptSpec<ScheduleSuggestionAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const perItem = PROMPT_CHAR_LIMITS.schedule_suggestion;
  const system = composeSystem({
    locale,
    role: en
      ? 'You propose small, concrete calendar improvements: place a task or commitment into a free block, add prep time or a buffer, or move one side of a conflict. Every proposal is shown to the user for approval; nothing is written by you.'
      : 'Küçük ve somut takvim iyileştirmeleri öneriyorsun: bir görevi ya da taahhüdü boş bir bloğa yerleştir, hazırlık süresi ya da tampon ekle, bir çakışmanın bir tarafını taşı. Her öneri kullanıcıya onay için gösterilir; sen hiçbir şey yazmazsın.',
    rules: [
      en
        ? 'proposedStartAt/proposedEndAt must lie entirely inside one of the given free blocks. Never propose a time outside the free blocks, even for move_event; if no free block fits, do not make the suggestion.'
        : 'proposedStartAt/proposedEndAt tümüyle verilen boş blokların birinin içinde olmalı. move_event dahil hiçbir öneride boş blokların dışına çıkma; uygun boş blok yoksa öneriyi yapma.',
      en ? 'targetEventId / targetTaskId must be ids from the lists; never invent an item.' : "targetEventId / targetTaskId listelerdeki id'lerden olmalı; öğe uydurma.",
      en
        ? 'Respect due dates and work hours; leave 10-15 minute buffers between back-to-back meetings when you suggest one.'
        : 'Son tarihlere ve çalışma saatlerine uy; art arda toplantılar için 10-15 dakikalık tampon öner.',
      en
        ? `Use the task's estimatedMinutes when given; otherwise assume ${DEFAULT_TASK_MINUTES} minutes and say so in reason.`
        : `Görevin estimatedMinutes değeri varsa onu kullan; yoksa ${DEFAULT_TASK_MINUTES} dakika varsay ve bunu reason alanında belirt.`,
      en
        ? 'title like "2.5 hours free tomorrow 14:00–16:30"; detail says what you would place there; reason explains why. Timestamps as ISO 8601 UTC. At most 5 suggestions; an empty list is fine.'
        : 'title "Yarın 14:00–16:30 arasında 2,5 saat boşluğun var." gibi; detail oraya ne koyacağını, reason nedenini söyler. Zaman damgaları ISO 8601 UTC. En fazla 5 öneri; boş liste olabilir.',
    ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          `${en ? 'Plan date' : 'Plan tarihi'}: ${input.date}`,
          input.workHours ? `${en ? 'Work hours' : 'Çalışma saatleri'}: ${input.workHours.start}–${input.workHours.end}` : null,
        ]),
      },
    ],
  });
  const events = capList(input.events, 25, locale);
  const tasks = capList(input.tasks, 15, locale);
  const commitments = capList(input.commitments ?? [], 10, locale);
  const blocks = capList(input.freeBlocks, 12, locale);
  const context = joinLines([
    en ? 'Events:' : 'Etkinlikler:',
    ...events.items.map(
      (e) =>
        `[${e.id}] ${e.startAt} → ${e.endAt} (${formatPromptTime(e.startAt, tz)}–${formatPromptTime(e.endAt, tz)}) · ${clipInline(e.title, perItem)}${e.attendeeCount ? ` · ${e.attendeeCount} ${en ? 'attendees' : 'katılımcı'}` : ''}${e.location ? ` · ${clipInline(e.location, 60)}` : ''}`,
    ),
    events.note,
    events.items.length === 0 ? (en ? '(no events)' : '(etkinlik yok)') : null,
    '',
    en ? 'Tasks:' : 'Görevler:',
    ...tasks.items.map(
      (t) =>
        `[${t.id}] ${clipInline(t.title, perItem)}${t.dueAt ? ` · ${en ? 'due' : 'son'} ${t.dueAt}` : ''}${t.estimatedMinutes ? ` · ${t.estimatedMinutes} ${en ? 'min' : 'dk'}` : ''}${t.priority ? ` · ${t.priority}` : ''}`,
    ),
    tasks.note,
    tasks.items.length === 0 ? (en ? '(no tasks)' : '(görev yok)') : null,
    commitments.items.length ? '' : null,
    commitments.items.length ? (en ? 'Commitments:' : 'Taahhütler:') : null,
    ...commitments.items.map(
      (c) => `[${c.id}] ${clipInline(c.text, perItem)}${c.dueAt ? ` · ${en ? 'due' : 'son'} ${c.dueAt}` : ''}${c.counterpart ? ` · ${clipInline(c.counterpart, 60)}` : ''}`,
    ),
    commitments.note,
    '',
    en ? 'Free blocks:' : 'Boş bloklar:',
    ...blocks.items.map((b) => `${b.startAt} → ${b.endAt} (${formatPromptTime(b.startAt, tz)}–${formatPromptTime(b.endAt, tz)}, ${b.minutes} ${en ? 'min' : 'dk'})`),
    blocks.note,
    blocks.items.length === 0 ? (en ? '(no free blocks — return an empty list)' : '(boş blok yok — boş liste döndür)') : null,
    input.conflicts?.length
      ? `\n${en ? 'Conflicts' : 'Çakışmalar'}:\n${bullets(input.conflicts.slice(0, 8).map((c) => `${c.eventAId} × ${c.eventBId} · ${c.overlapMinutes} ${en ? 'min overlap' : 'dk çakışma'}`))}`
      : null,
    input.travel?.length
      ? `\n${en ? 'Travel' : 'Yol'}:\n${bullets(input.travel.slice(0, 8).map((t) => `${t.eventId} · ${en ? 'leave at' : 'çıkış'} ${t.leaveAt} · ${t.durationMin} ${en ? 'min' : 'dk'}`))}`
      : null,
  ]);
  return {
    purpose: 'schedule_suggestion',
    tier: 'small',
    locale,
    system,
    user: en ? 'Propose schedule improvements for the plan below.' : 'Aşağıdaki plan için takvim önerileri üret.',
    context,
    schema: scheduleSuggestionAiSchema,
    maxOutputTokens: 1200,
    temperature: 0.2,
  };
}

type ScheduleSuggestionItem = ScheduleSuggestionAi['suggestions'][number];

/** True when [startAt, endAt) is well-formed and fully contained in one of the free blocks. */
export function isInsideFreeBlocks(startAt: string, endAt: string, freeBlocks: readonly ScheduleFreeBlock[]): boolean {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  return freeBlocks.some((b) => {
    const bs = Date.parse(b.startAt);
    const be = Date.parse(b.endAt);
    return !Number.isNaN(bs) && !Number.isNaN(be) && start >= bs && end <= be;
  });
}

export interface FreeBlockFilterResult {
  kept: ScheduleSuggestionItem[];
  /** Suggestions the model placed outside the free blocks or on unknown ids — never shown to the user. */
  dropped: { suggestion: ScheduleSuggestionItem; reason: 'outside_free_blocks' | 'unknown_event' | 'unknown_task' }[];
}

/**
 * Deterministic guard applied to the model output: keeps only suggestions whose proposed window is
 * inside a supplied free block and whose target ids exist. Model text is never trusted for time.
 */
export function suggestionsInsideFreeBlocks(
  suggestions: readonly ScheduleSuggestionItem[],
  freeBlocks: readonly ScheduleFreeBlock[],
  known?: { eventIds?: readonly string[]; taskIds?: readonly string[] },
): FreeBlockFilterResult {
  const eventIds = known?.eventIds ? new Set(known.eventIds) : null;
  const taskIds = known?.taskIds ? new Set(known.taskIds) : null;
  const result: FreeBlockFilterResult = { kept: [], dropped: [] };
  for (const suggestion of suggestions) {
    if (!isInsideFreeBlocks(suggestion.proposedStartAt, suggestion.proposedEndAt, freeBlocks)) {
      result.dropped.push({ suggestion, reason: 'outside_free_blocks' });
      continue;
    }
    if (eventIds && suggestion.targetEventId && !eventIds.has(suggestion.targetEventId)) {
      result.dropped.push({ suggestion, reason: 'unknown_event' });
      continue;
    }
    if (taskIds && suggestion.targetTaskId && !taskIds.has(suggestion.targetTaskId)) {
      result.dropped.push({ suggestion, reason: 'unknown_task' });
      continue;
    }
    result.kept.push(suggestion);
  }
  return result;
}
