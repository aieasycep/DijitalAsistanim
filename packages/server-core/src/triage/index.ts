/**
 * triage — deterministic Stage-1/Stage-2 email classification before any AI call,
 * plus the Android notification privacy guard.
 */
export type {
  TriageEmailInput,
  TriageContext,
  TriageSignals,
  TriageResult,
  TriageDeadline,
  NotificationInput,
  SensitiveNotificationResult,
  SensitiveReason,
} from './types';
export { triageEmail, detectSignals, shouldSendToAi } from './triage';
export { isSensitiveNotification, DEFAULT_EXCLUDED_PACKAGES } from './notifications';
export {
  DEFAULT_AUTOMATED_SENDERS,
  DEFAULT_AUTOMATED_DOMAINS,
  SECURITY_SENDERS,
  isNoReplyAddress,
  isBulkAddress,
  isAutomatedSender,
  isSecuritySender,
} from './senders';
export { matchRules as matchTriageRules, matchVip as matchTriageVip, type RuleMatch } from './rules';
