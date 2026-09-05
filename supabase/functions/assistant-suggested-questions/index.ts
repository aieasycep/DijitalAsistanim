/**
 * GET /assistant-suggested-questions?contactId — 3–6 starter questions grounded in today's data
 * (or in one person when contactId is set). AI when configured, otherwise deterministic suggestions
 * built from the same context — the screen never shows an empty state because of a missing key.
 */
import { z } from 'zod';
import type { CalendarEvent, Commitment, Contact, EmailThread, SuggestedQuestionsResponse } from '@da/domain';
import { suggestedQuestionsAiSchema } from '@da/validation';
import { suggestedQuestions } from '@da/server-core/ai';
import { sha256Hex } from '@da/server-core/crypto';
import { aiConfigured, checkAiBudget, createAi } from '../_shared/ai.ts';
import { adminClient, assertMethod, handler, json, parseInput, requireUser, uuidParam } from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ contactId: uuidParam.nullish() });

interface Context {
  counts: { importantEmails: number; events: number; followUps: number; deadlines: number };
  topPeople: { name: string; count: number }[];
  upcomingEvents: { title: string; at: string; with?: string | null }[];
  recentTopics: string[];
  openLoops: string[];
  contact: { name: string; company?: string | null; lastContact?: { at: string; summary: string } | null; userOwes: string[]; theyOwe: string[] } | null;
}

function fallbackQuestions(ctx: Context, locale: 'tr' | 'en'): SuggestedQuestionsResponse {
  const tr = locale === 'tr';
  const q: { text: string; reason?: string | null }[] = [];
  if (ctx.contact) {
    const n = ctx.contact.name;
    q.push({ text: tr ? `${n} ile son konuştuğumuz konu neydi?` : `What did I last discuss with ${n}?` });
    if (ctx.contact.userOwes.length) q.push({ text: tr ? `${n}'e ne sözü verdim?` : `What did I promise ${n}?`, reason: tr ? 'Açık sözler var' : 'Open promises' });
    if (ctx.contact.theyOwe.length) q.push({ text: tr ? `${n} bana ne göndermeyi bekliyorum?` : `What am I waiting on from ${n}?` });
    q.push({ text: tr ? `${n} ile bir sonraki görüşmem ne zaman?` : `When is my next meeting with ${n}?` });
  } else {
    q.push({ text: tr ? 'Bugün önce ne yapmalıyım?' : 'What should I do first today?' });
    if (ctx.counts.deadlines > 0) q.push({ text: tr ? 'Bu hafta hangi son tarihler var?' : 'Which deadlines are due this week?', reason: tr ? `${ctx.counts.deadlines} son tarih` : `${ctx.counts.deadlines} deadlines` });
    if (ctx.counts.followUps > 0) q.push({ text: tr ? 'Kimden yanıt bekliyorum?' : 'Who am I waiting on?', reason: tr ? `${ctx.counts.followUps} takip` : `${ctx.counts.followUps} follow-ups` });
    const ev = ctx.upcomingEvents[0];
    if (ev) q.push({ text: tr ? `${ev.title} toplantısına nasıl hazırlanmalıyım?` : `How should I prepare for ${ev.title}?` });
    const person = ctx.topPeople[0];
    if (person) q.push({ text: tr ? `${person.name} ile açık konular neler?` : `What is open with ${person.name}?` });
    q.push({ text: tr ? 'Bu hafta ne söz verdim?' : 'What did I promise this week?' });
  }
  return { questions: q.slice(0, 6).map((item, i) => ({ id: `fallback-${i}`, text: item.text, reason: item.reason ?? null })) };
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const { contactId } = await parseInput(req, schema);
    const admin = adminClient();
    const planInfo = await resolvePlan(admin, user.id);
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
    const in7d = new Date(now.getTime() + 7 * 86_400_000).toISOString();

    const [{ data: threads }, { data: events }, { data: followUps }, { data: commitments }, contactRow] = await Promise.all([
      db.from('email_threads').select('subject, participants, importance, analysis, last_message_at').eq('user_id', user.id).is('deleted_at', null).eq('user_dismissed', false).order('priority_score', { ascending: false }).limit(25),
      db.from('calendar_events').select('title, start_at, attendees').eq('user_id', user.id).is('deleted_at', null).neq('status', 'cancelled').gte('start_at', now.toISOString()).lte('start_at', in48h).order('start_at', { ascending: true }).limit(6),
      db.from('follow_ups').select('counterpart_name, topic').eq('user_id', user.id).in('status', ['watching', 'nudge_due']).limit(10),
      db.from('commitments').select('*').eq('user_id', user.id).is('deleted_at', null).in('status', ['open', 'proposed', 'postponed']).limit(20),
      contactId ? db.from('contacts').select('*').eq('id', contactId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const threadList = camelize<Pick<EmailThread, 'subject' | 'participants' | 'importance' | 'analysis' | 'lastMessageAt'>[]>(threads ?? []);
    const eventList = camelize<Pick<CalendarEvent, 'title' | 'startAt' | 'attendees'>[]>(events ?? []);
    const commitmentList = camelize<Commitment[]>(commitments ?? []);
    const contact = contactRow.data ? camelize<Contact>(contactRow.data) : null;

    const peopleCount = new Map<string, number>();
    for (const t of threadList) for (const p of t.participants) if (p.name) peopleCount.set(p.name, (peopleCount.get(p.name) ?? 0) + 1);
    const deadlines = threadList.filter((t) => t.analysis?.deadline && Date.parse(t.analysis.deadline) <= Date.parse(in7d)).length;
    const contactCommitments = contact ? commitmentList.filter((c) => c.counterpartContactId === contact.id) : [];
    const contactThread = contact ? threadList.find((t) => t.participants.some((p) => p.email && contact.emails.includes(p.email))) : undefined;

    const ctx: Context = {
      counts: {
        importantEmails: threadList.filter((t) => t.importance === 'critical' || t.importance === 'high').length,
        events: eventList.length,
        followUps: (followUps ?? []).length,
        deadlines,
      },
      topPeople: [...peopleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      upcomingEvents: eventList.map((e) => ({ title: e.title, at: e.startAt, with: e.attendees.find((a) => !a.isOrganizer)?.name ?? null })),
      recentTopics: threadList.slice(0, 8).map((t) => t.subject).filter(Boolean),
      openLoops: [
        ...((followUps ?? []) as { counterpart_name: string; topic: string }[]).map((f) => `${f.counterpart_name}: ${f.topic}`),
        ...commitmentList.slice(0, 8).map((c) => c.text),
      ],
      contact: contact
        ? {
            name: contact.displayName,
            company: contact.company ?? null,
            lastContact: contactThread ? { at: contactThread.lastMessageAt, summary: contactThread.analysis?.summary ?? contactThread.subject } : null,
            userOwes: contactCommitments.filter((c) => c.direction === 'user_owes').map((c) => c.text),
            theyOwe: contactCommitments.filter((c) => c.direction === 'other_owes').map((c) => c.text),
          }
        : null,
    };

    if (!aiConfigured()) return json(fallbackQuestions(ctx, planInfo.locale));
    try {
      const aiCtx = { userId: user.id, plan: planInfo.plan, timezone: planInfo.timezone, locale: planInfo.locale };
      await checkAiBudget(aiCtx, 1500);
      const spec = suggestedQuestions({
        now: now.toISOString(),
        locale: planInfo.locale,
        timezone: planInfo.timezone,
        userName: planInfo.firstName || planInfo.displayName,
        counts: ctx.counts,
        topPeople: ctx.topPeople,
        upcomingEvents: ctx.upcomingEvents,
        recentTopics: ctx.recentTopics,
        openLoops: ctx.openLoops,
        contact: ctx.contact,
      });
      const dayKey = now.toISOString().slice(0, 13);
      const cacheKey = await sha256Hex(`questions:${user.id}:${contactId ?? 'today'}:${dayKey}:${ctx.counts.importantEmails}:${ctx.counts.events}:${ctx.openLoops.length}`);
      const result = await createAi(aiCtx).generateStructured(suggestedQuestionsAiSchema, spec, { userId: user.id, locale: planInfo.locale, cacheKey, cacheTtlSec: 3600 });
      const response: SuggestedQuestionsResponse = {
        questions: result.data.questions.map((q, i) => ({ id: `q-${i}`, text: q.text, reason: q.reason ?? null })),
      };
      return json(response);
    } catch (e) {
      log.warn('suggested questions fell back to rules', { error: e instanceof Error ? e.message : 'unknown' });
      return json(fallbackQuestions(ctx, planInfo.locale));
    }
  }),
);
