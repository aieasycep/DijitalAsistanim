/**
 * POST /assistant-ask { threadId?, message, inputMode, contactId? } — RAG assistant over the user's memory.
 *  - Retrieval: pgvector (semantic) when embeddings are configured, else Turkish FTS; plus today's structured
 *    context (events, open promises, pending follow-ups) so "bugün ne var?" works without a search hit.
 *  - Every answer cites SourceRefs; facts not backed by a cited chunk flip `uncertain` ("Kaynakta kesinleşmiyor.").
 *  - Write intents (mail, calendar, task, reminder, promise) become approvals — never executed here.
 *  - Free plan: daily assistant quota; Pro: unlimited (token budget still applies).
 */
import type {
  AssistantAskResponse,
  AssistantMessage,
  AssistantRichCard,
  CalendarEvent,
  Commitment,
  FollowUp,
  MemoryChunk,
  SourceRef,
} from '@da/domain';
import { FREE_QUOTAS } from '@da/domain';
import {
  approvalPayloadSchemas,
  assistantAnswerAiSchema,
  assistantAskRequestSchema,
} from '@da/validation';
import { assistantAnswer, type AssistantChunk } from '@da/server-core/ai';
import { createApproval, requiredScopeFor } from '@da/server-core/approvals';
import { toPgVectorLiteral } from '@da/server-core/embeddings';
import { AppError } from '@da/server-core/errors';
import {
  buildSourceRefs,
  groundingCheck,
  rankAndTrimContext,
  type ScoredChunk,
} from '@da/server-core/memory';
import { scopeSatisfies } from '@da/server-core/oauth';
import { aiConfigured, checkAiBudget, createAi, createEmbeddings } from '../_shared/ai.ts';
import { insertApproval } from '../_shared/approvals.ts';
import { loadUserContext, type UserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
  type Db,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize, localDateKey } from '../_shared/rows.ts';

interface RpcChunk {
  id: string;
  source_type: MemoryChunk['sourceType'];
  source_id: string;
  source: SourceRef;
  content: string;
  topic: string | null;
  person_name: string | null;
  occurred_at: string;
  score: number;
  mode: string;
}

function toChunk(userId: string, c: RpcChunk): ScoredChunk {
  return {
    id: c.id,
    userId,
    sourceType: c.source_type,
    sourceId: c.source_id,
    source: c.source,
    content: c.content,
    topic: c.topic,
    personName: c.person_name,
    contactId: null,
    occurredAt: c.occurred_at,
    hasEmbedding: c.mode === 'semantic',
    tokenCount: 0,
    expiresAt: null,
    createdAt: c.occurred_at,
    updatedAt: c.occurred_at,
    score: c.score,
  };
}

function kindOf(sourceType: MemoryChunk['sourceType']): AssistantChunk['kind'] {
  switch (sourceType) {
    case 'gmail':
    case 'outlook':
      return 'email';
    case 'google_calendar':
    case 'microsoft_calendar':
    case 'apple_calendar':
    case 'device_calendar':
      return 'event';
    case 'meeting_note':
      return 'commitment';
    default:
      return 'memory';
  }
}

/** Structured "today" context so date questions have grounding even when the memory index is sparse. */
async function structuredContext(admin: Db, ctx: UserContext, now: string): Promise<ScoredChunk[]> {
  const from = new Date(Date.parse(now) - 2 * 3600_000).toISOString();
  const to = new Date(Date.parse(now) + 48 * 3600_000).toISOString();
  const [{ data: events }, { data: commitments }, { data: followUps }] = await Promise.all([
    admin
      .from('calendar_events')
      .select('*')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_at', from)
      .lte('start_at', to)
      .order('start_at', { ascending: true })
      .limit(12),
    admin
      .from('commitments')
      .select('*')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .in('status', ['open', 'postponed'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(12),
    admin
      .from('follow_ups')
      .select('*')
      .eq('user_id', ctx.userId)
      .in('status', ['watching', 'nudge_due'])
      .limit(8),
  ]);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(ctx.locale === 'en' ? 'en-GB' : 'tr-TR', {
      timeZone: ctx.timezone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  const chunks: ScoredChunk[] = [];
  for (const e of camelize<CalendarEvent[]>(events ?? [])) {
    const people = e.attendees
      .filter((a) => a.name)
      .map((a) => a.name)
      .slice(0, 4)
      .join(', ');
    chunks.push({
      id: `event:${e.id}`,
      userId: ctx.userId,
      sourceType: ctx.calendarSourceTypes[e.accountId] ?? 'google_calendar',
      sourceId: e.id,
      source: {
        type: ctx.calendarSourceTypes[e.accountId] ?? 'google_calendar',
        id: e.id,
        label: ctx.locale === 'en' ? 'Calendar' : 'Takvim',
        timestamp: e.startAt,
      },
      content: `${e.title} — ${fmt(e.startAt)}${e.location ? ` · ${e.location}` : ''}${people ? ` · ${people}` : ''}`,
      topic: e.title,
      personName: e.attendees.find((a) => a.name && !a.isOrganizer)?.name ?? null,
      contactId: null,
      occurredAt: e.startAt,
      hasEmbedding: false,
      tokenCount: 40,
      expiresAt: null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      score: 0.6,
    });
  }
  for (const c of camelize<Commitment[]>(commitments ?? [])) {
    chunks.push({
      id: `commitment:${c.id}`,
      userId: ctx.userId,
      sourceType: c.source.type,
      sourceId: c.id,
      source: c.source,
      content: `${c.direction === 'user_owes' ? (ctx.locale === 'en' ? 'You promised' : 'Senin sözün') : ctx.locale === 'en' ? 'They promised' : 'Onun sözü'}: ${c.text}${c.dueAt ? ` · ${fmt(c.dueAt)}` : c.dueText ? ` · ${c.dueText}` : ''}`,
      topic: c.text,
      personName: c.counterpartName ?? null,
      contactId: c.counterpartContactId ?? null,
      occurredAt: c.createdAt,
      hasEmbedding: false,
      tokenCount: 30,
      expiresAt: null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      score: 0.5,
    });
  }
  for (const f of camelize<FollowUp[]>(followUps ?? [])) {
    chunks.push({
      id: `followup:${f.id}`,
      userId: ctx.userId,
      sourceType: f.source.type,
      sourceId: f.threadId,
      source: f.source,
      content: `${ctx.locale === 'en' ? 'Waiting for a reply from' : 'Yanıt bekleniyor'}: ${f.counterpartName} — ${f.topic} (${fmt(f.sentAt)})`,
      topic: f.topic,
      personName: f.counterpartName,
      contactId: f.contactId ?? null,
      occurredAt: f.sentAt,
      hasEmbedding: false,
      tokenCount: 30,
      expiresAt: null,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      score: 0.45,
    });
  }
  return chunks;
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, assistantAskRequestSchema);
    await enforceRateLimit('assistant_query', user.id);
    const admin = adminClient();
    const [ctx, plan] = await Promise.all([
      loadUserContext(admin, user.id),
      resolvePlan(admin, user.id),
    ]);
    const now = new Date().toISOString();

    // Free-plan daily quota
    const day = localDateKey(now, ctx.timezone);
    const { data: usage } = await admin
      .from('usage_counters')
      .select('assistant_queries')
      .eq('user_id', user.id)
      .eq('day', day)
      .maybeSingle();
    const used = (usage as { assistant_queries: number } | null)?.assistant_queries ?? 0;
    if (plan.plan === 'free' && used >= FREE_QUOTAS.assistantQueriesPerDay) {
      throw new AppError(
        'quota_exceeded',
        ctx.locale === 'en'
          ? 'Daily assistant limit reached on the free plan.'
          : 'Ücretsiz planda günlük asistan sınırına ulaştın.',
        {
          status: 402,
          details: {
            feature: 'assistant_unlimited',
            used,
            limit: FREE_QUOTAS.assistantQueriesPerDay,
          },
        },
      );
    }
    await admin
      .from('usage_counters')
      .upsert(
        { user_id: user.id, day, assistant_queries: used + 1, updated_at: now },
        { onConflict: 'user_id,day' },
      );

    // Thread
    let threadId = input.threadId ?? null;
    if (threadId) {
      const { data: t } = await admin
        .from('assistant_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!t) throw new AppError('not_found', 'Sohbet bulunamadı.');
    } else {
      const { data: t, error } = await admin
        .from('assistant_threads')
        .insert({
          user_id: user.id,
          title: input.message.slice(0, 60),
          last_message_at: now,
          contact_id: input.contactId ?? null,
        })
        .select('id')
        .single();
      if (error || !t)
        throw new AppError('internal', `Sohbet oluşturulamadı: ${error?.message ?? ''}`);
      threadId = (t as { id: string }).id;
    }
    await admin
      .from('assistant_messages')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        role: 'user',
        content: input.message,
        input_mode: input.inputMode,
      });

    // Retrieval
    let queryEmbedding: string | null = null;
    const embeddings = createEmbeddings();
    if (embeddings) {
      try {
        const [vec] = await embeddings.embed([input.message]);
        if (vec) queryEmbedding = toPgVectorLiteral(vec);
      } catch (e) {
        log.warn('question embedding failed', {
          error: e instanceof Error ? e.message : 'unknown',
        });
      }
    }
    const [{ data: rpcRows }, structured, { data: historyRows }, contactRow] = await Promise.all([
      db.rpc('search_memory', {
        query: input.message,
        match_count: 16,
        query_embedding: queryEmbedding,
        contact: input.contactId ?? null,
      }),
      structuredContext(admin, ctx, now),
      admin
        .from('assistant_messages')
        .select('role, content')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(7),
      input.contactId
        ? admin
            .from('contacts')
            .select('display_name')
            .eq('id', input.contactId)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const retrieved = ((rpcRows ?? []) as RpcChunk[]).map((c) => toChunk(user.id, c));
    const chunks = rankAndTrimContext([...retrieved, ...structured], { maxTokens: 5000, now });
    const contactName = (contactRow.data as { display_name: string } | null)?.display_name ?? null;
    const history = (
      (historyRows ?? []) as { role: 'user' | 'assistant' | 'system'; content: string }[]
    )
      .filter((m) => m.role !== 'system')
      .reverse()
      .slice(0, -1)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const promptChunks: AssistantChunk[] = chunks.map((c) => ({
      id: c.id,
      kind: kindOf(c.sourceType),
      label: c.source.label,
      person: c.personName ?? null,
      at: c.occurredAt,
      text: c.content,
    }));

    let answer: string;
    let citedIds: string[] = [];
    let cardsAi: { kind: AssistantChunk['kind'] | 'plan_block'; id: string }[] = [];
    let writeIntents: {
      type: keyof typeof approvalPayloadSchemas;
      what: string;
      why: string;
      draft: Record<string, unknown>;
    }[] = [];
    let suggestedFollowUps: string[] = [];
    let uncertain = false;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    let model: string | null = null;

    if (aiConfigured()) {
      const aiCtx = {
        userId: user.id,
        plan: plan.plan,
        timezone: ctx.timezone,
        locale: ctx.locale,
      };
      await checkAiBudget(aiCtx, 3500);
      const scopes = ctx.accounts.flatMap((a) => a.grantedScopes);
      const oauthAccount = ctx.accounts.find(
        (a) => a.provider === 'google' || a.provider === 'microsoft',
      );
      const provider =
        oauthAccount?.provider === 'google' || oauthAccount?.provider === 'microsoft'
          ? oauthAccount.provider
          : null;
      const has = (type: 'email_send' | 'calendar_create' | 'task_create') => {
        if (!provider) return false;
        const scope = requiredScopeFor(type, provider);
        return scope ? scopeSatisfies(scopes, [scope]) : true;
      };
      const spec = assistantAnswer({
        now,
        locale: ctx.locale,
        timezone: ctx.timezone,
        userName: ctx.firstName || ctx.displayName,
        question: input.message,
        history,
        chunks: promptChunks,
        contactName,
        capabilities: {
          canSendMail: has('email_send'),
          canWriteCalendar: has('calendar_create'),
          canCreateTasks: has('task_create'),
        },
      });
      const result = await createAi(aiCtx).generateStructured(assistantAnswerAiSchema, spec, {
        userId: user.id,
        locale: ctx.locale,
      });
      answer = result.data.answer;
      citedIds = result.data.citedSourceIds;
      cardsAi = result.data.cards;
      writeIntents = result.data.writeIntents as typeof writeIntents;
      suggestedFollowUps = result.data.suggestedFollowUps;
      uncertain = result.data.uncertain;
      tokensIn = result.usage.inputTokens;
      tokensOut = result.usage.outputTokens;
      model = result.model;
    } else {
      // Deterministic fallback: surface what the search found, never invent.
      const top = chunks.slice(0, 5);
      citedIds = top.map((c) => c.id);
      answer = top.length
        ? (ctx.locale === 'en'
            ? 'Here is what I found in your data:\n'
            : 'Verilerinde bulduklarım:\n') + top.map((c) => `• ${c.content}`).join('\n')
        : ctx.locale === 'en'
          ? 'I could not find anything about this in your mail, calendar or notes.'
          : 'Mail, takvim ve notlarında bununla ilgili bir şey bulamadım.';
      uncertain = top.length === 0;
    }

    const grounding = groundingCheck(answer, citedIds, chunks);
    uncertain = uncertain || grounding.uncertain;
    const cited = chunks.filter((c) => citedIds.includes(c.id));
    const sources = buildSourceRefs(cited.length ? cited : []);

    const byId = new Map(chunks.map((c) => [c.id, c]));
    const cards: AssistantRichCard[] = [];
    for (const card of cardsAi) {
      const c = byId.get(card.id);
      if (!c || cards.length >= 5) continue;
      const kind: AssistantRichCard['kind'] =
        card.kind === 'plan_block'
          ? 'plan_block'
          : (kindOf(c.sourceType) as AssistantRichCard['kind']);
      cards.push({
        kind,
        entityId: c.sourceId,
        title: c.topic ?? c.content.slice(0, 80),
        subtitle: c.personName ?? null,
        source: c.source,
      });
    }

    const approvalIds: string[] = [];
    const approvals: AssistantAskResponse['approvals'] = [];
    for (const intent of writeIntents.slice(0, 3)) {
      const schema = approvalPayloadSchemas[intent.type];
      if (!schema) continue;
      const parsed = schema.safeParse(intent.draft);
      if (!parsed.success) {
        log.info('write intent dropped (invalid payload)', { type: intent.type });
        continue;
      }
      const targetAccount =
        ctx.accounts.find((a) => a.id === (parsed.data as { accountId?: string }).accountId) ??
        null;
      const approval = await createApproval(
        {
          type: intent.type,
          what: intent.what,
          why: intent.why,
          payload: parsed.data as never,
          source: sources[0] ?? null,
          requestedBy: input.inputMode === 'voice' ? 'voice' : 'assistant',
        },
        {
          userId: user.id,
          now,
          locale: ctx.locale,
          timezone: ctx.timezone,
          provider: targetAccount?.provider ?? null,
        },
      );
      const { id } = await insertApproval(admin, approval);
      approvalIds.push(id);
      approvals.push({ ...approval, id });
    }

    const { data: saved, error: saveErr } = await admin
      .from('assistant_messages')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        role: 'assistant',
        content: answer,
        input_mode: 'text',
        sources,
        cards,
        approval_ids: approvalIds,
        uncertain,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        model,
      })
      .select('*')
      .single();
    if (saveErr || !saved)
      throw new AppError('internal', `Yanıt kaydedilemedi: ${saveErr?.message ?? ''}`);
    await admin.from('assistant_threads').update({ last_message_at: now }).eq('id', threadId);

    const response: AssistantAskResponse = {
      threadId,
      message: camelize<AssistantMessage>(saved),
      cards,
      approvals,
      suggestedFollowUps,
    };
    return json(response);
  }),
);
