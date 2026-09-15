/**
 * sync — pure scheduling and merging logic behind `cron-dispatch sync-poll`, the provider
 * webhooks and the onboarding first analysis: poll intervals with backoff and per-user
 * fairness, subscription renewal, backfill windows, thread grouping, calendar delta
 * application and change detection.
 */
export type {
  BackfillWindow,
  BackfillWindowInput,
  PollContext,
  SelectDueStatesInput,
  SubscriptionState,
  SyncDueContext,
  SyncDueState,
  SyncMode,
  SyncResource,
} from './schedule';
export {
  MAX_BACKOFF_MINUTES,
  POLL_INTERVALS,
  backoffMinutes,
  isSyncDue,
  needsSubscription,
  nextBackfillWindow,
  nextSyncAt,
  pollIntervalMinutes,
  selectDueStates,
  subscriptionRenewalDue,
  waitMinutes,
} from './schedule';
export type {
  CalendarDeltaApplication,
  ChangedEvents,
  EmailThreadPatch,
  EventLike,
  MergeThreadOptions,
} from './merge';
export {
  applyCalendarDelta,
  dedupeMessages,
  detectChangedEvents,
  groupIntoThreads,
  mergeParticipants,
  mergeThreadUpdate,
  normalizeSubject,
  threadKeyFor,
} from './merge';
export type {
  FirstAnalysisCounts,
  FirstAnalysisStages,
  InitialAnalysisWindow,
  ProgressFromInput,
} from './initial';
export {
  DEFAULT_INITIAL_WINDOW_HOURS,
  FIRST_ANALYSIS_STEPS,
  MAX_INITIAL_WINDOW_HOURS,
  MIN_INITIAL_WINDOW_HOURS,
  estimateRemainingSeconds,
  initialAnalysisWindow,
  nextStep,
  progressFrom,
  stepFromStages,
} from './initial';
