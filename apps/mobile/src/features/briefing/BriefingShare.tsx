import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatDateRange, formatDurationLong, formatNumber, type FormatCtx } from '@da/i18n';
import type { Briefing, WeeklyMetrics } from '@da/domain';
import { Button, Card, ListGroup, ListRow, SectionKicker, Text, useTheme } from '@da/ui';
import { env } from '@/lib/env';

/**
 * Share text for "Dijital Haftamı Paylaş": counts and time saved only — never names, subjects or people.
 */
export function weeklyShareText(weekly: WeeklyMetrics, t: TFunction, ctx: FormatCtx): string {
  const range = formatDateRange(weekly.weekStart, weekly.weekEnd, ctx);
  const lines = [
    t('briefing.shareCardKicker', { range }),
    `${formatNumber(weekly.analyzedEmails, ctx.locale)} ${t('briefing.metrics.analyzed')}`,
    `${weekly.importantItems} ${t('briefing.metrics.important')}`,
    `${weekly.meetings} ${t('briefing.metrics.meetings', { prep: weekly.meetingsWithPrep })}`,
    `${weekly.followUps} ${t('briefing.metrics.followUps', { answered: weekly.followUpsAnswered })}`,
    `${weekly.deadlines} ${
      weekly.deadlinesMissed > 0
        ? t('briefing.metrics.deadlinesMissed', { missed: weekly.deadlinesMissed })
        : t('briefing.metrics.deadlines')
    }`,
    `${t('briefing.timeSaved')}: ${formatDurationLong(weekly.estimatedTimeSavedMinutes, ctx.locale)}`,
    `${t('app.name')} · ${env.webUrl}`,
  ];
  return lines.join('\n');
}

export interface BriefingShareProps {
  briefing: Briefing;
  weekly: WeeklyMetrics;
  ctx: FormatCtx;
  onShare: () => void;
  sharing?: boolean;
}

/** Weekly review body: editorial metric rows, time saved, busiest day, top people, next-week outlook, share CTA. */
export function BriefingShare({
  briefing,
  weekly,
  ctx,
  onShare,
  sharing = false,
}: BriefingShareProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const metrics: { value: string; label: string }[] = [
    {
      value: formatNumber(weekly.analyzedEmails, ctx.locale),
      label: t('briefing.metrics.analyzed'),
    },
    { value: String(weekly.importantItems), label: t('briefing.metrics.important') },
    {
      value: String(weekly.meetings),
      label: t('briefing.metrics.meetings', { prep: weekly.meetingsWithPrep }),
    },
    {
      value: String(weekly.followUps),
      label: t('briefing.metrics.followUps', { answered: weekly.followUpsAnswered }),
    },
    {
      value: String(weekly.deadlines),
      label:
        weekly.deadlinesMissed > 0
          ? t('briefing.metrics.deadlinesMissed', { missed: weekly.deadlinesMissed })
          : t('briefing.metrics.deadlines'),
    },
  ];

  return (
    <View style={[styles.wrap, { gap: theme.layout.sectionGapLarge }]}>
      <Card variant="paper" radius={theme.radius.hero} padding={theme.layout.editorialPaddingH}>
        {metrics.map((m, index) => (
          <View
            key={m.label}
            style={[
              styles.metric,
              index > 0
                ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }
                : null,
            ]}
          >
            <Text variant="editorialNumber" tabular>
              {m.value}
            </Text>
            <Text variant="secondary" tone="secondary" style={styles.metricLabel}>
              {m.label}
            </Text>
          </View>
        ))}
      </Card>

      <View>
        <SectionKicker label={t('briefing.timeSaved')} />
        <Card
          variant="paper"
          radius={theme.radius.hero}
          padding={theme.layout.editorialPaddingH}
          style={styles.gapTop}
        >
          <Text variant="editorialStat">
            {formatDurationLong(weekly.estimatedTimeSavedMinutes, ctx.locale)}
          </Text>
          <Text variant="small" tone="secondary" style={styles.note}>
            {t('briefing.timeSavedNote', {
              mails: weekly.timeSavedBreakdown.unreadMails,
              prep: weekly.timeSavedBreakdown.prepNotes,
              drafts: weekly.timeSavedBreakdown.followUpDrafts,
            })}
          </Text>
        </Card>
      </View>

      {weekly.busiestDay ? (
        <View>
          <SectionKicker label={t('briefing.busiestDay')} />
          <ListGroup style={styles.gapTop}>
            <ListRow
              icon="event"
              title={weekly.busiestDay.note}
              meta={t('plan.events')}
              trailingText={String(weekly.busiestDay.meetings)}
            />
          </ListGroup>
        </View>
      ) : null}

      {weekly.topPeople.length > 0 ? (
        <View>
          <SectionKicker label={t('briefing.topPeople')} />
          <ListGroup style={styles.gapTop}>
            {weekly.topPeople.map((p) => (
              <ListRow
                key={p.name}
                icon="person"
                title={p.name}
                trailingText={t('briefing.interactions', { count: p.count })}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      {briefing.outlook ? (
        <View>
          <SectionKicker label={t('briefing.nextWeek')} />
          <Text variant="editorialSmall" style={styles.gapTop}>
            {briefing.outlook}
          </Text>
        </View>
      ) : null}

      <Button
        label={t('briefing.shareWeek')}
        icon="share"
        variant="dark"
        size="lg"
        fullWidth
        loading={sharing}
        onPress={onShare}
        testID="weekly-share"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  metric: { paddingVertical: 12 },
  metricLabel: { marginTop: 2 },
  note: { marginTop: 8 },
  gapTop: { marginTop: 8 },
});
