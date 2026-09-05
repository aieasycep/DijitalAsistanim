/** Explicit user rules (PriorityRule) and VIP matching for triage. */
import type { PriorityRule, VipPerson } from '@da/domain';
import { domainMatches, domainPart } from './senders';

export interface RuleMatch {
  rule: PriorityRule;
  effect: 'important' | 'low' | 'mute';
}

function includesKeyword(haystackLower: string, keyword: string): boolean {
  const k = keyword.trim().toLocaleLowerCase('tr-TR');
  return k.length > 0 && haystackLower.includes(k);
}

export function matchRules(
  rules: readonly PriorityRule[] | undefined,
  input: { senderEmail: string; textLower: string; isPromotion: boolean },
): RuleMatch[] {
  if (!rules || rules.length === 0) return [];
  const email = input.senderEmail.trim().toLowerCase();
  const domain = domainPart(email);
  const out: RuleMatch[] = [];
  for (const rule of [...rules].sort((a, b) => a.position - b.position)) {
    if (!rule.enabled) continue;
    const value = rule.value.trim().toLowerCase();
    switch (rule.type) {
      case 'sender_important':
      case 'vip_notify':
        if (value.includes('@') && value === email) out.push({ rule, effect: 'important' });
        break;
      case 'domain_important':
        if (domain && domainMatches(domain, value)) out.push({ rule, effect: 'important' });
        break;
      case 'keyword_high':
        if (includesKeyword(input.textLower, rule.value)) out.push({ rule, effect: 'important' });
        break;
      case 'keyword_low':
        if (includesKeyword(input.textLower, rule.value)) out.push({ rule, effect: 'low' });
        break;
      case 'promotions_low':
        if (input.isPromotion) out.push({ rule, effect: 'low' });
        break;
      case 'mute_sender':
        if (value === email) out.push({ rule, effect: 'mute' });
        break;
      case 'mute_domain':
        if (domain && domainMatches(domain, value)) out.push({ rule, effect: 'mute' });
        break;
    }
  }
  return out;
}

export function matchVip(vips: readonly VipPerson[] | undefined, senderEmail: string, senderName?: string | null): VipPerson | null {
  if (!vips || vips.length === 0) return null;
  const email = senderEmail.trim().toLowerCase();
  const byEmail = vips.find((v) => v.email && v.email.trim().toLowerCase() === email);
  if (byEmail) return byEmail;
  const name = (senderName ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!name) return null;
  return vips.find((v) => !v.email && v.displayName.trim().toLocaleLowerCase('tr-TR') === name) ?? null;
}
