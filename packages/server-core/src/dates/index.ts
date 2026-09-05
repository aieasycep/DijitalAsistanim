/**
 * dates — Turkish/English natural-language date & deadline extraction with evidence,
 * timezone-aware calendar arithmetic and natural date labels.
 */
export type { DateKind, ExtractDatesInput, ExtractedDate } from './types';
export { extractDates, deadlineFromText, hasDeadlineVocabulary } from './extract';
export {
  type LocalDate,
  type LocalDateTime,
  localDateOf,
  localDateTimeOf,
  dateKey,
  parseDateKey,
  addDays,
  addMonths,
  addBusinessDays,
  isoWeekday,
  daysInMonth,
  daysBetween,
  isValidDate,
  sameDate,
  localToUtcIso,
  nextWeekday,
} from './calendar';
export { formatClock, formatDayLabel, formatDateLabel, formatDateLocative, formatDeadlinePhrase, type FormatDateOptions } from './format';
export {
  turkishDative,
  turkishLocative,
  turkishNumberDative,
  turkishNumberLocative,
  timeWithDative,
  lowercasePreservingIndices,
  flexI,
  escapeRegex,
  pad2,
} from './turkish';
export {
  MONTHS_TR,
  MONTHS_TR_TITLE,
  MONTHS_EN_TITLE,
  WEEKDAYS_TR,
  WEEKDAYS_TR_TITLE,
  WEEKDAYS_EN_TITLE,
  monthIndex,
  weekdayIndex,
} from './lexicon';
