import type { LearnedPreference, LearnedPreferenceKind } from '@da/domain';
import type { DemoContext } from '../context';
import type { DemoState } from '../state';

export interface ReinforceInput {
  kind: LearnedPreferenceKind;
  subjectKey: string;
  statement: string;
  weight: number;
}

/**
 * Adds or reinforces a learned preference. Honors the "Etkileşimlerimden öğren" switch and tombstones of
 * deleted preferences (a deleted statement is never assumed again).
 */
export function reinforcePreference(
  ctx: DemoContext,
  state: DemoState,
  input: ReinforceInput,
): LearnedPreference | null {
  if (!state.preferences.learnFromInteractions) return null;
  if (state.learnedTombstones.includes(input.subjectKey)) return null;
  const now = ctx.nowIso();
  const existing = state.learned.find(
    (l) => l.subjectKey === input.subjectKey && l.kind === input.kind,
  );
  if (existing) {
    existing.evidenceCount += 1;
    existing.weight = Math.max(-1, Math.min(1, existing.weight + input.weight * 0.25));
    existing.statement = input.statement;
    existing.lastReinforcedAt = now;
    existing.updatedAt = now;
    return existing;
  }
  const created: LearnedPreference = {
    id: ctx.nextId(),
    userId: ctx.userId,
    kind: input.kind,
    statement: input.statement,
    subjectKey: input.subjectKey,
    weight: Math.max(-1, Math.min(1, input.weight)),
    evidenceCount: 1,
    enabled: true,
    lastReinforcedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  state.learned.push(created);
  return created;
}
