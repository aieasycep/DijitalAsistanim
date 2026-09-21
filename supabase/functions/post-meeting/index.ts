/**
 * POST /post-meeting { eventId, text, inputMode } — "Toplantın bitti. Kısaca ne oldu?"
 * The note is stored, promises are extracted (rule-based first, AI when configured and only for the
 * user's own sentences), and each proposal becomes a `commitment_create` approval — nothing is saved as
 * a commitment until the user confirms.
 */
import type { CalendarEvent, Commitment, PostMeetingResponse, SourceRef } from '@da/domain';
import { commitmentExtractionAiSchema, postMeetingRequestSchema } from '@da/validation';
import { commitmentExtraction } from '@da/server-core/ai';
import { createApproval } from '@da/server-core/approvals';
import { extractCommitments, type CommitmentCandidate } from '@da/server-core/commitments';
import { AppError } from '@da/server-core/errors';
import { aiConfigured, checkAiBudget, createAi } from '../_shared/ai.ts';
import { insertApproval } from '../_shared/approvals.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  audit,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize } from '../_shared/rows.ts';

interface Proposal {
  text: string;
  quote: string | null;
  direction: Commitment['direction'];
  counterpartName: string | null;
  dueAt: string | null;
  dueText: string | null;
  confidence: number;
}

function fromCandidate(c: CommitmentCandidate): Proposal {
  return {
    text: c.text,
    quote: c.quote,
    direction: c.direction,
    counterpartName: c.counterpartName,
    dueAt: c.due?.iso ?? null,
    dueText: c.dueText,
    confidence: c.confidence,
  };
}

function dedupe(list: Proposal[]): Proposal[] {
  const seen = new Set<string>();
  const out: Proposal[] = [];
  for (const p of list) {
    const key = `${p.direction}:${p.text.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, postMeetingRequestSchema);
    await enforceRateLimit('ai_call', user.id);
    const admin = adminClient();
    const ctx = await loadUserContext(admin, user.id);
    const { data: eventRow } = await admin
      .from('calendar_events')
      .select('*')
      .eq('id', input.eventId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!eventRow) throw new AppError('not_found', 'Etkinlik bulunamadı.');
    const event = camelize<CalendarEvent>(eventRow);
    const now = new Date().toISOString();

    const { data: noteRow, error: noteErr } = await admin
      .from('post_meeting_notes')
      .insert({
        user_id: user.id,
        event_id: event.id,
        text: input.text,
        input_mode: input.inputMode,
      })
      .select('id')
      .single();
    if (noteErr || !noteRow)
      throw new AppError('internal', `Not kaydedilemedi: ${noteErr?.message ?? ''}`);
    const noteId = (noteRow as { id: string }).id;

    const counterpart =
      event.attendees.find(
        (a) => a.email && !ctx.userEmails.includes(a.email.toLowerCase()) && !a.isOrganizer,
      ) ??
      event.attendees.find((a) => a.email && !ctx.userEmails.includes(a.email.toLowerCase())) ??
      null;
    const counterpartName = counterpart?.name ?? counterpart?.email ?? null;

    let proposals: Proposal[] = extractCommitments({
      text: input.text,
      authorIsUser: true,
      counterpartHint: counterpartName
        ? { name: counterpartName, email: counterpart?.email ?? null }
        : null,
      now,
      timezone: ctx.timezone,
      locale: ctx.locale,
      topic: event.title,
    }).map(fromCandidate);

    if (aiConfigured()) {
      try {
        const plan = await resolvePlan(admin, user.id);
        const aiCtx = {
          userId: user.id,
          plan: plan.plan,
          timezone: ctx.timezone,
          locale: ctx.locale,
        };
        await checkAiBudget(aiCtx, 1500);
        const spec = commitmentExtraction({
          now,
          locale: ctx.locale,
          timezone: ctx.timezone,
          userName: ctx.firstName || ctx.displayName,
          source: {
            kind: 'meeting_note',
            id: noteId,
            sentAt: now,
            subject: event.title,
            isFromUser: true,
          },
          text: input.text,
          counterpartName,
        });
        const result = await createAi(aiCtx).generateStructured(
          commitmentExtractionAiSchema,
          spec,
          { userId: user.id, locale: ctx.locale },
        );
        const aiProposals: Proposal[] = result.data.commitments
          .filter((c) => c.confidence >= 0.5)
          .map((c) => ({
            text: c.text,
            quote: c.quote,
            direction: c.direction,
            counterpartName: c.counterpart ?? counterpartName,
            dueAt: c.due?.iso ?? null,
            dueText: c.due?.text ?? null,
            confidence: c.confidence,
          }));
        proposals = dedupe([...proposals, ...aiProposals]);
      } catch (e) {
        log.warn('post-meeting ai fallback', { error: e instanceof Error ? e.message : 'unknown' });
      }
    }

    const source: SourceRef = {
      type: 'meeting_note',
      id: noteId,
      label: ctx.locale === 'en' ? 'Meeting note' : 'Toplantı notu',
      person: counterpartName ?? undefined,
      timestamp: now,
      excerpt: input.text.slice(0, 280),
    };
    const out: PostMeetingResponse['proposals'] = [];
    for (const p of proposals.slice(0, 6)) {
      const approval = await createApproval(
        {
          type: 'commitment_create',
          what:
            p.direction === 'user_owes'
              ? ctx.locale === 'en'
                ? `Save your promise: ${p.text}`
                : `Sözünü kaydet: ${p.text}`
              : ctx.locale === 'en'
                ? `Track what they owe: ${p.text}`
                : `Beklentini kaydet: ${p.text}`,
          why: p.quote
            ? ctx.locale === 'en'
              ? `From your note: “${p.quote}”`
              : `Notundan: “${p.quote}”`
            : ctx.locale === 'en'
              ? 'Mentioned in your meeting note.'
              : 'Toplantı notunda geçiyor.',
          payload: {
            text: p.text,
            direction: p.direction,
            counterpartName: p.counterpartName,
            dueAt: p.dueAt,
            dueText: p.dueText,
            quote: p.quote,
            relatedEventId: event.id,
          },
          source,
          requestedBy: 'post_meeting',
        },
        { userId: user.id, now, locale: ctx.locale, timezone: ctx.timezone },
      );
      const { id } = await insertApproval(admin, approval);
      out.push({
        approvalId: id,
        commitment: {
          text: p.text,
          quote: p.quote,
          direction: p.direction,
          counterpartName: p.counterpartName,
          counterpartContactId: null,
          dueAt: p.dueAt,
          dueText: p.dueText,
          status: 'proposed',
          source,
          confidence: p.confidence,
          completedAt: null,
          postponedUntil: null,
          relatedEventId: event.id,
          deletedAt: null,
        },
      });
    }
    await admin
      .from('calendar_events')
      .update({ post_meeting_handled_at: now })
      .eq('id', event.id)
      .eq('user_id', user.id);
    await audit(admin, {
      userId: user.id,
      action: 'approval.create',
      actor: 'user',
      targetType: 'post_meeting_note',
      targetId: noteId,
      metadata: { proposals: out.length, inputMode: input.inputMode },
    });
    const response: PostMeetingResponse = { proposals: out };
    return json(response);
  }),
);
