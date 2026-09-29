/**
 * Static metadata of the 8 explicit priority rule types (`PriorityRuleType`): which value the rule needs
 * (e-mail, domain, keyword or none), which outcome group it belongs to and the icon shown in the list.
 * Explicit rules always beat learned preferences — the priority engine consults them first.
 */
import type { IconName } from '@da/design-tokens';
import { PRIORITY_RULE_TYPES, type PriorityRule, type PriorityRuleType } from '@da/domain';

export type RuleValueKind = 'email' | 'domain' | 'keyword' | 'none';
export type RuleOutcome = 'important' | 'notify' | 'low' | 'mute';

export interface RuleTypeSpec {
  type: PriorityRuleType;
  icon: IconName;
  valueKind: RuleValueKind;
  outcome: RuleOutcome;
}

/** Value stored for rule types that match everything of their kind (VIP notify, promotions). */
export const WILDCARD_VALUE = '*';

export const RULE_TYPES: readonly PriorityRuleType[] = PRIORITY_RULE_TYPES;

export const RULE_TYPE_SPECS: Record<PriorityRuleType, RuleTypeSpec> = {
  sender_important: {
    type: 'sender_important',
    icon: 'person',
    valueKind: 'email',
    outcome: 'important',
  },
  domain_important: {
    type: 'domain_important',
    icon: 'domain',
    valueKind: 'domain',
    outcome: 'important',
  },
  vip_notify: { type: 'vip_notify', icon: 'vip', valueKind: 'none', outcome: 'notify' },
  keyword_high: {
    type: 'keyword_high',
    icon: 'trendingUp',
    valueKind: 'keyword',
    outcome: 'important',
  },
  promotions_low: { type: 'promotions_low', icon: 'filter', valueKind: 'none', outcome: 'low' },
  mute_sender: { type: 'mute_sender', icon: 'block', valueKind: 'email', outcome: 'mute' },
  mute_domain: { type: 'mute_domain', icon: 'block', valueKind: 'domain', outcome: 'mute' },
  keyword_low: { type: 'keyword_low', icon: 'text', valueKind: 'keyword', outcome: 'low' },
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function ruleSpec(type: PriorityRuleType): RuleTypeSpec {
  return RULE_TYPE_SPECS[type];
}

/** Trims and canonicalises the typed value for the rule's value kind (`@sirket.com` → `sirket.com`). */
export function normalizeRuleValue(kind: RuleValueKind, raw: string): string {
  const trimmed = raw.trim();
  switch (kind) {
    case 'none':
      return WILDCARD_VALUE;
    case 'email':
      return trimmed.toLowerCase();
    case 'domain':
      return trimmed.replace(/^@+/, '').toLowerCase();
    default:
      return trimmed.replace(/\s+/g, ' ');
  }
}

export function isValidRuleValue(kind: RuleValueKind, value: string): boolean {
  switch (kind) {
    case 'none':
      return true;
    case 'email':
      return EMAIL_RE.test(value);
    case 'domain':
      return DOMAIN_RE.test(value);
    default:
      return value.length >= 2 && value.length <= 200;
  }
}

/** The value shown to the user; wildcard rules have none. */
export function ruleValueForDisplay(rule: Pick<PriorityRule, 'type' | 'value'>): string | null {
  if (ruleSpec(rule.type).valueKind === 'none' || rule.value === WILDCARD_VALUE) return null;
  return rule.value;
}

/** Default label when the user leaves the name empty: "musteri.com · Her zaman önemli" / the type sentence. */
export function defaultRuleLabel(
  type: PriorityRuleType,
  value: string,
  labels: { typeLabel: string; outcomeLabel: string },
): string {
  const shown = ruleValueForDisplay({ type, value });
  return shown ? `${shown} · ${labels.outcomeLabel}` : labels.typeLabel;
}
