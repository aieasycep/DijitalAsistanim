import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Reminder, SourceRef } from '@da/domain';
import { formatRelativeLabel, formatTime, type FormatCtx } from '@da/i18n';
import { Button, Card, EmptyState, Screen, ScreenHeader, SourceLine, Text } from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useReminderList } from '@/features/reminders/useReminderList';
import { useOpenSource } from '@/features/source/openSource';

/** Scheduled reminders: when they fire, why that time, where they came from — complete or cancel each one. */
export default function RemindersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ctx = useFormatCtx();
  const { openSource } = useOpenSource();
  const { query, complete, cancel, busyId } = useReminderList();
  const reminders = query.data ?? [];

  return (
    <Screen
      scroll
      topGap={6}
      testID="reminders-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('reminders.title')}
          subtitle={query.data ? t('reminders.subtitle', { count: reminders.length }) : undefined}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="reminders-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon="schedule"
          title={t('reminders.empty')}
          body={t('reminders.emptyBody')}
          testID="reminders-empty"
        />
      ) : (
        <View style={styles.stack}>
          {reminders.map((reminder, index) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              index={index}
              ctx={ctx}
              busy={busyId === reminder.id}
              onComplete={() => complete(reminder)}
              onCancel={() => cancel(reminder)}
              onSource={(source) => void openSource(source)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

interface ReminderCardProps {
  reminder: Reminder;
  index: number;
  ctx: FormatCtx;
  busy: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onSource: (source: SourceRef) => void;
}

function ReminderCard({
  reminder,
  index,
  ctx,
  busy,
  onComplete,
  onCancel,
  onSource,
}: ReminderCardProps) {
  const { t } = useTranslation();
  return (
    <Card testID={`reminder-item-${index}`}>
      <Text variant="bodyMedium">{reminder.title}</Text>
      {reminder.body ? (
        <Text variant="small" tone="secondary" style={styles.body}>
          {reminder.body}
        </Text>
      ) : null}
      <Text variant="caption" tone="primary" style={styles.when}>
        {t('reminders.at', {
          day: formatRelativeLabel(reminder.remindAt, ctx),
          time: formatTime(reminder.remindAt, ctx),
          option: t(`reminder.options.${reminder.option}`),
        })}
      </Text>
      {reminder.smartReason ? (
        <Text variant="caption" tone="tertiary">
          {reminder.smartReason}
        </Text>
      ) : null}
      {reminder.source ? (
        <SourceLine
          source={reminder.source}
          timeLabel={formatRelativeLabel(reminder.source.timestamp, ctx)}
          onPress={onSource}
          style={styles.source}
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t('reminders.complete')}
          size="sm"
          icon="check"
          loading={busy}
          onPress={onComplete}
          testID={`reminder-complete-${reminder.id}`}
        />
        <Button
          label={t('reminders.cancel')}
          size="sm"
          variant="ghostSecondary"
          disabled={busy}
          onPress={onCancel}
          testID={`reminder-cancel-${reminder.id}`}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  body: { marginTop: 2 },
  when: { marginTop: 8 },
  source: { marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
