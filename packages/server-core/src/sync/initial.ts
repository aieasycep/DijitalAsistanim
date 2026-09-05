/**
 * First analysis (onboarding): the 72-hour window each provider is queried with, the progress
 * step machine mirrored by `first_analysis_runs`, and a remaining-time estimate for the UI.
 */
import type { FirstAnalysisProgress } from '@da/domain';
import { gmailQueryForWindow, type GmailCategory } from '../providers/gmail';
import { HOUR, clamp } from '../util';

export const DEFAULT_INITIAL_WINDOW_HOURS = 72;
export const MIN_INITIAL_WINDOW_HOURS = 24;
export const MAX_INITIAL_WINDOW_HOURS = 24 * 14;

export interface InitialAnalysisWindow {
  since: string;
  until: string;
  windowHours: number;
  /** Gmail `q` for the window (spam/trash/chats and promotions/social excluded). */
  gmailQuery: string;
  /** Graph `$filter` for the message delta. */
  graphFilter: string;
}

export function initialAnalysisWindow(input: {
  now: string | Date;
  windowHours?: number;
  excludeCategories?: readonly GmailCategory[];
}): InitialAnalysisWindow {
  const nowMs = input.now instanceof Date ? input.now.getTime() : Date.parse(input.now);
  const windowHours = clamp(
    Math.round(input.windowHours ?? DEFAULT_INITIAL_WINDOW_HOURS),
    MIN_INITIAL_WINDOW_HOURS,
    MAX_INITIAL_WINDOW_HOURS,
  );
  const until = new Date(nowMs).toISOString();
  const since = new Date(nowMs - windowHours * HOUR).toISOString();
  return {
    since,
    until,
    windowHours,
    gmailQuery: gmailQueryForWindow(since, null, input.excludeCategories),
    graphFilter: `receivedDateTime ge ${since}`,
  };
}

export const FIRST_ANALYSIS_STEPS: readonly FirstAnalysisProgress['step'][] = [
  'scanning',
  'classifying',
  'calendar',
  'open_loops',
  'done',
];

export interface FirstAnalysisCounts {
  emailsFound: number;
  potentialImportant: number;
  upcomingEvents: number;
  possibleFollowUps: number;
}

export interface FirstAnalysisStages {
  /** Mail listed and stored. */
  mailFetched: boolean;
  /** Triage + AI classification finished. */
  mailClassified: boolean;
  /** Calendar window synced (or no calendar connected). */
  calendarSynced: boolean;
  /** Follow-up / commitment scan finished. */
  openLoopsScanned: boolean;
}

export interface ProgressFromInput {
  counts: Partial<FirstAnalysisCounts>;
  stages: Partial<FirstAnalysisStages>;
  startedAt: string;
  now: string;
  windowHours?: number;
  error?: string | null;
}

/** Step machine: scanning → classifying → calendar → open_loops → done (or failed). */
export function stepFromStages(
  stages: Partial<FirstAnalysisStages>,
  error?: string | null,
): FirstAnalysisProgress['step'] {
  if (error) return 'failed';
  if (!stages.mailFetched) return 'scanning';
  if (!stages.mailClassified) return 'classifying';
  if (!stages.calendarSynced) return 'calendar';
  if (!stages.openLoopsScanned) return 'open_loops';
  return 'done';
}

export function nextStep(
  step: FirstAnalysisProgress['step'],
): FirstAnalysisProgress['step'] | null {
  const index = FIRST_ANALYSIS_STEPS.indexOf(step);
  if (index < 0) return null;
  return FIRST_ANALYSIS_STEPS[index + 1] ?? null;
}

function count(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

/** Build the persisted progress row from counts and stage flags. */
export function progressFrom(input: ProgressFromInput): FirstAnalysisProgress {
  const step = stepFromStages(input.stages, input.error);
  return {
    step,
    emailsFound: count(input.counts.emailsFound),
    potentialImportant: count(input.counts.potentialImportant),
    upcomingEvents: count(input.counts.upcomingEvents),
    possibleFollowUps: count(input.counts.possibleFollowUps),
    startedAt: input.startedAt,
    completedAt: step === 'done' || step === 'failed' ? input.now : null,
    windowHours: clamp(
      Math.round(input.windowHours ?? DEFAULT_INITIAL_WINDOW_HOURS),
      MIN_INITIAL_WINDOW_HOURS,
      MAX_INITIAL_WINDOW_HOURS,
    ),
    error: input.error ?? null,
  };
}

/** Rough cost of each remaining step in seconds; classification scales with mail volume. */
function stepSeconds(step: FirstAnalysisProgress['step'], emailsFound: number): number {
  switch (step) {
    case 'scanning':
      return 15;
    case 'classifying':
      return clamp(Math.ceil(emailsFound * 0.2), 5, 90);
    case 'calendar':
      return 5;
    case 'open_loops':
      return 5;
    default:
      return 0;
  }
}

/**
 * Seconds until the first analysis finishes: the sum of the remaining steps, with the elapsed
 * time of the current step already subtracted (never below 0; 0 once done/failed).
 */
export function estimateRemainingSeconds(
  progress: Pick<FirstAnalysisProgress, 'step' | 'emailsFound' | 'startedAt'>,
  now: string,
): number {
  if (progress.step === 'done' || progress.step === 'failed') return 0;
  const index = FIRST_ANALYSIS_STEPS.indexOf(progress.step);
  const remaining = FIRST_ANALYSIS_STEPS.slice(Math.max(0, index));
  const total = remaining.reduce((sum, step) => sum + stepSeconds(step, progress.emailsFound), 0);
  const completed = FIRST_ANALYSIS_STEPS.slice(0, Math.max(0, index)).reduce(
    (sum, step) => sum + stepSeconds(step, progress.emailsFound),
    0,
  );
  const elapsed = Math.max(0, (Date.parse(now) - Date.parse(progress.startedAt)) / 1000);
  const elapsedInStep = Math.max(0, elapsed - completed);
  return Math.max(0, Math.ceil(total - elapsedInStep));
}
