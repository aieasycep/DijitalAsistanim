/** Deterministic ranking and diverse top-N selection. */
import { scoreCandidate, tierRank } from './score';
import type {
  PriorityCandidate,
  PriorityContext,
  RankedCandidate,
  SelectTopOptions,
} from './types';

export function rankCandidates(
  candidates: readonly PriorityCandidate[],
  ctx: PriorityContext,
): RankedCandidate[] {
  const ranked = candidates.map((candidate) => ({
    candidate,
    priority: scoreCandidate(candidate, ctx),
  }));
  return ranked.sort(compareRanked);
}

export function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (a.priority.muted !== b.priority.muted) return a.priority.muted ? 1 : -1;
  const tierDiff = tierRank(b.priority.tier) - tierRank(a.priority.tier);
  if (tierDiff !== 0) return tierDiff;
  if (a.priority.score !== b.priority.score) return b.priority.score - a.priority.score;
  const da = a.candidate.deadlineAt ? Date.parse(a.candidate.deadlineAt) : Number.POSITIVE_INFINITY;
  const db = b.candidate.deadlineAt ? Date.parse(b.candidate.deadlineAt) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  if (a.candidate.ageHours !== b.candidate.ageHours)
    return a.candidate.ageHours - b.candidate.ageHours;
  return a.candidate.id.localeCompare(b.candidate.id);
}

function personKey(c: PriorityCandidate): string | null {
  return c.contactId?.toLowerCase() ?? c.senderEmail?.toLowerCase() ?? null;
}

/**
 * Top priorities with diversity: at most `maxPerThread` per thread and `maxPerPerson` per person.
 * A second pass relaxes the person cap (never the thread cap) so a busy day still fills the list.
 */
export function selectTopPriorities(
  ranked: readonly RankedCandidate[],
  opts: SelectTopOptions = {},
): RankedCandidate[] {
  const max = opts.max ?? 5;
  const maxPerThread = opts.maxPerThread ?? 1;
  const maxPerPerson = opts.maxPerPerson ?? 2;
  const sorted = [...ranked].sort(compareRanked).filter((r) => !r.priority.muted);
  const selected: RankedCandidate[] = [];
  const chosen = new Set<string>();
  const threadCount = new Map<string, number>();
  const personCount = new Map<string, number>();

  const take = (r: RankedCandidate, respectPerson: boolean): void => {
    if (selected.length >= max || chosen.has(r.candidate.id)) return;
    const thread = r.candidate.threadId?.toLowerCase() ?? null;
    const person = personKey(r.candidate);
    if (thread && (threadCount.get(thread) ?? 0) >= maxPerThread) return;
    if (respectPerson && person && (personCount.get(person) ?? 0) >= maxPerPerson) return;
    selected.push(r);
    chosen.add(r.candidate.id);
    if (thread) threadCount.set(thread, (threadCount.get(thread) ?? 0) + 1);
    if (person) personCount.set(person, (personCount.get(person) ?? 0) + 1);
  };

  for (const r of sorted) take(r, true);
  if (selected.length < max) for (const r of sorted) take(r, false);
  return selected.sort(compareRanked);
}
