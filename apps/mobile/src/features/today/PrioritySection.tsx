import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { formatRelativeLabel, type FormatCtx } from '@da/i18n';
import type { Insight, InsightAction, SourceRef } from '@da/domain';
import { PriorityCard, SectionKicker, useTheme } from '@da/ui';

export const MAX_PRIORITIES = 5;

export interface PrioritySectionProps {
  insights: Insight[];
  /** Section kicker ("ÖNCELİKLERİN"); defaults to today.priorities. */
  title?: string;
  /** Right-side meta; defaults to "{{count}} konu". */
  meta?: string | null;
  ctx: FormatCtx;
  max?: number;
  onPress?: (insight: Insight) => void;
  onComplete?: (insight: Insight) => void;
  onSnooze?: (insight: Insight) => void;
  onMore?: (insight: Insight) => void;
  onAction?: (action: InsightAction, insight: Insight) => void;
  onSource?: (source: SourceRef) => void;
  /** Read-only preview (aha screen): no swipe, no complete / more buttons. */
  readOnly?: boolean;
  testIDPrefix?: string;
  /** Overrides the per-card testID (default `${testIDPrefix}-${insight.id}`). */
  testIDFor?: (insight: Insight, index: number) => string;
}

/** Time label top-right: the engine's label when present, else the due / source time relative to now. */
export function insightTimeLabel(insight: Insight, ctx: FormatCtx): string {
  if (insight.timeLabel) return insight.timeLabel;
  return formatRelativeLabel(insight.dueAt ?? insight.source.timestamp, ctx);
}

const KIND_SOURCE_ICON: Partial<Record<Insight['kind'], IconName>> = {
  follow_up: 'followUp',
  commitment: 'commitment',
  deadline: 'deadline',
  security: 'security',
};

export function sourceIconFor(insight: Insight): IconName | undefined {
  return KIND_SOURCE_ICON[insight.kind];
}

/** "ÖNCELİKLERİN · 5 konu" + up to five card/priority. Swipe right completes, swipe left snoozes. */
export function PrioritySection({
  insights,
  title,
  meta,
  ctx,
  max = MAX_PRIORITIES,
  onPress,
  onComplete,
  onSnooze,
  onMore,
  onAction,
  onSource,
  readOnly = false,
  testIDPrefix = 'priority-card',
  testIDFor,
}: PrioritySectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const visible = insights.slice(0, max);
  if (visible.length === 0) return null;

  return (
    <View style={[styles.wrap, { gap: theme.layout.cardGap }]}>
      <SectionKicker
        label={title ?? t('today.priorities')}
        meta={meta === undefined ? t('today.prioritiesCount', { count: visible.length }) : meta}
      />
      {visible.map((insight, index) => (
        <PriorityCard
          key={insight.id}
          insight={insight}
          badgeLabel={t(`badges.${insight.badge}`)}
          timeLabel={insightTimeLabel(insight, ctx)}
          sourceTimeLabel={formatRelativeLabel(insight.source.timestamp, ctx)}
          sourceIcon={sourceIconFor(insight)}
          onPress={onPress}
          onComplete={readOnly ? undefined : onComplete}
          onSnooze={readOnly ? undefined : onSnooze}
          onMore={readOnly ? undefined : onMore}
          onAction={readOnly ? undefined : onAction}
          onSource={onSource}
          swipeEnabled={!readOnly}
          completeLabel={t('common.done')}
          snoozeLabel={t('common.postpone')}
          completeAccessibilityLabel={t('a11y.complete')}
          moreAccessibilityLabel={t('a11y.more')}
          lowConfidenceLabel={t('assistant.uncertain')}
          testID={testIDFor ? testIDFor(insight, index) : `${testIDPrefix}-${insight.id}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
