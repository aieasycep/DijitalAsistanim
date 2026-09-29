import type {
  EmailCategory,
  EmailParticipant,
  Importance,
  Locale,
  PriorityRule,
  TriageBucket,
  VipPerson,
} from '@da/domain';

/** Provider-normalized email as seen by the ingestion pipeline (no HTML, bodies optional). */
export interface TriageEmailInput {
  from: EmailParticipant;
  to?: EmailParticipant[];
  subject: string;
  snippet: string;
  bodyText?: string | null;
  /** Provider labels/categories: SPAM, CATEGORY_PROMOTIONS, IMPORTANT, INBOX … (case-insensitive). */
  labels: string[];
  listUnsubscribe?: string | null;
  precedence?: string | null;
  autoSubmitted?: string | null;
  isFromUser: boolean;
  hasAttachments: boolean;
  /** Reference instant for date resolution; defaults to context.now. */
  sentAt?: string | null;
}

export interface TriageContext {
  rules?: PriorityRule[];
  vips?: VipPerson[];
  now?: string;
  timezone?: string;
  locale?: Locale;
  /** Additional automated sender addresses or domains (lowercase). */
  automatedSenders?: string[];
}

export interface TriageSignals {
  spam: boolean;
  trash: boolean;
  promotion: boolean;
  social: boolean;
  updates: boolean;
  forum: boolean;
  otherInbox: boolean;
  providerImportant: boolean;
  newsletter: boolean;
  noReply: boolean;
  bulkSender: boolean;
  automatedSender: boolean;
  autoReply: boolean;
  promoSubject: boolean;
  vip: boolean;
  ruleImportant: boolean;
  ruleLow: boolean;
  ruleMuted: boolean;
  deadline: boolean;
  meeting: boolean;
  security: boolean;
  securityStrong: boolean;
  otp: boolean;
  finance: boolean;
  travel: boolean;
  shipment: boolean;
  subscription: boolean;
  asksUser: boolean;
  fromUser: boolean;
  hasAttachments: boolean;
}

export interface TriageDeadline {
  iso: string;
  text: string;
  evidence: string;
}

export interface TriageResult {
  bucket: TriageBucket;
  signals: TriageSignals;
  preCategory?: EmailCategory;
  preImportance?: Importance;
  needsAi: boolean;
  /** Short, natural reasons in the requested locale (no message content beyond the deadline phrase). */
  reasons: string[];
  /** Evidence-backed deadline found deterministically, if any. */
  deadline: TriageDeadline | null;
  matchedRuleIds: string[];
  vipName: string | null;
  /** 'security' when the email took the security fast path. */
  fastPath: 'security' | null;
}

export interface NotificationInput {
  packageName: string;
  title: string;
  text: string;
}

export type SensitiveReason = 'excluded_package' | 'otp' | 'credential';

export interface SensitiveNotificationResult {
  sensitive: boolean;
  reason: SensitiveReason | null;
}
