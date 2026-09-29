import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Capture, SuggestedAction } from '@da/domain';
import { AiInsightCard, Button, MetaChip, Text, useTheme } from '@da/ui';
import { SUPPORTED_CAPTURE_ACTIONS, useCaptureActions } from './useCaptureActions';

const ACTION_ICON: Partial<
  Record<
    SuggestedAction['kind'],
    'event' | 'taskAdd' | 'reminder' | 'link' | 'payment' | 'shipment' | 'flight'
  >
> = {
  add_to_calendar: 'event',
  create_task: 'taskAdd',
  remind: 'reminder',
  open_link: 'link',
  pay: 'payment',
  track: 'shipment',
  check_in: 'flight',
};

export interface CaptureResultProps {
  capture: Capture;
  onSaveNote: () => void;
  saving?: boolean;
}

/** "BULUNANLAR" card: detected title, summary, date/key-point chips, contextual actions and "Not Olarak Kaydet". */
export function CaptureResult({ capture, onSaveNote, saving = false }: CaptureResultProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { run, busy } = useCaptureActions(capture);
  const analysis = capture.analysis;
  if (!analysis) return null;
  const actions = analysis.suggestedActions.filter((a) =>
    SUPPORTED_CAPTURE_ACTIONS.includes(a.kind),
  );
  const chips = [
    ...analysis.dates.map((d) => ({
      key: `date-${d.text}`,
      label: d.text,
      icon: 'event' as const,
    })),
    ...(analysis.event?.location
      ? [{ key: 'location', label: analysis.event.location, icon: 'location' as const }]
      : []),
    ...(analysis.person?.name
      ? [{ key: 'person', label: analysis.person.name, icon: 'person' as const }]
      : []),
  ];

  return (
    <View style={styles.stack} testID="capture-result">
      <AiInsightCard
        label={t('capture.detected')}
        title={analysis.title}
        body={analysis.summary}
        testID="capture-result-card"
      >
        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <MetaChip key={chip.key} label={chip.label} icon={chip.icon} />
            ))}
          </View>
        ) : null}
        {analysis.keyPoints.length > 0 ? (
          <View style={styles.points}>
            {analysis.keyPoints.map((point, i) => (
              <View key={`${i}-${point}`} style={styles.point}>
                <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                <Text variant="secondary" style={styles.pointText}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {analysis.confidence < 0.7 ? (
          <Text variant="caption" tone="tertiary" style={styles.uncertain}>
            {t('assistant.uncertain')}
          </Text>
        ) : null}
      </AiInsightCard>
      {actions.length > 0 ? (
        <View style={styles.actions} testID="capture-actions">
          {actions.map((action, i) => (
            <Button
              key={`${action.kind}-${i}`}
              label={action.label}
              icon={ACTION_ICON[action.kind]}
              variant={i === 0 ? 'primary' : 'surface'}
              size="md"
              loading={busy && i === 0}
              onPress={() => void run(action)}
              testID={`capture-action-${action.kind}`}
            />
          ))}
        </View>
      ) : null}
      <Button
        label={t('capture.saveNote')}
        icon="draft"
        variant="ghostSecondary"
        size="sm"
        loading={saving}
        onPress={onSaveNote}
        testID="capture-save-note"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  points: { gap: 6, marginTop: 10 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  pointText: { flex: 1 },
  uncertain: { marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
