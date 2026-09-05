/**
 * Suggested questions for the assistant screen, built from a compact picture of today (counts,
 * top people, upcoming meetings, open loops, deadlines). The contact-scoped variant only proposes
 * questions about that person.
 */
import type { BriefingCounts } from '@da/domain';
import { suggestedQuestionsAiSchema } from '@da/validation';
import type { z } from 'zod';
import { PROMPT_CHAR_LIMITS } from '../redact';
import type { PromptSpec } from '../types';
import { DEFAULT_PROMPT_TIMEZONE, bullets, clipInline, composeSystem, formatPromptTime, joinLines, temporalContext, type PromptBase } from './shared';

export type SuggestedQuestionsAi = z.infer<typeof suggestedQuestionsAiSchema>;

export interface SuggestedQuestionsContact {
  name: string;
  company?: string | null;
  relation?: string | null;
  lastContact?: { at: string; summary: string } | null;
  /** Open commitments with this person. */
  userOwes?: string[];
  theyOwe?: string[];
}

export interface SuggestedQuestionsInput extends PromptBase {
  userName: string;
  /** Today's counters as shown in the briefing subline. */
  counts?: Partial<BriefingCounts> | null;
  /** People the user interacted with most recently / most often. */
  topPeople?: { name: string; count?: number }[];
  /** Plain names (kept for callers that only have strings). */
  people?: string[];
  upcomingEvents?: { title: string; at: string; with?: string | null }[];
  recentTopics?: string[];
  openLoops?: string[];
  deadlines?: string[];
  /** When set, every question must be about this person (person-scoped assistant thread). */
  contact?: SuggestedQuestionsContact | null;
}

const ITEM_MAX = 8;

function countsLine(counts: Partial<BriefingCounts> | null | undefined, en: boolean): string | null {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.importantEmails !== undefined) parts.push(`${counts.importantEmails} ${en ? 'important emails' : 'önemli mail'}`);
  if (counts.events !== undefined) parts.push(`${counts.events} ${en ? 'events' : 'etkinlik'}`);
  if (counts.followUps !== undefined) parts.push(`${counts.followUps} ${en ? 'follow-ups' : 'takip'}`);
  if (counts.deadlines !== undefined) parts.push(`${counts.deadlines} ${en ? 'deadlines' : 'son tarih'}`);
  if (parts.length === 0) return null;
  return `${en ? 'Today' : 'Bugün'}: ${parts.join(' · ')}`;
}

function contactBlock(contact: SuggestedQuestionsContact, en: boolean, tz: string, perItem: number): string {
  const header = [contact.name, contact.relation, contact.company]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => clipInline(s, 80))
    .join(' · ');
  const last = contact.lastContact
    ? `${en ? 'Last contact' : 'Son temas'} (${formatPromptTime(contact.lastContact.at, tz)}): ${clipInline(contact.lastContact.summary, 240)}`
    : null;
  return joinLines([
    `${en ? 'Person' : 'Kişi'}: ${header}`,
    last,
    contact.userOwes?.length ? `${en ? 'User owes them' : 'Kullanıcının ona borçlu olduğu'}:\n${bullets(contact.userOwes.slice(0, ITEM_MAX).map((s) => clipInline(s, perItem)))}` : null,
    contact.theyOwe?.length ? `${en ? 'They owe the user' : 'Onun kullanıcıya borçlu olduğu'}:\n${bullets(contact.theyOwe.slice(0, ITEM_MAX).map((s) => clipInline(s, perItem)))}` : null,
  ]);
}

export function suggestedQuestions(input: SuggestedQuestionsInput): PromptSpec<SuggestedQuestionsAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const perItem = PROMPT_CHAR_LIMITS.suggested_questions;
  const userName = clipInline(input.userName, 80) || (en ? 'the user' : 'kullanıcı');
  const contactName = input.contact ? clipInline(input.contact.name, 80) : null;
  const system = composeSystem({
    locale,
    role: contactName
      ? en
        ? `You suggest questions ${userName} could ask their assistant about ${contactName}, based only on what is known about that person.`
        : `${userName} adlı kullanıcının asistanına ${contactName} hakkında sorabileceği soruları, yalnızca o kişi hakkında bilinenlere dayanarak öneriyorsun.`
      : en
        ? `You suggest questions ${userName} could ask their assistant right now, based only on what is going on in their day.`
        : `${userName} adlı kullanıcının asistanına şu an sorabileceği soruları, yalnızca gününde olup bitenlere dayanarak öneriyorsun.`,
    rules: [
      en ? '3 to 6 questions, each under 80 characters, written in first person as the user would type them.' : '3 ile 6 soru; her biri 80 karakterden kısa, kullanıcının yazacağı gibi birinci tekil şahısla.',
      en
        ? 'Every question must point at a provided count, person, event, topic, open loop or deadline; nothing generic like "What can you do?".'
        : 'Her soru verilen bir sayıya, kişiye, etkinliğe, konuya, açık işe ya da son tarihe dayansın; "Neler yapabilirsin?" gibi genel sorular yok.',
      contactName
        ? en
          ? `Every question is about ${contactName} (their mails, commitments, meetings, last contact). Do not ask about anyone else.`
          : `Her soru ${contactName} hakkında olsun (mailleri, taahhütler, toplantılar, son temas). Başka kimse hakkında soru sorma.`
        : en
          ? 'Prefer what is due or happening soonest; mix mail, calendar and people when the context has them.'
          : 'En yakın olana ve süresi dolmak üzere olana öncelik ver; bağlamda varsa mail, takvim ve kişileri karıştır.',
      en ? 'Use names, titles and counts exactly as given; do not add details that are not in the context.' : 'Ad, başlık ve sayıları verildiği gibi kullan; bağlamda olmayan ayrıntı ekleme.',
      en ? 'reason: a few words on why it is useful now.' : 'reason: neden şimdi işe yaradığını anlatan birkaç kelime.',
      en ? 'No markdown, no emoji.' : 'Markdown yok, emoji yok.',
    ],
    sections: [{ title: en ? 'Context' : 'Bağlam', body: temporalContext({ now: input.now, locale, timezone: tz }) }],
  });
  const list = (label: string, items: string[] | undefined) => (items?.length ? `${label}:\n${bullets(items.slice(0, ITEM_MAX).map((s) => clipInline(s, perItem)))}` : null);
  const people = [
    ...(input.topPeople ?? []).map((p) => (p.count ? `${clipInline(p.name, 80)} (${p.count})` : clipInline(p.name, 80))),
    ...(input.people ?? []).map((p) => clipInline(p, 80)),
  ];
  const context = joinLines([
    input.contact ? contactBlock(input.contact, en, tz, perItem) : null,
    countsLine(input.counts, en),
    input.upcomingEvents?.length
      ? `${en ? 'Upcoming events' : 'Yaklaşan etkinlikler'}:\n${bullets(
          input.upcomingEvents
            .slice(0, ITEM_MAX)
            .map((e) => `${clipInline(e.title, perItem)} (${formatPromptTime(e.at, tz)})${e.with ? ` · ${clipInline(e.with, 60)}` : ''}`),
        )}`
      : null,
    list(en ? 'People' : 'Kişiler', people.length ? people : undefined),
    list(en ? 'Recent topics' : 'Son konular', input.recentTopics),
    list(en ? 'Open loops' : 'Açık işler', input.openLoops),
    list(en ? 'Deadlines' : 'Son tarihler', input.deadlines),
  ]);
  return {
    purpose: 'suggested_questions',
    tier: 'small',
    locale,
    system,
    user: contactName
      ? en
        ? `Suggest questions about ${contactName} based on the items below.`
        : `Aşağıdaki öğelere dayanarak ${contactName} hakkında sorular öner.`
      : en
        ? 'Suggest questions based on the items below.'
        : 'Aşağıdaki öğelere dayanarak sorular öner.',
    context: context || (en ? '(nothing notable today)' : '(bugün kayda değer bir şey yok)'),
    schema: suggestedQuestionsAiSchema,
    maxOutputTokens: 600,
    temperature: 0.6,
  };
}
