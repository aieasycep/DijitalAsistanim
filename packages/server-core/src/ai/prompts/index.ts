/**
 * Prompt builders. Every builder returns a `PromptSpec` whose system prompt carries the shared
 * anti-hallucination block (see `containsAntiHallucinationBlock`) and whose evidence is redacted
 * and capped per purpose (see `PROMPT_CHAR_LIMITS`).
 */
export {
  DEFAULT_PROMPT_TIMEZONE,
  UNCERTAIN_PHRASE_EN,
  UNCERTAIN_PHRASE_TR,
  antiHallucinationBlock,
  bullets,
  capList,
  clipInline,
  composeSystem,
  containsAntiHallucinationBlock,
  formatPromptDate,
  formatPromptDateTime,
  formatPromptTime,
  joinLines,
  labelled,
  personLabel,
  temporalContext,
  type ComposeSystemInput,
  type PromptBase,
  type PromptParticipant,
} from './shared';
export {
  EMAIL_BATCH_MAX,
  emailBatchClassify,
  emailDeepAnalysis,
  type EmailBatchClassifyInput,
  type EmailDeepAnalysisInput,
  type PromptEmailMessage,
  type UserSignals,
} from './email';
export { BRIEFING_CANDIDATE_MAX, briefing, type BriefingCandidate, type BriefingPromptInput } from './briefing';
export { meetingPrep, type MeetingPrepInput } from './meeting';
export { assistantAnswer, type AssistantAnswerInput, type AssistantChunk, type AssistantChunkKind } from './assistant';
export { commitmentExtraction, type CommitmentExtractionInput, type CommitmentSourceKind } from './commitment';
export { captureAnalysis, type CaptureAnalysisInput } from './capture';
export {
  REPLY_THREAD_MESSAGE_MAX,
  TONE_RULES,
  replyDraft,
  type ReplyDraftInput,
  type ReplyThreadAnalysis,
  type ReplyThreadMessage,
} from './reply';
export { DEFAULT_VOICE_SCREENS, voiceIntent, type VoiceIntentInput } from './voice';
export {
  isInsideFreeBlocks,
  scheduleSuggestion,
  suggestionsInsideFreeBlocks,
  type FreeBlockFilterResult,
  type ScheduleFreeBlock,
  type ScheduleSuggestionInput,
} from './schedule';
export {
  suggestedQuestions,
  type SuggestedQuestionsAi,
  type SuggestedQuestionsContact,
  type SuggestedQuestionsInput,
} from './questions';
