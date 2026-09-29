/**
 * priority — deterministic priority engine (explicit rules > security > deadline > VIP > waiting >
 * commitment > meeting > learned > AI > promotions), ranking, diverse top-N and feedback learning.
 */
export type {
  PriorityCandidate,
  PriorityCandidateKind,
  PriorityContext,
  PriorityFactor,
  PriorityLevel,
  PriorityResult,
  RankedCandidate,
  SelectTopOptions,
  FeedbackContext,
  FeedbackEntity,
  FeedbackPlan,
  LearnedPreferenceUpsert,
  VipUpsert,
  RuleSuggestion,
  FollowUpUpdate,
} from './types.ts';
export { scoreCandidate, matchPriorityRules, learnedWeight, tierRank } from './score.ts';
export { rankCandidates, compareRanked, selectTopPriorities } from './rank.ts';
export { applyFeedback } from './feedback.ts';
export { rulePhrase as priorityRulePhrase } from './i18n.ts';
