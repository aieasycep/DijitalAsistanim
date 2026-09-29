import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { Icon, Pressable, Skeleton, Text, useTheme } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';

export interface SuggestedQuestionsProps {
  contactId?: string | null;
  onPick: (text: string) => void;
}

/** "ÖNERİLEN SORULAR" — data-driven rows from the server, with the static defaults as a fallback. */
export function SuggestedQuestions({ contactId = null, onPick }: SuggestedQuestionsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ds = useDataSource();
  const query = useQuery({
    queryKey: qk.suggestedQuestions(contactId),
    queryFn: () => ds.assistant.suggestedQuestions({ contactId }),
    staleTime: 5 * 60_000,
  });
  const fallback = (t('assistant.defaultQuestions', { returnObjects: true }) as string[]).map(
    (text, i) => ({ id: `default-${i}`, text, reason: null }),
  );
  const questions = query.data?.questions ?? (query.isError ? fallback : []);

  return (
    <View style={styles.wrap} testID="assistant-suggestions">
      <Text variant="kicker" tone="tertiary" style={styles.kicker}>
        {t('assistant.suggested')}
      </Text>
      {query.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={52} radius={theme.radius.lg} />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {questions.map((q, i) => (
            <Pressable
              key={q.id}
              onPress={() => onPick(q.text)}
              accessibilityRole="button"
              accessibilityLabel={q.text}
              accessibilityHint={q.reason ?? undefined}
              hapticOnPress="selection"
              pressScale={0.98}
              style={[
                styles.row,
                {
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
                  borderColor: theme.cardRing,
                },
                theme.isDark ? null : theme.shadows.s1,
              ]}
              testID={`assistant-suggestion-${i}`}
            >
              <View style={styles.texts}>
                <Text variant="bodyMedium" numberOfLines={2}>
                  {q.text}
                </Text>
                {q.reason ? (
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {q.reason}
                  </Text>
                ) : null}
              </View>
              <Icon name="send" size={18} color={theme.colors.inkDisabled} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  kicker: { paddingHorizontal: 4, paddingTop: 6 },
  list: { gap: 8 },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
