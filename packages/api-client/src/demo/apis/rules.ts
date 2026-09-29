import type { PriorityRule } from '@da/domain';
import { priorityRuleUpsertSchema } from '@da/validation';
import type { RulesApi } from '../../datasource';
import type { DemoContext } from '../context';
import { notFound, validate } from '../validate';

export function createRulesApi(ctx: DemoContext): RulesApi {
  return {
    listRules: () =>
      ctx.run(() =>
        [...ctx.store.state.rules].sort((a, b) => a.position - b.position).map((r) => ({ ...r })),
      ),
    upsertRule: (rule) =>
      ctx.run(() => {
        const clean = validate(priorityRuleUpsertSchema, rule);
        return ctx.store.mutate((s): PriorityRule => {
          const now = ctx.nowIso();
          const existing = clean.id ? s.rules.find((r) => r.id === clean.id) : undefined;
          if (clean.id && !existing) throw notFound('Kural', clean.id);
          if (existing) {
            existing.type = clean.type;
            existing.value = clean.value;
            existing.label = clean.label;
            existing.enabled = clean.enabled;
            existing.position = clean.position;
            existing.updatedAt = now;
            return { ...existing };
          }
          const created: PriorityRule = {
            id: ctx.nextId(),
            userId: ctx.userId,
            type: clean.type,
            value: clean.value,
            label: clean.label,
            enabled: clean.enabled,
            position: rule.position ?? s.rules.reduce((max, r) => Math.max(max, r.position + 1), 0),
            createdAt: now,
            updatedAt: now,
          };
          s.rules.push(created);
          return { ...created };
        });
      }),
    deleteRule: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          if (!s.rules.some((r) => r.id === id)) throw notFound('Kural', id);
          s.rules = s.rules.filter((r) => r.id !== id);
        });
      }),
    reorderRules: (ids) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          ids.forEach((id, index) => {
            const rule = s.rules.find((r) => r.id === id);
            if (rule) {
              rule.position = index;
              rule.updatedAt = now;
            }
          });
          let next = ids.length;
          for (const rule of [...s.rules].sort((a, b) => a.position - b.position)) {
            if (!ids.includes(rule.id)) {
              rule.position = next;
              next += 1;
            }
          }
        });
      }),
    listLearnedPreferences: () => ctx.run(() => ctx.store.state.learned.map((l) => ({ ...l }))),
    setLearnedPreferenceEnabled: (id, enabled) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const pref = s.learned.find((l) => l.id === id);
          if (!pref) throw notFound('Öğrenilmiş tercih', id);
          pref.enabled = enabled;
          pref.updatedAt = ctx.nowIso();
          return { ...pref };
        }),
      ),
    deleteLearnedPreference: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const pref = s.learned.find((l) => l.id === id);
          if (!pref) throw notFound('Öğrenilmiş tercih', id);
          s.learned = s.learned.filter((l) => l.id !== id);
          if (!s.learnedTombstones.includes(pref.subjectKey))
            s.learnedTombstones.push(pref.subjectKey);
        });
      }),
  };
}
