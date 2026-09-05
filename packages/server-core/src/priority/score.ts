/**
 * Priority engine. Strict ordering — earlier levels dominate later ones:
 *  1 explicit user rules · 2 security · 3 hard deadline · 4 VIP · 5 waiting for user reply ·
 *  6 user's own commitment · 7 upcoming meeting relevance · 8 learned preference · 9 AI importance ·
 *  10 promotions/newsletter penalty. Recency is only a tiny tie-break.
 *
 * Levels 1-7 set tier floors (or, for low rules, ceilings); 8-9 decide the base tier; 10 can only
 * pull items down when nothing above it applied. The score is tierBase + within-tier points so
 * sorting by score never contradicts the tier.
 */
import type { Importance, LearnedPreference, Locale, PriorityRule } from '@da/domain';
import { formatDateLabel, formatDayLabel, formatDeadlinePhrase } from '../dates';
import { HOUR } from '../util';
import { rulePhrase, t } from './i18n';
import type { PriorityCandidate, PriorityContext, PriorityFactor, PriorityResult } from './types';

const TIER_RANK: Record<Importance, number> = { low: 0, normal: 1, high: 2, critical: 3 };
const RANK_TIER: Importance[] = ['low', 'normal', 'high', 'critical'];
const TIER_BASE: Record<Importance, number> = { critical: 750, high: 500, normal: 250, low: 0 };
const MAX_POINTS = 249;

function maxTier(a: Importance | null, b: Importance): Importance {
  if (a === null) return b;
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

function minTier(a: Importance | null, b: Importance): Importance {
  if (a === null) return b;
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

interface RuleHit {
  rule: PriorityRule;
  effect: 'important' | 'low' | 'mute';
}

function domainMatches(domain: string, pattern: string): boolean {
  const d = domain.toLowerCase();
  const p = pattern.toLowerCase().replace(/^@/, '');
  return d === p || d.endsWith(`.${p}`);
}

export function matchPriorityRules(rules: readonly PriorityRule[], c: PriorityCandidate): RuleHit[] {
  const email = (c.senderEmail ?? '').trim().toLowerCase();
  const domain = (c.senderDomain ?? (email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : '')).toLowerCase();
  const text = (c.text ?? '').toLocaleLowerCase('tr-TR');
  const hits: RuleHit[] = [];
  for (const rule of [...rules].sort((a, b) => a.position - b.position)) {
    if (!rule.enabled) continue;
    const value = rule.value.trim().toLowerCase();
    if (!value) continue;
    switch (rule.type) {
      case 'sender_important':
      case 'vip_notify':
        if ((value.includes('@') && value === email) || (!value.includes('@') && c.contactId && value === c.contactId.toLowerCase())) {
          hits.push({ rule, effect: 'important' });
        }
        break;
      case 'domain_important':
        if (domain && domainMatches(domain, value)) hits.push({ rule, effect: 'important' });
        break;
      case 'keyword_high':
        if (text.includes(rule.value.trim().toLocaleLowerCase('tr-TR'))) hits.push({ rule, effect: 'important' });
        break;
      case 'keyword_low':
        if (text.includes(rule.value.trim().toLocaleLowerCase('tr-TR'))) hits.push({ rule, effect: 'low' });
        break;
      case 'promotions_low':
        if (c.isPromotion || c.category === 'promotion') hits.push({ rule, effect: 'low' });
        break;
      case 'mute_sender':
        if (email && value === email) hits.push({ rule, effect: 'mute' });
        break;
      case 'mute_domain':
        if (domain && domainMatches(domain, value)) hits.push({ rule, effect: 'mute' });
        break;
    }
  }
  return hits;
}

/** Sum of enabled learned weights that apply to this candidate, clamped to -1..1. */
export function learnedWeight(learned: readonly LearnedPreference[], c: PriorityCandidate): { weight: number; statements: string[] } {
  const keys = new Set<string>();
  if (c.contactId) keys.add(c.contactId.toLowerCase());
  if (c.senderEmail) keys.add(c.senderEmail.toLowerCase());
  if (c.threadId) keys.add(c.threadId.toLowerCase());
  keys.add(c.category.toLowerCase());
  let weight = 0;
  const statements: string[] = [];
  for (const p of learned) {
    if (!p.enabled) continue;
    if (p.kind !== 'person_priority' && p.kind !== 'category_priority' && p.kind !== 'dismiss_pattern' && p.kind !== 'briefing_focus') continue;
    if (!keys.has(p.subjectKey.toLowerCase())) continue;
    weight += p.kind === 'dismiss_pattern' ? -Math.abs(p.weight) : p.weight;
    if (p.statement) statements.push(p.statement);
  }
  return { weight: Math.max(-1, Math.min(1, weight)), statements };
}

function hoursUntil(iso: string, nowMs: number): number {
  return (Date.parse(iso) - nowMs) / HOUR;
}

export function scoreCandidate(c: PriorityCandidate, ctx: PriorityContext): PriorityResult {
  const locale: Locale = ctx.locale ?? 'tr';
  const nowMs = Date.parse(ctx.now);
  const factors: PriorityFactor[] = [];
  const reasons: string[] = [];
  const fmt = { now: ctx.now, timezone: ctx.timezone, locale };

  // 1 — explicit rules
  const hits = matchPriorityRules(ctx.rules, c);
  const matchedRuleIds = hits.map((h) => h.rule.id);
  const mute = hits.find((h) => h.effect === 'mute');
  if (mute) {
    return {
      id: c.id,
      score: 0,
      tier: 'low',
      reasons: [rulePhrase(locale, mute.rule.type, mute.rule.value)],
      muted: true,
      factors: [{ level: 1, key: `rule:${mute.rule.type}`, points: 0, reason: rulePhrase(locale, mute.rule.type, mute.rule.value) }],
      matchedRuleIds,
    };
  }
  let floor: Importance | null = null;
  let explicitCeiling: Importance | null = null;
  let points = 0;
  const importantRule = hits.find((h) => h.effect === 'important');
  const lowRule = hits.find((h) => h.effect === 'low');
  // When both kinds of explicit rule match, the one the user placed first wins.
  const explicit = importantRule && lowRule ? (importantRule.rule.position <= lowRule.rule.position ? importantRule : lowRule) : (importantRule ?? lowRule);
  if (explicit) {
    const reason = rulePhrase(locale, explicit.rule.type, explicit.rule.value);
    if (explicit.effect === 'important') {
      floor = maxTier(floor, 'high');
      points += 120;
    } else {
      explicitCeiling = 'low';
      points -= 80;
    }
    factors.push({ level: 1, key: `rule:${explicit.rule.type}`, points: explicit.effect === 'important' ? 120 : -80, reason });
    reasons.push(reason);
  }

  // 2 — security
  if (c.category === 'security') {
    const tier: Importance = c.importance === 'critical' ? 'critical' : 'high';
    floor = maxTier(floor, tier);
    const pts = tier === 'critical' ? 110 : 90;
    points += pts;
    const reason = t(locale, 'security');
    factors.push({ level: 2, key: 'security', points: pts, reason });
    reasons.push(reason);
  }

  // 3 — hard deadline
  if (c.deadlineAt && !Number.isNaN(Date.parse(c.deadlineAt))) {
    const h = hoursUntil(c.deadlineAt, nowMs);
    const hasTime = c.deadlineHasTime ?? true;
    let pts = 0;
    let reason: string;
    if (h < -72) {
      pts = 20;
      reason = t(locale, 'deadlineOverdue', { day: formatDayLabel(c.deadlineAt, fmt) });
    } else if (h < 0) {
      pts = 100;
      floor = maxTier(floor, 'high');
      reason = t(locale, 'deadlineOverdue', { day: formatDayLabel(c.deadlineAt, fmt) });
    } else {
      const phrase = formatDeadlinePhrase(c.deadlineAt, { ...fmt, hasTime });
      const actionable = c.requiresUserAction || c.isUserCommitment || c.kind === 'task' || c.kind === 'commitment';
      if (h <= 24) {
        pts = 110;
        floor = maxTier(floor, actionable ? 'critical' : 'high');
      } else if (h <= 72) {
        pts = 80;
        floor = maxTier(floor, 'high');
      } else if (h <= 24 * 7) {
        pts = 50;
        floor = maxTier(floor, 'normal');
      } else {
        pts = 25;
      }
      reason = c.isUserCommitment ? t(locale, 'deadlineCommitment', { phrase }) : c.requiresUserAction ? t(locale, 'deadlineReply', { phrase }) : t(locale, 'deadline', { phrase });
    }
    points += pts;
    factors.push({ level: 3, key: 'deadline', points: pts, reason });
    reasons.push(reason);
  }

  // 4 — VIP person
  const vip = findVip(ctx, c);
  if (vip) {
    floor = maxTier(floor, 'high');
    points += 70;
    const reason = t(locale, 'vip', { name: vip });
    factors.push({ level: 4, key: 'vip', points: 70, reason });
    reasons.push(reason);
  }

  // 5 — waiting for user reply
  if (c.requiresUserAction && (c.category === 'waiting_for_user' || c.category === 'action_required' || c.kind === 'email')) {
    floor = maxTier(floor, 'normal');
    points += 50;
    const days = Math.floor(c.ageHours / 24);
    const reason = days >= 2 ? t(locale, 'waitingDays', { days: String(days) }) : t(locale, 'waiting');
    factors.push({ level: 5, key: 'waiting_for_user', points: 50, reason });
    reasons.push(reason);
  }

  // 6 — user's own commitment
  if (c.isUserCommitment) {
    floor = maxTier(floor, 'normal');
    points += 45;
    factors.push({ level: 6, key: 'commitment', points: 45, reason: t(locale, 'commitment') });
    if (!c.deadlineAt) reasons.push(t(locale, 'commitment'));
  }

  // 7 — upcoming meeting relevance
  if (c.relatedMeetingAt && !Number.isNaN(Date.parse(c.relatedMeetingAt))) {
    const h = hoursUntil(c.relatedMeetingAt, nowMs);
    if (h >= -1 && h <= 72) {
      const pts = h <= 24 ? 40 : 20;
      floor = maxTier(floor, 'normal');
      points += pts;
      const reason = t(locale, 'meeting', { label: formatDateLabel(c.relatedMeetingAt, { ...fmt, withTime: true }) });
      factors.push({ level: 7, key: 'meeting', points: pts, reason });
      reasons.push(reason);
    }
  }

  // 8 — learned preference (ignored when an explicit rule spoke)
  let learnedShift = 0;
  if (!explicit) {
    const { weight, statements } = learnedWeight(ctx.learned, c);
    if (weight !== 0) {
      const pts = Math.round(weight * 40);
      points += pts;
      if (weight >= 0.5) learnedShift = 1;
      if (weight <= -0.5) learnedShift = -1;
      const reason = statements[0] ? t(locale, 'learned', { statement: statements[0] }) : undefined;
      factors.push({ level: 8, key: 'learned', points: pts, reason });
      if (reason) reasons.push(reason);
    }
  }

  // 9 — AI importance
  const aiPts = Math.round({ critical: 60, high: 40, normal: 15, low: 0 }[c.importance] * (0.5 + 0.5 * Math.max(0, Math.min(1, c.confidence))));
  points += aiPts;
  const aiReason = c.importance === 'critical' ? t(locale, 'aiCritical') : c.importance === 'high' ? t(locale, 'aiHigh') : undefined;
  factors.push({ level: 9, key: `ai:${c.importance}`, points: aiPts, reason: aiReason });
  if (aiReason && reasons.length === 0) reasons.push(aiReason);

  // 10 — promotions / newsletter penalty (only bites when nothing above applied)
  let weakCeiling: Importance | null = null;
  if (c.isPromotion || c.isNewsletter || c.category === 'promotion') {
    const pts = c.isPromotion || c.category === 'promotion' ? -60 : -40;
    points += pts;
    const reason = t(locale, c.isPromotion || c.category === 'promotion' ? 'promotion' : 'newsletter');
    factors.push({ level: 10, key: 'promotion', points: pts, reason });
    reasons.push(reason);
    if (floor === null) weakCeiling = 'low';
  }

  // 11 — recency tie-break (max 5 points)
  const recency = Math.max(0, Math.min(5, 5 - c.ageHours / 24));
  points += recency;
  factors.push({ level: 11, key: 'recency', points: Math.round(recency * 10) / 10 });

  // Tier resolution
  let rank = TIER_RANK[c.importance] + learnedShift;
  rank = Math.max(0, Math.min(3, rank));
  let tier = RANK_TIER[rank] ?? 'normal';
  if (floor) tier = maxTier(tier, floor);
  if (weakCeiling) tier = minTier(tier, weakCeiling);
  if (explicitCeiling) tier = minTier(tier, explicitCeiling);

  const score = TIER_BASE[tier] + Math.max(0, Math.min(MAX_POINTS, Math.round(points)));
  return { id: c.id, score, tier, reasons, muted: false, factors, matchedRuleIds };
}

function findVip(ctx: PriorityContext, c: PriorityCandidate): string | null {
  const email = (c.senderEmail ?? '').trim().toLowerCase();
  const contactId = (c.contactId ?? '').trim().toLowerCase();
  for (const v of ctx.vips) {
    if (contactId && v.contactId && v.contactId.toLowerCase() === contactId) return v.displayName;
    if (email && v.email && v.email.trim().toLowerCase() === email) return v.displayName;
  }
  if (c.senderName) {
    const name = c.senderName.trim().toLocaleLowerCase('tr-TR');
    const byName = ctx.vips.find((v) => !v.email && !v.contactId && v.displayName.trim().toLocaleLowerCase('tr-TR') === name);
    if (byName) return byName.displayName;
  }
  return null;
}

export function tierRank(tier: Importance): number {
  return TIER_RANK[tier];
}
