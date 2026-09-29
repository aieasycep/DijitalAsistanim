import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MeetingPrep } from '@da/domain';
import { AiInsightCard, Pressable, Text, useTheme } from '@da/ui';
import { useOpenSource } from '../source/openSource';

/** The signature "Konuşman gereken 3 şey" card — dark ink surface, numbered rows, sources one tap away. */
export function TalkingPoints({ points }: { points: MeetingPrep['talkingPoints'] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { openSource } = useOpenSource();
  const inverseMuted = theme.colors.inverseSecondary;
  return (
    <AiInsightCard
      variant="dark"
      label={t('meeting.talkingPoints', { count: points.length })}
      title={t('meeting.talkingPointsTitle')}
      testID="prep-talking-points"
    >
      <View style={styles.list}>
        {points.map((point, i) => {
          const body = (
            <View style={styles.row}>
              <View style={[styles.number, { backgroundColor: theme.colors.inverseSurface2 }]}>
                <Text variant="chip" tone="inverse" tabular>
                  {i + 1}
                </Text>
              </View>
              <View style={styles.texts}>
                <Text variant="h3" tone="inverse">
                  {point.title}
                </Text>
                <Text variant="secondary" color={inverseMuted} style={styles.detail}>
                  {point.detail}
                </Text>
                {point.source ? (
                  <Text variant="caption" color={inverseMuted}>
                    {[point.source.label, point.source.person].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>
          );
          return point.source ? (
            <Pressable
              key={`${i}-${point.title}`}
              onPress={() => void openSource(point.source as NonNullable<typeof point.source>)}
              accessibilityRole="button"
              accessibilityLabel={`${point.title} · ${t('common.openSource')}`}
              pressScale={0.99}
              testID={`prep-talking-${i}`}
            >
              {body}
            </Pressable>
          ) : (
            <View key={`${i}-${point.title}`} accessibilityRole="text" testID={`prep-talking-${i}`}>
              {body}
            </View>
          );
        })}
      </View>
    </AiInsightCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  detail: { marginTop: 2 },
});
