/**
 * POST /email-draft-reply { threadId, tone, instructions? } — AI reply draft in one of four tones.
 * The draft is only text: sending happens exclusively through an approval (email_send).
 * Every fact the draft relies on is cited back as SourceRef so the UI can render "Dayanak" chips.
 */
import type { DraftReplyResponse, EmailMessage, EmailThread, SourceRef } from '@da/domain';
import { draftReplyRequestSchema, replyDraftAiSchema } from '@da/validation';
import { replyDraft, type ReplyThreadMessage } from '@da/server-core/ai';
import { AppError } from '@da/server-core/errors';
import { sha256Hex } from '@da/server-core/crypto';
import { checkAiBudget, createAi } from '../_shared/ai.ts';
import { adminClient, assertMethod, enforceRateLimit, handler, json, parseInput, requireUser } from '../_shared/mod.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize } from '../_shared/rows.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, draftReplyRequestSchema);
    await enforceRateLimit('ai_call', user.id);
    const admin = adminClient();

    const [{ data: threadRow }, { data: messageRows }, { data: accountRows }, planInfo] = await Promise.all([
      db.from('email_threads').select('*').eq('id', input.threadId).eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
      db.from('email_messages').select('*').eq('thread_id', input.threadId).eq('user_id', user.id).is('deleted_at', null).order('sent_at', { ascending: true }).limit(12),
      db.from('connected_accounts').select('id, email, provider').eq('user_id', user.id).is('deleted_at', null),
      resolvePlan(admin, user.id),
    ]);
    if (!threadRow) throw new AppError('not_found', 'Mail bulunamadı.');
    const thread = camelize<EmailThread>(threadRow);
    const messages = camelize<EmailMessage[]>(messageRows ?? []);
    if (messages.length === 0) throw new AppError('not_found', 'Bu yazışmada yanıtlanacak mesaj yok.');
    const accounts = (accountRows ?? []) as { id: string; email: string | null; provider: string }[];
    const userEmails = accounts.map((a) => a.email?.toLowerCase()).filter((e): e is string => Boolean(e));
    const provider = accounts.find((a) => a.id === thread.accountId)?.provider ?? 'google';
    const sourceType = provider === 'microsoft' ? ('outlook' as const) : ('gmail' as const);
    const sourceLabel = provider === 'microsoft' ? 'Outlook' : 'Gmail';

    const ctx = { userId: user.id, plan: planInfo.plan, timezone: planInfo.timezone, locale: planInfo.locale };
    await checkAiBudget(ctx, 3000);

    const last = messages[messages.length - 1] as EmailMessage;
    const recipient = last.isFromUser ? (last.to[0] ?? null) : last.from;
    const promptMessages: ReplyThreadMessage[] = messages.map((m) => ({
      id: m.id,
      from: { name: m.from.name ?? null, email: m.from.email },
      sentAt: m.sentAt,
      body: m.bodyText ?? m.snippet,
      isFromUser: m.isFromUser,
    }));

    const spec = replyDraft({
      now: new Date().toISOString(),
      locale: planInfo.locale,
      timezone: planInfo.timezone,
      tone: input.tone,
      userFirstName: planInfo.firstName || planInfo.displayName,
      userEmails,
      thread: { subject: thread.subject, messages: promptMessages },
      analysis: thread.analysis
        ? {
            summary: thread.analysis.summary,
            keyPoints: thread.analysis.keyPoints,
            requiresUserAction: thread.analysis.requiresUserAction,
            deadlineText: thread.analysis.deadlineText ?? null,
          }
        : null,
      instructions: input.instructions ?? null,
      recipient: recipient ? { name: recipient.name ?? null, email: recipient.email } : null,
    });

    const ai = createAi(ctx);
    const cacheKey = await sha256Hex(`reply:${user.id}:${thread.id}:${last.id}:${input.tone}:${input.instructions ?? ''}`);
    const result = await ai.generateStructured(replyDraftAiSchema, spec, { userId: user.id, locale: planInfo.locale, cacheKey, cacheTtlSec: 3600 });

    const byId = new Map(messages.map((m) => [m.id, m]));
    const basedOn: SourceRef[] = result.data.basedOnIds
      .map((id) => byId.get(id))
      .filter((m): m is EmailMessage => Boolean(m))
      .map((m) => ({
        type: sourceType,
        id: m.id,
        externalId: m.externalMessageId,
        label: sourceLabel,
        person: m.from.name ?? m.from.email,
        timestamp: m.sentAt,
        excerpt: m.snippet.slice(0, 280),
      }));
    if (basedOn.length === 0) {
      basedOn.push({ type: sourceType, id: last.id, externalId: last.externalMessageId, label: sourceLabel, person: last.from.name ?? last.from.email, timestamp: last.sentAt, excerpt: last.snippet.slice(0, 280) });
    }

    const to = recipient ? [{ name: recipient.name ?? null, email: recipient.email }] : [];
    const response: DraftReplyResponse = {
      draft: result.data.body,
      subject: result.data.subject || (thread.subject.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject}`),
      to,
      tone: result.data.tone,
      basedOn,
    };
    return json(response);
  }),
);
