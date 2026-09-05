import type {
  AiFeedback,
  EmailCategory,
  Importance,
  LearnedPreference,
  LearnedPreferenceKind,
  Locale,
  PriorityRule,
  PriorityRuleType,
  VipPerson,
} from '@da/domain';

export type PriorityCandidateKind = 'email' | 'event' | 'task' | 'commitment' | 'follow_up' | 'life_event' | 'notification';

export interface PriorityCandidate {
  id: string;
  kind: PriorityCandidateKind;
  category: EmailCategory;
  /** Importance suggested by AI / heuristics (level 9 in the ordering). */
  importance: Importance;
  deadlineAt?: string | null;
  /** False when the deadline is a whole day (default clock time). */
  deadlineHasTime?: boolean;
  senderEmail?: string | null;
  senderDomain?: string | null;
  senderName?: string | null;
  contactId?: string | null;
  threadId?: string | null;
  requiresUserAction: boolean;
  isUserCommitment: boolean;
  relatedMeetingAt?: string | null;
  isPromotion: boolean;
  isNewsletter: boolean;
  /** 0-1 confidence of the analysis that produced importance/category. */
  confidence: number;
  ageHours: number;
  /** Subject + snippet only (never message bodies) — used for keyword rules. */
  text?: string | null;
}

export interface PriorityContext {
  rules: PriorityRule[];
  vips: VipPerson[];
  learned: LearnedPreference[];
  now: string;
  timezone: string;
  locale?: Locale;
}

/** Ordering levels: 1 explicit rule … 10 promotion penalty (11 = recency tie-break). */
export type PriorityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface PriorityFactor {
  level: PriorityLevel;
  key: string;
  points: number;
  reason?: string;
}

export interface PriorityResult {
  id: string;
  /** 0-1000, monotonic with tier. */
  score: number;
  tier: Importance;
  reasons: string[];
  muted: boolean;
  factors: PriorityFactor[];
  matchedRuleIds: string[];
}

export interface RankedCandidate {
  candidate: PriorityCandidate;
  priority: PriorityResult;
}

export interface SelectTopOptions {
  max?: number;
  /** Max items per thread (default 1). */
  maxPerThread?: number;
  /** Max items per person (contactId or senderEmail, default 2). */
  maxPerPerson?: number;
}

// --- Feedback ------------------------------------------------------------------------------

export interface FeedbackEntity {
  entityType: AiFeedback['entityType'];
  entityId: string;
  contactId?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  senderDomain?: string | null;
  category?: EmailCategory | null;
  threadId?: string | null;
  followUpId?: string | null;
}

export interface FeedbackContext {
  learnFromInteractions: boolean;
  entity: FeedbackEntity;
  now: string;
  locale?: Locale;
}

export interface LearnedPreferenceUpsert {
  kind: LearnedPreferenceKind;
  subjectKey: string;
  /** Added to the existing weight (clamped to -1..1 by the store). */
  weightDelta: number;
  statement: string;
}

export interface VipUpsert {
  displayName: string;
  email: string | null;
  contactId: string | null;
  notifyAlways: boolean;
}

export interface RuleSuggestion {
  type: PriorityRuleType;
  value: string;
  label: string;
  reason: string;
}

export interface FollowUpUpdate {
  followUpId: string;
  status: 'closed';
}

export interface FeedbackPlan {
  learnedUpserts: LearnedPreferenceUpsert[];
  vipUpserts: VipUpsert[];
  ruleSuggestions: RuleSuggestion[];
  followUpUpdates: FollowUpUpdate[];
  /** Toast copy: "Öğrendim · …" */
  ack: string;
}
