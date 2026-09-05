import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Briefing } from '@da/domain';
import { Button, Card, Icon, Text, useTheme } from '@da/ui';

export interface HeroBriefingCardProps {
  briefing?: Briefing | null;
  /** After 18:00 the card becomes the evening close entry ("Günü Kapat"). */
  isEvening: boolean;
  /** "BRİFİNG HAZIR · 07:58" time part, formatted by the caller. */
  readyTimeLabel?: string | null;
  onOpen: () => void;
  onListen: () => void;
  listenLoading?: boolean;
  /** Shown while no briefing exists yet (pull-to-refresh alternative). */
  onRefresh: () => void;
  refreshing?: boolean;
  testIDPrefix?: string;
}

/** Splits the headline so the highlight number renders in brand colour ("Bugün bilmen gereken **5** şey var."). */
export function splitHighlight(
  headline: string,
  highlight: number,
): [string, string, string] | null {
  const needle = String(highlight);
  const index = headline.indexOf(needle);
  if (index < 0) return null;
  return [headline.slice(0, index), needle, headline.slice(index + needle.length)];
}

/** hero/briefing — dawn wash card: AI kicker · 26/32 headline · subline · "Brifingimi Gör" + "Dinle · 2 dk". */
export function HeroBriefingCard({
  briefing,
  isEvening,
  readyTimeLabel,
  onOpen,
  onListen,
  listenLoading = false,
  onRefresh,
  refreshing = false,
  testIDPrefix = 'today-hero',
}: HeroBriefingCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const evening = Boolean(briefing && briefing.kind === 'evening');
  const kicker = !briefing
    ? t('today.briefingPreparing')
    : evening
      ? t('today.eveningReady')
      : t('today.briefingReady', { time: readyTimeLabel ?? '' }).replace(/ · $/, '');
  const headline = briefing?.headline ?? t('today.preparingHeadline');
  const parts = briefing ? splitHighlight(headline, briefing.highlightNumber) : null;
  const subline = briefing?.subline ?? t('today.preparingBody');
  const primaryLabel = !briefing
    ? t('common.refresh')
    : evening || isEvening
      ? t('today.closeDay')
      : t('today.seeBriefing');
  const minutes = briefing
    ? Math.max(1, Math.round((briefing.audio?.durationSec ?? briefing.estimatedReadSec) / 60))
    : 0;

  return (
    <Card
      variant="hero"
      accessibilityLabel={`${kicker} · ${headline}`}
      testID={`${testIDPrefix}-card`}
    >
      <View style={styles.kicker} accessibilityRole="header">
        <Icon name="ai" size={16} color={c.primary} filled />
        <Text variant="aiLabel" color={c.primary} numberOfLines={1} style={styles.kickerText}>
          {kicker}
        </Text>
      </View>
      <Text variant="hero" style={styles.headline} accessibilityRole="header">
        {parts ? (
          <>
            {parts[0]}
            <Text variant="hero" color={c.primary}>
              {parts[1]}
            </Text>
            {parts[2]}
          </>
        ) : (
          headline
        )}
      </Text>
      <Text variant="secondary" tone="secondary" style={styles.subline}>
        {subline}
      </Text>
      <View style={styles.actions}>
        <Button
          label={primaryLabel}
          variant="primary"
          size="md"
          icon={!briefing ? 'refresh' : undefined}
          loading={!briefing && refreshing}
          onPress={briefing ? onOpen : onRefresh}
          style={styles.primary}
          testID={`${testIDPrefix}-cta`}
        />
        {briefing ? (
          <Button
            label={t('today.listen', { minutes })}
            variant="tonal"
            size="md"
            icon="play"
            iconFilled
            loading={listenLoading}
            loadingLabel={t('common.preparing')}
            onPress={onListen}
            testID={`${testIDPrefix}-listen`}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { flexShrink: 1 },
  headline: { marginTop: 10 },
  subline: { marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  primary: { flex: 1 },
});
