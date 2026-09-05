/**
 * Analysis pipeline (runs after every mail/calendar sync and during the initial 72-hour analysis).
 *
 *  Stage 1  triage      deterministic: spam/promo/newsletter → no AI; rules & VIP; deadline phrases.
 *  Stage 2  classify    small model, batched (≤ 20 threads / call), fingerprint-cached.
 *  Stage 3  deep        larger model only for threads that need it (important / action / deadline).
 *  Then     extraction  commitments (rule-based + AI hints), life events, follow-ups, contacts, memory.
 *  Finally  insights    priority engine (explicit rules > VIP > … > learned) → Today / Flow cards,
 *                       plus critical pushes. Every insight carries a SourceRef.
 */
import type {
  CalendarEvent,
  Commitment,
  Contact,
  EmailAnalysis,
  EmailMessage,
  EmailThread,
  FollowUp,
  Insight,
  LearnedPreference,
  LifeEvent,
  PriorityRule,
  RetentionOption,
  SuggestedAction,
  TaskItem,
  VipPerson,
} from '@da/domain';
import { emailAnalysisAiSchema, emailBatchClassificationSchema } from '@da/validation';
import { EMAIL_BATCH_MAX, emailBatchClassify, emailDeepAnalysis } from '@da/server-core/ai';
import {
  commitmentDedupeKey,
  extractCommitments,
  toCommitmentDraft,
} from '@da/server-core/commitments';
import { AppError } from '@da/server-core/errors';
import { detectFollowUps, refreshFollowUpStatus } from '@da/server-core/followups';
import { buildInsights, type InsightDraft } from '@da/server-core/insights';
import {
  extractLifeEvent,
  lifeEventDedupeKey,
  lifeEventEventAt,
  lifeEventStatus,
  lifeEventTitle,
} from '@da/server-core/lifeEvents';
import {
  buildCriticalEmailNotification,
  buildLifeEventNotification,
} from '@da/server-core/notifications';
import {
  scoreCandidate,
  type PriorityCandidate,
  type PriorityContext,
} from '@da/server-core/priority';
import { shouldSendToAi, triageEmail, type TriageResult } from '@da/server-core/triage';
import { aiConfigured, checkAiBudget, createAi } from '../ai.ts';
import { loadUserContext } from '../context.ts';
import type { Db } from '../db.ts';
import { log } from '../log.ts';
import { upsertMemory } from '../memory.ts';
import { resolvePlan } from '../plan.ts';
import { loadPushTarget, sendPush } from '../push.ts';
import { camelize, localDateKey } from '../rows.ts';

export interface PipelineOutcome {
  userId: string;
  threadsTriaged: number;
  aiClassified: number;
  aiDeep: number;
  insights: number;
  commitments: number;
  lifeEvents: number;
  followUps: number;
  pushes: number;
}

interface ThreadWithMessages {
  thread: EmailThread;
  messages: EmailMessage[];
  last: EmailMessage;
}

const MAX_THREADS_PER_RUN = 60;
const DEEP_MAX_PER_RUN = 15;

function hoursSince(iso: string, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(iso)) / 3_600_000);
}

function senderDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  return at > 0 ? (email as string).slice(at + 1).toLowerCase() : null;
}

/** Stage 1 → triage result + provisional analysis (rules only). */
function provisionalAnalysis(
  t: ThreadWithMessages,
  triage: TriageResult,
  locale: 'tr' | 'en',
): EmailAnalysis {
  const actions: SuggestedAction[] = [];
  if (triage.signals.asksUser || triage.signals.deadline)
    actions.push({ kind: 'reply', label: locale === 'en' ? 'Reply' : 'Yanıtla' });
  if (triage.deadline)
    actions.push({ kind: 'remind', label: locale === 'en' ? 'Remind me' : 'Hatırlat' });
  actions.push({
    kind: 'open_original',
    label: locale === 'en' ? 'Open original' : 'Orijinali aç',
  });
  return {
    summary: t.thread.snippet.slice(0, 200) || t.thread.subject,
    importance: triage.preImportance ?? 'normal',
    category: triage.preCategory ?? 'information',
    reasonImportant: triage.reasons[0] ?? null,
    requiresUserAction: triage.signals.asksUser || Boolean(triage.deadline),
    deadline: triage.deadline?.iso ?? null,
    deadlineText: triage.deadline?.text ?? null,
    keyPoints: [],
    people: [{ name: t.last.from.name ?? null, email: t.last.from.email }],
    commitments: [],
    followUp: t.thread.lastFromUser ? { expected: true, nudgeAfterDays: 3, reason: null } : null,
    suggestedActions: actions,
    lifeEvent: null,
    confidence: triage.fastPath === 'security' ? 0.9 : 0.55,
    producedBy: triage.bucket === 'rules' ? 'rules' : 'heuristic',
  };
}

export async function runPipeline(
  admin: Db,
  userId: string,
  opts: { now: string; reason: 'sync' | 'initial' | 'manual' },
): Promise<PipelineOutcome> {
  const ctx = await loadUserContext(admin, userId);
  const plan = await resolvePlan(admin, userId);
  const nowMs = Date.parse(opts.now);
  const outcome: PipelineOutcome = {
    userId,
    threadsTriaged: 0,
    aiClassified: 0,
    aiDeep: 0,
    insights: 0,
    commitments: 0,
    lifeEvents: 0,
    followUps: 0,
    pushes: 0,
  };

  const [{ data: ruleRows }, { data: vipRows }, { data: learnedRows }, { data: pendingRows }] =
    await Promise.all([
      admin
        .from('priority_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('enabled', true)
        .order('position', { ascending: true }),
      admin.from('vip_people').select('*').eq('user_id', userId),
      admin.from('learned_preferences').select('*').eq('user_id', userId).eq('enabled', true),
      admin
        .from('email_threads')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .is('analyzed_at', null)
        .order('last_message_at', { ascending: false })
        .limit(MAX_THREADS_PER_RUN),
    ]);
  const rules = camelize<PriorityRule[]>(ruleRows ?? []);
  const vips = camelize<VipPerson[]>(vipRows ?? []);
  const learned =
    ctx.preferences?.learnFromInteractions === false
      ? []
      : camelize<LearnedPreference[]>(learnedRows ?? []);
  const pending = camelize<EmailThread[]>(pendingRows ?? []);
  const userEmails = new Set(ctx.userEmails);

  // Load messages for pending threads
  const items: ThreadWithMessages[] = [];
  if (pending.length) {
    const { data: msgRows } = await admin
      .from('email_messages')
      .select('*')
      .eq('user_id', userId)
      .in(
        'thread_id',
        pending.map((t) => t.id),
      )
      .is('deleted_at', null)
      .order('sent_at', { ascending: true });
    const messages = camelize<
      (Omit<EmailMessage, 'from' | 'to' | 'cc'> & {
        fromParticipant: EmailMessage['from'];
        toParticipants: EmailMessage['to'];
        ccParticipants: EmailMessage['cc'];
      })[]
    >(msgRows ?? []).map(
      (m) =>
        ({
          ...m,
          from: m.fromParticipant,
          to: m.toParticipants,
          cc: m.ccParticipants,
        }) as EmailMessage,
    );
    for (const thread of pending) {
      const list = messages.filter((m) => m.threadId === thread.id);
      const last = list[list.length - 1];
      if (last) items.push({ thread, messages: list, last });
    }
  }

  // Stage 1: triage
  const triaged = new Map<string, TriageResult>();
  const analyses = new Map<string, EmailAnalysis>();
  for (const it of items) {
    const triage = triageEmail(
      {
        from: it.last.from,
        to: it.last.to,
        subject: it.thread.subject,
        snippet: it.last.snippet,
        bodyText: it.last.bodyText ?? null,
        labels: [...it.thread.labels, ...it.last.labels],
        isFromUser: it.last.isFromUser,
        hasAttachments: it.last.hasAttachments,
        sentAt: it.last.sentAt,
      },
      { rules, vips, now: opts.now, timezone: ctx.timezone, locale: ctx.locale },
    );
    triaged.set(it.thread.id, triage);
    analyses.set(it.thread.id, provisionalAnalysis(it, triage, ctx.locale));
    outcome.threadsTriaged += 1;
  }

  // Stage 2 + 3: AI (fingerprint-cached, budget-aware)
  const aiOk = aiConfigured() && items.length > 0;
  if (aiOk) {
    const aiCtx = { userId, plan: plan.plan, timezone: ctx.timezone, locale: ctx.locale };
    try {
      await checkAiBudget(aiCtx, 2000);
      const ai = createAi(aiCtx);
      const candidates = items.filter((it) => {
        const tr = triaged.get(it.thread.id) as TriageResult;
        return shouldSendToAi(tr, false) && !it.last.isFromUser;
      });
      const { data: cached } = candidates.length
        ? await admin
            .from('ai_analysis_cache')
            .select('fingerprint, purpose, result')
            .eq('user_id', userId)
            .in(
              'fingerprint',
              candidates.map((c) => c.thread.fingerprint),
            )
        : { data: [] };
      const cache = new Map(
        ((cached ?? []) as { fingerprint: string; purpose: string; result: unknown }[]).map((c) => [
          `${c.purpose}:${c.fingerprint}`,
          c.result,
        ]),
      );
      const signals = {
        userName: ctx.firstName || ctx.displayName,
        userEmails: ctx.userEmails,
        vipEmails: vips.map((v) => v.email).filter((e): e is string => Boolean(e)),
        interests: ctx.preferences?.interests ?? [],
        userRules: rules.map((r) => r.label),
      };

      // Stage 2: batch classification
      const toClassify = candidates.filter((c) => !cache.has(`classify:${c.thread.fingerprint}`));
      for (let i = 0; i < toClassify.length; i += EMAIL_BATCH_MAX) {
        const batch = toClassify.slice(i, i + EMAIL_BATCH_MAX);
        try {
          const spec = emailBatchClassify({
            now: opts.now,
            locale: ctx.locale,
            timezone: ctx.timezone,
            ...signals,
            emails: batch.map((c) => ({
              id: c.thread.id,
              from: { name: c.last.from.name ?? null, email: c.last.from.email },
              subject: c.thread.subject,
              snippet: c.last.snippet,
              sentAt: c.last.sentAt,
              hasAttachments: c.last.hasAttachments,
              isFromUser: c.last.isFromUser,
            })),
          });
          const result = await ai.generateStructured(emailBatchClassificationSchema, spec, {
            userId,
            locale: ctx.locale,
          });
          for (const r of result.data.results) {
            const c = batch.find((b) => b.thread.id === r.id);
            if (!c) continue;
            cache.set(`classify:${c.thread.fingerprint}`, r);
            await admin
              .from('ai_analysis_cache')
              .upsert(
                {
                  user_id: userId,
                  fingerprint: c.thread.fingerprint,
                  purpose: 'classify',
                  result: r,
                  model: result.model,
                },
                { onConflict: 'user_id,fingerprint,purpose' },
              );
          }
          outcome.aiClassified += batch.length;
        } catch (e) {
          log.warn('batch classify failed', { error: e instanceof Error ? e.message : 'unknown' });
          break;
        }
      }
      // Apply classification and pick deep candidates
      const deep: ThreadWithMessages[] = [];
      for (const c of candidates) {
        const cls = cache.get(`classify:${c.thread.fingerprint}`) as
          | {
              importance: EmailAnalysis['importance'];
              category: EmailAnalysis['category'];
              requiresUserAction: boolean;
              needsDeepAnalysis: boolean;
              oneLine: string;
              confidence: number;
            }
          | undefined;
        if (!cls) continue;
        const base = analyses.get(c.thread.id) as EmailAnalysis;
        analyses.set(c.thread.id, {
          ...base,
          summary: cls.oneLine || base.summary,
          importance: cls.importance,
          category: cls.category,
          requiresUserAction: cls.requiresUserAction,
          confidence: cls.confidence,
          producedBy: 'ai_small',
        });
        if (cls.needsDeepAnalysis || cls.importance === 'critical' || cls.importance === 'high')
          deep.push(c);
      }
      // Stage 3: deep analysis
      for (const c of deep.slice(0, DEEP_MAX_PER_RUN)) {
        const key = `deep:${c.thread.fingerprint}`;
        let data = cache.get(key) as ReturnType<typeof emailAnalysisAiSchema.parse> | undefined;
        if (!data) {
          try {
            const previous = c.messages
              .slice(0, -1)
              .slice(-3)
              .map((m) => ({
                from: { name: m.from.name ?? null, email: m.from.email },
                sentAt: m.sentAt,
                excerpt: (m.bodyText ?? m.snippet).slice(0, 600),
              }));
            const spec = emailDeepAnalysis({
              now: opts.now,
              locale: ctx.locale,
              timezone: ctx.timezone,
              ...signals,
              message: {
                id: c.last.id,
                subject: c.thread.subject,
                from: { name: c.last.from.name ?? null, email: c.last.from.email },
                to: c.last.to.map((p) => ({ name: p.name ?? null, email: p.email })),
                cc: c.last.cc.map((p) => ({ name: p.name ?? null, email: p.email })),
                sentAt: c.last.sentAt,
                body: c.last.bodyText ?? c.last.snippet,
                attachments: c.last.attachments.map((a) => ({
                  filename: a.filename,
                  mimeType: a.mimeType,
                })),
                isFromUser: c.last.isFromUser,
              },
              previousMessages: previous,
            });
            const result = await ai.generateStructured(emailAnalysisAiSchema, spec, {
              userId,
              locale: ctx.locale,
            });
            data = result.data;
            await admin
              .from('ai_analysis_cache')
              .upsert(
                {
                  user_id: userId,
                  fingerprint: c.thread.fingerprint,
                  purpose: 'deep',
                  result: data,
                  model: result.model,
                },
                { onConflict: 'user_id,fingerprint,purpose' },
              );
            outcome.aiDeep += 1;
          } catch (e) {
            log.warn('deep analysis failed', { error: e instanceof Error ? e.message : 'unknown' });
            continue;
          }
        }
        analyses.set(c.thread.id, {
          summary: data.summary,
          importance: data.importance,
          category: data.category,
          reasonImportant: data.reasonImportant ?? null,
          requiresUserAction: data.requiresUserAction,
          deadline: data.deadline?.iso ?? null,
          deadlineText: data.deadline?.text ?? null,
          keyPoints: data.keyPoints,
          people: data.people,
          commitments: data.commitments.map((cm) => ({
            text: cm.text,
            direction: cm.direction,
            dueAt: cm.due?.iso ?? null,
            dueText: cm.due?.text ?? null,
            counterpart: cm.counterpart ?? null,
          })),
          followUp: data.followUp ?? null,
          suggestedActions: data.suggestedActions,
          lifeEvent: data.lifeEvent ?? null,
          confidence: data.confidence,
          producedBy: 'ai_large',
        });
      }
    } catch (e) {
      log.info('pipeline ai skipped', { reason: e instanceof AppError ? e.code : 'unknown' });
    }
  }

  // Persist thread analyses + priority, contacts, commitments, life events
  const priorityCtx: PriorityContext = {
    rules,
    vips,
    learned,
    now: opts.now,
    timezone: ctx.timezone,
    locale: ctx.locale,
  };
  const rank = (candidate: PriorityCandidate) => {
    const r = scoreCandidate(candidate, priorityCtx);
    return { score: r.score, tier: r.tier, reasons: r.reasons, muted: r.muted };
  };
  const contactIdByEmail = new Map<string, string>();
  for (const it of items) {
    const triage = triaged.get(it.thread.id) as TriageResult;
    const analysis = analyses.get(it.thread.id) as EmailAnalysis;
    const senderEmail = it.last.from.email.toLowerCase();
    const candidate: PriorityCandidate = {
      id: it.thread.id,
      kind: 'email',
      category: analysis.category,
      importance: analysis.importance,
      deadlineAt: analysis.deadline ?? null,
      senderEmail,
      senderDomain: senderDomain(senderEmail),
      senderName: it.last.from.name ?? null,
      threadId: it.thread.id,
      requiresUserAction: analysis.requiresUserAction,
      isUserCommitment: analysis.commitments.some((c) => c.direction === 'user_owes'),
      isPromotion: triage.signals.promotion || triage.signals.promoSubject,
      isNewsletter: triage.signals.newsletter,
      confidence: analysis.confidence,
      ageHours: hoursSince(it.thread.lastMessageAt, nowMs),
      text: `${it.thread.subject}\n${it.thread.snippet}`,
    };
    const priority = scoreCandidate(candidate, priorityCtx);
    await admin
      .from('email_threads')
      .update({
        analysis,
        importance: analysis.importance,
        category: analysis.category,
        triage: triage.bucket,
        priority_score: priority.score,
        priority_reasons: priority.reasons,
        analyzed_at: opts.now,
      })
      .eq('id', it.thread.id);

    // Contacts (counterparts only)
    for (const p of it.thread.participants) {
      const email = p.email?.toLowerCase();
      if (!email || userEmails.has(email) || contactIdByEmail.has(email)) continue;
      const { data: cid } = await admin
        .schema('internal')
        .rpc('upsert_contact', {
          p_user: userId,
          p_name: p.name ?? email,
          p_email: email,
          p_at: it.thread.lastMessageAt,
        });
      if (typeof cid === 'string') contactIdByEmail.set(email, cid);
    }
    const counterpartEmail = it.last.isFromUser ? it.last.to[0]?.email?.toLowerCase() : senderEmail;
    const counterpartContactId = counterpartEmail
      ? (contactIdByEmail.get(counterpartEmail) ?? null)
      : null;
    const sourceType = ctx.accountSourceTypes[it.thread.accountId] ?? 'gmail';
    const source = {
      type: sourceType,
      id: it.thread.id,
      externalId: it.last.externalMessageId,
      label: sourceType === 'outlook' ? 'Outlook' : 'Gmail',
      person: it.last.from.name ?? it.last.from.email,
      timestamp: it.last.sentAt,
      excerpt: it.last.snippet.slice(0, 280),
    } as const;

    // Commitments: rule-based on the last message (user-sent or received), merged with AI hints
    if (triage.bucket !== 'skip' && triage.bucket !== 'low') {
      const counterpartName = it.last.isFromUser
        ? (it.last.to[0]?.name ?? it.last.to[0]?.email ?? null)
        : (it.last.from.name ?? it.last.from.email);
      const candidates = extractCommitments({
        text: it.last.bodyText ?? it.last.snippet,
        authorIsUser: it.last.isFromUser,
        counterpartHint: counterpartName
          ? { name: counterpartName, email: counterpartEmail ?? null }
          : null,
        now: it.last.sentAt,
        timezone: ctx.timezone,
        locale: ctx.locale,
        topic: it.thread.subject,
      });
      const drafts = candidates.map((c) => ({
        ...toCommitmentDraft(c, source),
        dedupeKey: commitmentDedupeKey(c, it.thread.id),
      }));
      for (const hint of analysis.commitments) {
        if (
          drafts.some(
            (d) => d.text.toLocaleLowerCase('tr-TR') === hint.text.toLocaleLowerCase('tr-TR'),
          )
        )
          continue;
        drafts.push({
          text: hint.text,
          quote: null,
          direction: hint.direction,
          counterpartName: hint.counterpart ?? counterpartName,
          counterpartContactId: null,
          dueAt: hint.dueAt ?? null,
          dueText: hint.dueText ?? null,
          status: 'proposed',
          source,
          confidence: Math.min(analysis.confidence, 0.7),
          completedAt: null,
          postponedUntil: null,
          relatedEventId: null,
          deletedAt: null,
          dedupeKey: `commit:${it.thread.id}:${hint.direction}:${hint.text.toLocaleLowerCase('tr-TR').slice(0, 60)}`,
        });
      }
      if (drafts.length) {
        const { error } = await admin.from('commitments').upsert(
          drafts.map((d) => ({
            user_id: userId,
            text: d.text,
            quote: d.quote ?? null,
            direction: d.direction,
            counterpart_name: d.counterpartName ?? null,
            counterpart_contact_id: counterpartContactId,
            due_at: d.dueAt ?? null,
            due_text: d.dueText ?? null,
            status: d.status,
            source: d.source,
            confidence: d.confidence,
            dedupe_key: d.dedupeKey,
          })),
          { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
        );
        if (!error) outcome.commitments += drafts.length;
      }
    }

    // Life events (deterministic extractor; AI extraction only confirms fields present in the source)
    if (!it.last.isFromUser && triage.bucket !== 'skip') {
      const extracted = extractLifeEvent({
        subject: it.thread.subject,
        from: { name: it.last.from.name ?? null, email: it.last.from.email },
        bodyText: it.last.bodyText ?? it.last.snippet,
        now: it.last.sentAt,
        timezone: ctx.timezone,
        locale: ctx.locale,
      });
      const le =
        extracted ??
        (analysis.lifeEvent
          ? { ...analysis.lifeEvent, evidence: [], occurredAt: null, provider: null }
          : null);
      if (le && le.confidence >= 0.5) {
        const status = lifeEventStatus(le, opts.now, ctx.timezone);
        const { data: row } = await admin
          .from('life_events')
          .upsert(
            {
              user_id: userId,
              type: le.type,
              title: lifeEventTitle(le, ctx.locale, { now: opts.now, timezone: ctx.timezone }),
              details: le.details,
              event_at: lifeEventEventAt(le),
              status,
              source,
              confidence: le.confidence,
              dedupe_key: lifeEventDedupeKey(le, { timezone: ctx.timezone }),
              deleted_at: null,
            },
            { onConflict: 'user_id,dedupe_key' },
          )
          .select('id, created_at, updated_at')
          .maybeSingle();
        const r = row as { id: string; created_at: string; updated_at: string } | null;
        if (r) {
          outcome.lifeEvents += 1;
          if (le.type === 'security' && r.created_at === r.updated_at) {
            const target = await loadPushTarget(admin, userId, {
              isPro: plan.plan === 'pro',
              timezone: ctx.timezone,
            });
            if (target) {
              const res = await sendPush(
                admin,
                target,
                buildLifeEventNotification(
                  { lifeEventId: r.id, type: 'security', title: lifeEventTitle(le, ctx.locale) },
                  { locale: ctx.locale, timezone: ctx.timezone, now: opts.now },
                ),
                { isCritical: true },
              );
              if (res.status === 'sent') outcome.pushes += 1;
            }
          }
        }
      }
    }

    // Memory
    await upsertMemory(admin, userId, {
      source: {
        kind: 'email_thread',
        entity: { ...it.thread, analysis },
        analysis,
        bodyText: it.last.bodyText ?? null,
        sourceType,
        contactId: counterpartContactId,
      },
      timezone: ctx.timezone,
      locale: ctx.locale,
      userEmails: ctx.userEmails,
      retentionDays: retentionDays(ctx.preferences?.retention),
    });

    // Critical push
    if (analysis.importance === 'critical' && analysis.requiresUserAction && !it.last.isFromUser) {
      const target = await loadPushTarget(admin, userId, {
        isPro: plan.plan === 'pro',
        timezone: ctx.timezone,
      });
      if (target) {
        const res = await sendPush(
          admin,
          target,
          buildCriticalEmailNotification(
            {
              threadId: it.thread.id,
              person: it.last.from.name ?? it.last.from.email,
              deadlineAt: analysis.deadline ?? null,
            },
            { locale: ctx.locale, timezone: ctx.timezone, now: opts.now },
          ),
          { importance: 'critical' },
        );
        if (res.status === 'sent') outcome.pushes += 1;
      }
    }
  }

  // Follow-ups over recent sent threads
  const { data: sentRows } = await admin
    .from('email_threads')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('last_from_user', true)
    .gte('last_message_at', new Date(nowMs - 30 * 86_400_000).toISOString())
    .limit(200);
  const { data: existingFuRows } = await admin.from('follow_ups').select('*').eq('user_id', userId);
  const { data: contactRows } = await admin
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(500);
  const existingFollowUps = camelize<FollowUp[]>(existingFuRows ?? []);
  const contacts = camelize<Contact[]>(contactRows ?? []);
  const followUpDrafts = detectFollowUps({
    threads: camelize<EmailThread[]>(sentRows ?? []),
    now: opts.now,
    timezone: ctx.timezone,
    learned,
    existing: existingFollowUps,
    contactsById: Object.fromEntries(contacts.map((c) => [c.id, c])),
    userEmails: ctx.userEmails,
    accountSourceTypes: ctx.accountSourceTypes,
  });
  if (followUpDrafts.length) {
    const { error } = await admin.from('follow_ups').upsert(
      followUpDrafts.map((f) => ({
        user_id: userId,
        thread_id: f.threadId,
        contact_id: f.contactId ?? null,
        counterpart_name: f.counterpartName,
        topic: f.topic,
        sent_at: f.sentAt,
        nudge_after_days: f.nudgeAfterDays,
        status: f.status,
        snoozed_until: f.snoozedUntil ?? null,
        replied_at: f.repliedAt ?? null,
        closed_at: f.closedAt ?? null,
        source: f.source,
        dismiss_count: f.dismissCount,
      })),
      { onConflict: 'user_id,thread_id', ignoreDuplicates: true },
    );
    if (!error) outcome.followUps += followUpDrafts.length;
  }
  // Refresh statuses of watched follow-ups (nudge_due when the cadence elapsed; replied when the thread moved on)
  for (const f of existingFollowUps.filter(
    (x) => x.status === 'watching' || x.status === 'snoozed',
  )) {
    const refreshed = refreshFollowUpStatus(f, opts.now, ctx.timezone);
    if (refreshed.status !== f.status)
      await admin.from('follow_ups').update({ status: refreshed.status }).eq('id', f.id);
  }

  // Insights over the current state (last 7 days + horizon)
  const since = new Date(nowMs - 7 * 86_400_000).toISOString();
  const horizon = new Date(nowMs + 7 * 86_400_000).toISOString();
  const [
    { data: threadRows },
    { data: eventRows },
    { data: taskRows },
    { data: commitmentRows },
    { data: fuRows },
    { data: leRows },
  ] = await Promise.all([
    admin
      .from('email_threads')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('user_dismissed', false)
      .eq('user_marked_done', false)
      .gte('last_message_at', since)
      .limit(300),
    admin
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_at', new Date(nowMs - 3_600_000).toISOString())
      .lte('start_at', horizon)
      .limit(200),
    admin
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('status', 'open')
      .limit(200),
    admin
      .from('commitments')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('status', ['open', 'postponed'])
      .limit(200),
    admin
      .from('follow_ups')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['watching', 'nudge_due', 'snoozed'])
      .limit(100),
    admin
      .from('life_events')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('status', ['upcoming', 'today'])
      .limit(100),
  ]);
  const drafts: InsightDraft[] = buildInsights({
    threads: camelize<EmailThread[]>(threadRows ?? []),
    events: camelize<CalendarEvent[]>(eventRows ?? []),
    tasks: camelize<TaskItem[]>(taskRows ?? []),
    commitments: camelize<Commitment[]>(commitmentRows ?? []),
    followUps: camelize<FollowUp[]>(fuRows ?? []),
    lifeEvents: camelize<LifeEvent[]>(leRows ?? []),
    now: opts.now,
    timezone: ctx.timezone,
    locale: ctx.locale,
    rank,
    userEmails: ctx.userEmails,
    accountSourceTypes: ctx.accountSourceTypes,
  });
  if (drafts.length) {
    // Never resurrect cards the user completed/dismissed: only insert new keys or update active ones.
    const { data: existingInsights } = await admin
      .from('insights')
      .select('id, dedupe_key, status')
      .eq('user_id', userId)
      .in(
        'dedupe_key',
        drafts.map((d) => d.dedupeKey),
      );
    const byKey = new Map(
      (
        (existingInsights ?? []) as { id: string; dedupe_key: string; status: Insight['status'] }[]
      ).map((i) => [i.dedupe_key, i]),
    );
    const today = localDateKey(opts.now, ctx.timezone);
    const rows = drafts
      .filter((d) => {
        const ex = byKey.get(d.dedupeKey);
        return !ex || ex.status === 'active' || ex.status === 'snoozed' || ex.status === 'expired';
      })
      .map((d) => {
        const ex = byKey.get(d.dedupeKey);
        return {
          ...(ex ? { id: ex.id } : {}),
          user_id: userId,
          kind: d.kind,
          badge: d.badge,
          title: d.title,
          subtitle: d.subtitle ?? null,
          reason: d.reason ?? null,
          importance: d.importance,
          priority_score: d.priorityScore,
          priority_reasons: d.priorityReasons,
          time_label: d.timeLabel ?? null,
          due_at: d.dueAt ?? null,
          status: ex?.status === 'snoozed' ? 'snoozed' : 'active',
          source: d.source,
          actions: d.actions,
          entity_type: d.entityType,
          entity_id: d.entityId,
          tags: d.tags,
          for_date: ex ? undefined : d.forDate < today ? today : d.forDate,
          confidence: d.confidence,
          is_low_confidence: d.isLowConfidence,
          dedupe_key: d.dedupeKey,
          deleted_at: null,
        };
      })
      .map((r) => (r.for_date === undefined ? (({ for_date: _omit, ...rest }) => rest)(r) : r));
    if (rows.length) {
      const { error } = await admin
        .from('insights')
        .upsert(rows, { onConflict: 'user_id,dedupe_key' });
      if (error) log.warn('insight upsert failed', { error: error.message });
      else outcome.insights = rows.length;
    }
    // Expire active cards whose entity is no longer relevant (not rebuilt in this run and past due)
    const keep = new Set(drafts.map((d) => d.dedupeKey));
    const { data: stale } = await admin
      .from('insights')
      .select('id, dedupe_key, due_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .lt('due_at', opts.now);
    const staleIds = ((stale ?? []) as { id: string; dedupe_key: string }[])
      .filter((s) => !keep.has(s.dedupe_key))
      .map((s) => s.id);
    if (staleIds.length)
      await admin.from('insights').update({ status: 'expired' }).in('id', staleIds);
  }
  return outcome;
}

function retentionDays(option: RetentionOption | undefined): number | null {
  switch (option) {
    case '30d':
      return 30;
    case '90d':
      return 90;
    case '1y':
      return 365;
    default:
      return null;
  }
}
