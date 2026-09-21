import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScheduleSuggestion } from '@da/domain';
import { AiInsightCard, Button } from '@da/ui';

export interface PlanSuggestionCardProps {
  suggestion: ScheduleSuggestion;
  loading?: boolean;
  onAccept: (s: ScheduleSuggestion) => void;
  onDismiss: (s: ScheduleSuggestion) => void;
}

/** "TAKVİM ZEKÂSI" hero card — one suggestion at a time, Planla / Başka zaman. */
export function PlanSuggestionCard({
  suggestion,
  loading = false,
  onAccept,
  onDismiss,
}: PlanSuggestionCardProps) {
  const { t } = useTranslation();
  const primaryLabel = suggestion.kind === 'move_event' ? t('common.postpone') : t('common.plan');
  return (
    <AiInsightCard
      label={t('plan.calendarIntelligence')}
      title={suggestion.title}
      body={suggestion.detail}
      testID="plan-suggestion"
    >
      <View style={styles.actions}>
        <Button
          label={primaryLabel}
          icon="calendarAdd"
          size="sm"
          loading={loading}
          loadingLabel={t('common.preparing')}
          onPress={() => onAccept(suggestion)}
          testID="plan-suggestion-primary"
        />
        <Button
          label={t('plan.anotherTime')}
          variant="ghostSecondary"
          size="sm"
          disabled={loading}
          onPress={() => onDismiss(suggestion)}
          testID="plan-suggestion-secondary"
        />
      </View>
    </AiInsightCard>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
