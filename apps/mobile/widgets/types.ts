/**
 * Props handed to the widget layouts. Everything is plain JSON: widgets run in a separate process with
 * no access to i18n, stores or the network, so every label is resolved app-side (src/services/widgets.ts).
 * No email bodies — titles, times and counts only.
 */
export type WidgetTone = 'critical' | 'warning' | 'neutral' | 'accent' | 'success';

export interface WidgetLink {
  title: string;
  deepLink: string;
}

export interface NextImportantItem extends WidgetLink {
  /** Badge caption (ACİL, SON TARİH…) or null when neutral. */
  badgeLabel: string | null;
  tone: WidgetTone;
  /** "Gmail · 08:42" */
  meta: string;
}

export interface NextImportantRectangular extends WidgetLink {
  /** "SONRAKİ · 14:30" */
  kicker: string;
  sub: string | null;
}

/** systemSmall + accessory families. */
export interface NextImportantProps {
  signedIn: boolean;
  kicker: string;
  item: NextImportantItem | null;
  count: number;
  /** Inline lock-screen text: "5 önemli konu · ilki 17:00" */
  inlineLabel: string;
  circularLabel: string;
  rectangular: NextImportantRectangular | null;
  emptyTitle: string;
  signedOutTitle: string;
  todayUrl: string;
}

export interface TodayPriorityRow extends WidgetLink {
  id: string;
  time: string | null;
  tone: WidgetTone;
}

/** systemMedium. */
export interface TodayPrioritiesProps {
  signedIn: boolean;
  header: string;
  timeLabel: string | null;
  rows: TodayPriorityRow[];
  emptyTitle: string;
  signedOutTitle: string;
  todayUrl: string;
}

export interface DailyBriefEvent extends WidgetLink {
  hour: string;
  minute: string;
  sub: string | null;
}

export interface DailyBriefFollowUp extends WidgetLink {
  sub: string | null;
}

/** systemLarge. */
export interface DailyBriefProps {
  signedIn: boolean;
  briefKicker: string;
  headlineBefore: string;
  highlight: string | null;
  headlineAfter: string;
  listenLabel: string | null;
  briefingUrl: string;
  nextEventKicker: string;
  nextEvent: DailyBriefEvent | null;
  noEventLabel: string;
  followUpKicker: string;
  followUp: DailyBriefFollowUp | null;
  emptyTitle: string;
  signedOutTitle: string;
  todayUrl: string;
}
