/**
 * PriorityCard wired to the app: labels formatted for the user's locale/timezone, body tap routes to
 * the entity, actions go through useInsightActions (approvals for anything that writes).
 */
import { memo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Insight, InsightAction } from '@da/domain';
import { PriorityCard } from '@da/ui';
import { useInsightActions } from '../insights/useInsightActions';
import { useOpenSource } from '../source/openSource';
import { badgeLabelFor, sourceIconFor, sourceTimeLabelFor, timeLabelFor } from './insightLabels';
import { routeForInsight } from './routeForInsight';
import { useFormatCtx } from './useFormatCtx';

export interface InsightCardProps {
  insight: Insight;
  onMore?: (insight: Insight) => void;
  /** Disable swipe gestures (e.g. inside another scroll container). */
  swipeEnabled?: boolean;
  testID?: string;
}

export const InsightCard = memo(function InsightCard({
  insight,
  onMore,
  swipeEnabled = true,
  testID,
}: InsightCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const ctx = useFormatCtx();
  const { runAction, complete, snoozeUntilTomorrow } = useInsightActions();
  const { openSource } = useOpenSource();

  const onPress = useCallback((i: Insight) => router.push(routeForInsight(i)), [router]);
  const onAction = useCallback(
    (action: InsightAction, i: Insight) => void runAction(i, action),
    [runAction],
  );

  return (
    <PriorityCard
      insight={insight}
      badgeLabel={badgeLabelFor(insight, t)}
      timeLabel={timeLabelFor(insight, ctx)}
      sourceTimeLabel={sourceTimeLabelFor(insight, ctx)}
      sourceIcon={sourceIconFor(insight)}
      onPress={onPress}
      onComplete={complete}
      onSnooze={snoozeUntilTomorrow}
      onMore={onMore}
      onAction={onAction}
      onSource={(source) => void openSource(source)}
      swipeEnabled={swipeEnabled}
      completeLabel={t('common.done')}
      snoozeLabel={t('common.postpone')}
      completeAccessibilityLabel={t('a11y.complete')}
      moreAccessibilityLabel={t('a11y.more')}
      lowConfidenceLabel={t('assistant.uncertain')}
      testID={testID}
    />
  );
});
