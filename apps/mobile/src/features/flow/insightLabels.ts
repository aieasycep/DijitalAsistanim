import type { TFunction } from 'i18next';
import type { IconName } from '@da/design-tokens';
import type { Insight } from '@da/domain';
import { formatRelativeLabel, type FormatCtx } from '@da/i18n';

/** Localized badge label for a priority card ("ACİL", "TAKİP", …). */
export function badgeLabelFor(insight: Insight, t: TFunction): string {
  return t(`badges.${insight.badge}`);
}

/** Top-right time label: server label when present, else the due date, else the source time. */
export function timeLabelFor(insight: Insight, ctx: FormatCtx): string {
  if (insight.timeLabel) return insight.timeLabel;
  const iso = insight.dueAt ?? insight.source.timestamp;
  return formatRelativeLabel(iso, ctx);
}

/** Source-line time ("2 Eyl") — always the source item's own timestamp. */
export function sourceTimeLabelFor(insight: Insight, ctx: FormatCtx): string {
  return formatRelativeLabel(insight.source.timestamp, ctx);
}

/** Icon override for the source line by insight kind (schedule_send for follow-ups, handshake…). */
export function sourceIconFor(insight: Insight): IconName | undefined {
  switch (insight.kind) {
    case 'follow_up':
      return 'followUp';
    case 'commitment':
      return 'commitment';
    case 'deadline':
      return 'deadline';
    case 'security':
      return 'security';
    default:
      return undefined;
  }
}
