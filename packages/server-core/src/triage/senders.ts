/** Sender heuristics: no-reply patterns, known automated senders, security senders. */

export const DEFAULT_AUTOMATED_SENDERS: readonly string[] = [
  'notifications@github.com',
  'noreply@github.com',
  'no-reply@accounts.google.com',
  'calendar-notification@google.com',
  'drive-shares-noreply@google.com',
  'drive-shares-dm-noreply@google.com',
  'noreply@google.com',
  'no-reply@google.com',
  'noreply@youtube.com',
  'no-reply@linkedin.com',
  'messages-noreply@linkedin.com',
  'notifications-noreply@linkedin.com',
  'invitations@linkedin.com',
  'notification@facebookmail.com',
  'notifications@facebookmail.com',
  'security@facebookmail.com',
  'no-reply@mail.instagram.com',
  'security@mail.instagram.com',
  'info@x.com',
  'no-reply@twitter.com',
  'notifications@slack.com',
  'no-reply@slack.com',
  'notify@notion.so',
  'noreply@notion.so',
  'no-reply@trello.com',
  'no-reply@dropbox.com',
  'no-reply@dropboxmail.com',
  'no-reply@zoom.us',
  'noreply@zoom.us',
  'noreply@medium.com',
  'noreply@substack.com',
  'no-reply@sharepointonline.com',
  'noreply@teams.microsoft.com',
  'no-reply@microsoft.com',
  'microsoft-noreply@microsoft.com',
  'account-security-noreply@accountprotection.microsoft.com',
  'no_reply@email.apple.com',
  'noreply@id.apple.com',
  'appleid@id.apple.com',
  'noreply@email.apple.com',
  'no-reply@amazon.com',
  'ship-confirm@amazon.com',
  'order-update@amazon.com',
  'noreply@revenuecat.com',
  'noreply@expo.dev',
  'no-reply@vercel.com',
  'noreply@supabase.io',
  'no-reply@supabase.com',
];

/** Domains whose mail is always machine-generated (ESPs, social networks, dev tools). */
export const DEFAULT_AUTOMATED_DOMAINS: readonly string[] = [
  'facebookmail.com',
  'linkedin.com',
  'slack.com',
  'github.com',
  'notion.so',
  'trello.com',
  'zoom.us',
  'medium.com',
  'substack.com',
  'mailchimp.com',
  'mcsv.net',
  'rsgsv.net',
  'list-manage.com',
  'sendgrid.net',
  'mailgun.org',
  'amazonses.com',
  'sparkpostmail.com',
  'mandrillapp.com',
  'em.trendyol.com',
  'info.hepsiburada.com',
  'bilgi.hepsiburada.com',
  'e.trendyol.com',
];

/** Senders whose mail may be automated but must never be skipped (account security). */
export const SECURITY_SENDERS: readonly string[] = [
  'no-reply@accounts.google.com',
  'account-security-noreply@accountprotection.microsoft.com',
  'no_reply@email.apple.com',
  'noreply@id.apple.com',
  'appleid@id.apple.com',
  'security-noreply@linkedin.com',
  'security@mail.instagram.com',
  'security@facebookmail.com',
  'account-update@amazon.com',
  'noreply@github.com',
];

const NOREPLY_LOCAL = /^(?:no-?reply|noreply|do-?not-?reply|donotreply|no_reply|nore-?ply|bildirim(?:ler)?|notification(?:s)?|mailer-daemon|postmaster|bounce(?:s)?|auto(?:mated|mailer)?|robot|system|daemon|alert(?:s)?|noreply-[a-z0-9]+)(?:[-+._][a-z0-9.+_-]*)?$/i;
const BULK_LOCAL = /^(?:newsletter(?:s)?|news|bulten|bülten|e-?bulten|e-?bülten|kampanya(?:lar)?|promo(?:tions?)?|marketing|updates?|digest|duyuru(?:lar)?|haber(?:ler)?|firsat(?:lar)?|fırsat(?:lar)?)(?:[-+._][a-z0-9.+_-]*)?$/i;

export function localPart(email: string): string {
  const at = email.indexOf('@');
  return (at >= 0 ? email.slice(0, at) : email).trim().toLowerCase();
}

export function domainPart(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

export function isNoReplyAddress(email: string): boolean {
  return NOREPLY_LOCAL.test(localPart(email));
}

export function isBulkAddress(email: string): boolean {
  return BULK_LOCAL.test(localPart(email));
}

export function domainMatches(domain: string, pattern: string): boolean {
  const d = domain.toLowerCase();
  const p = pattern.toLowerCase().replace(/^@/, '');
  return d === p || d.endsWith(`.${p}`);
}

export function isAutomatedSender(email: string, extra: readonly string[] = []): boolean {
  const lower = email.trim().toLowerCase();
  const domain = domainPart(lower);
  const addresses = [...DEFAULT_AUTOMATED_SENDERS, ...extra.filter((x) => x.includes('@'))];
  if (addresses.includes(lower)) return true;
  const domains = [...DEFAULT_AUTOMATED_DOMAINS, ...extra.filter((x) => !x.includes('@'))];
  return domains.some((d) => domainMatches(domain, d));
}

export function isSecuritySender(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (SECURITY_SENDERS.includes(lower)) return true;
  const local = localPart(lower);
  return /^(?:security|account-?security|accounts?|guvenlik|güvenlik|hesap-?guvenligi)(?:[-+._][a-z0-9.+_-]*)?$/i.test(local);
}
