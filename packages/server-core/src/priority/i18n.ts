import type { Locale, PriorityRuleType } from '@da/domain';

type Key =
  | 'security'
  | 'deadlineReply'
  | 'deadlineCommitment'
  | 'deadline'
  | 'deadlineOverdue'
  | 'vip'
  | 'waiting'
  | 'waitingDays'
  | 'commitment'
  | 'meeting'
  | 'learned'
  | 'aiCritical'
  | 'aiHigh'
  | 'promotion'
  | 'newsletter'
  | 'muted';

const STRINGS: Record<Locale, Record<Key, string>> = {
  tr: {
    security: 'Güvenlik uyarısı',
    deadlineReply: '{phrase} cevap istendi',
    deadlineCommitment: 'Verdiğin söz: {phrase}',
    deadline: 'Son tarih: {phrase}',
    deadlineOverdue: 'Son tarihi geçti: {day}',
    vip: 'VIP: {name}',
    waiting: 'Senden yanıt bekleniyor',
    waitingDays: '{days} gündür senden yanıt bekleniyor',
    commitment: 'Kendi verdiğin bir söz',
    meeting: 'Toplantıyla ilgili: {label}',
    learned: 'Öğrendiğim: {statement}',
    aiCritical: 'Kritik görünüyor',
    aiHigh: 'Önemli görünüyor',
    promotion: 'Kampanya içeriği',
    newsletter: 'Bülten',
    muted: 'Kuralın: {rule}',
  },
  en: {
    security: 'Security alert',
    deadlineReply: 'Reply requested {phrase}',
    deadlineCommitment: 'Your promise: {phrase}',
    deadline: 'Deadline: {phrase}',
    deadlineOverdue: 'Deadline passed: {day}',
    vip: 'VIP: {name}',
    waiting: 'Waiting for your reply',
    waitingDays: 'Waiting for your reply for {days} days',
    commitment: 'A promise you made',
    meeting: 'Related to a meeting: {label}',
    learned: 'Learned: {statement}',
    aiCritical: 'Looks critical',
    aiHigh: 'Looks important',
    promotion: 'Promotional content',
    newsletter: 'Newsletter',
    muted: 'Your rule: {rule}',
  },
};

const RULE_PHRASES: Record<Locale, Record<PriorityRuleType, string>> = {
  tr: {
    sender_important: 'bu göndericiden gelenler her zaman önemli',
    domain_important: 'bu alan adından gelenler önemli',
    vip_notify: 'bu kişi her zaman bildirilsin',
    keyword_high: "'{value}' geçenler önemli",
    promotions_low: 'kampanyalar düşük öncelikli',
    mute_sender: 'bu gönderici sessize alınmış',
    mute_domain: 'bu alan adı sessize alınmış',
    keyword_low: "'{value}' geçenler düşük öncelikli",
  },
  en: {
    sender_important: 'mail from this sender is always important',
    domain_important: 'mail from this domain is important',
    vip_notify: 'always notify for this person',
    keyword_high: "messages mentioning '{value}' are important",
    promotions_low: 'promotions are low priority',
    mute_sender: 'this sender is muted',
    mute_domain: 'this domain is muted',
    keyword_low: "messages mentioning '{value}' are low priority",
  },
};

export function t(locale: Locale, key: Key, params: Record<string, string> = {}): string {
  let s = STRINGS[locale][key];
  for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, v);
  return capitalizeFirst(s);
}

export function rulePhrase(locale: Locale, type: PriorityRuleType, value: string): string {
  const phrase = RULE_PHRASES[locale][type].replace('{value}', value);
  return locale === 'tr' ? `Kuralın: ${phrase}` : `Your rule: ${phrase}`;
}

export function capitalizeFirst(s: string): string {
  if (!s) return s;
  const first = s[0] ?? '';
  return first.toLocaleUpperCase('tr-TR') + s.slice(1);
}
