import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { LifeEvent } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  Button,
  Icon,
  LIFE_ICON,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionKicker,
  Skeleton,
  SourceLine,
  Text,
  useTheme,
  useToast,
} from '@da/ui';
import {
  LIFE_FIELDS,
  lifeActionsFor,
  lifeEventWhen,
  lifeFieldValue,
  type LifeAction,
} from '@/features/flow/lifeEventFields';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useReminderSheet } from '@/features/reminders/useReminderSheet';
import { useOpenSource } from '@/features/source/openSource';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { openExternal } from '@/lib/openExternal';
import { openHandoff } from '@/services/handoff';

const ACTION_ICON = {
  track: 'shipment',
  check_in: 'flight',
  open_link: 'link',
  pay: 'payment',
  directions: 'directions',
  remind: 'reminder',
  done: 'check',
} as const;

export default function LifeEventScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { openSource } = useOpenSource();
  const { openReminderSheet } = useReminderSheet();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: qk.lifeEvent(id ?? ''),
    queryFn: () => ds.feed.getLifeEvent(id ?? ''),
    enabled: Boolean(id),
  });
  const event = query.data;

  const setStatus = useMutation({
    mutationFn: (status: LifeEvent['status']) => ds.feed.setLifeEventStatus(id ?? '', status),
    onSuccess: async (updated) => {
      queryClient.setQueryData(qk.lifeEvent(id ?? ''), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.lifeEvents }),
        queryClient.invalidateQueries({ queryKey: ['flow'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ]);
      toast.show({ message: t('lifeEvents.doneToast'), icon: 'check' });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const run = async (action: LifeAction) => {
    if (!event) return;
    switch (action.kind) {
      case 'track':
      case 'check_in':
      case 'open_link':
      case 'pay': {
        if (!action.url) return;
        const ok = await openExternal(action.url);
        if (!ok)
          toast.show({
            message: t('errors.handoffFailed'),
            icon: 'conflict',
            iconTone: 'critical',
          });
        return;
      }
      case 'directions': {
        const location = event.details.address ?? event.details.venue ?? '';
        const result = await openHandoff({ kind: 'directions', location });
        if (!result.ok)
          toast.show({
            message: t('errors.handoffFailed'),
            icon: 'conflict',
            iconTone: 'critical',
          });
        return;
      }
      case 'remind':
        openReminderSheet({
          targetType: 'life_event',
          targetId: event.id,
          title: event.title,
          dueAt: lifeEventWhen(event),
          sourceLabel: event.source.label,
        });
        return;
      case 'done':
        setStatus.mutate('done');
        return;
    }
  };

  const when = event ? lifeEventWhen(event) : null;
  const actions = event ? lifeActionsFor(event) : [];

  return (
    <Screen
      scroll
      topGap={6}
      testID="life-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          kicker={event ? t(`badges.${event.type}`) : undefined}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <View style={styles.stack} testID="life-loading">
          <Skeleton width="80%" height={26} />
          <Skeleton width="40%" height={14} />
          <Skeleton height={160} radius={theme.radius.xl} />
        </View>
      ) : query.isError || !event ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor:
                    event.type === 'security' ? theme.colors.criticalSoft : theme.colors.surface2,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Icon
                name={LIFE_ICON[event.type]}
                size={22}
                color={
                  event.type === 'security' ? theme.colors.criticalText : theme.colors.inkSecondary
                }
              />
            </View>
            <View style={styles.titleTexts}>
              <Text variant="h2" testID="life-title">
                {event.title}
              </Text>
              {when ? (
                <Text variant="secondary" tone="secondary">
                  {formatRelativeLabel(when, ctx)}
                </Text>
              ) : null}
              {event.status === 'done' ? (
                <Text variant="caption" tone="success" testID="life-status-done">
                  {t('lifeEvents.markDone')}
                </Text>
              ) : null}
            </View>
          </View>
          <SectionKicker label={t('lifeEvents.details')} />
          <ListGroup testID="life-details">
            {LIFE_FIELDS[event.type].map((key) => {
              const value = lifeFieldValue(event, key, ctx);
              return (
                <ListRow
                  key={key}
                  title={t(`lifeEvents.fields.${key}`)}
                  trailingText={value ?? t('lifeEvents.notInSource')}
                  trailingTone={value ? 'primary' : 'tertiary'}
                  testID={`life-field-${key}`}
                />
              );
            })}
          </ListGroup>
          {event.type === 'payment' ? (
            <Text variant="caption" tone="tertiary" style={styles.note}>
              {t('lifeEvents.neverPays')}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {actions.map((action) => (
              <Button
                key={action.kind}
                label={t(`lifeEvents.actions.${action.kind}`)}
                icon={ACTION_ICON[action.kind]}
                variant={
                  action.kind === 'done' ? 'tonal' : action === actions[0] ? 'primary' : 'surface'
                }
                size="sm"
                loading={action.kind === 'done' && setStatus.isPending}
                onPress={() => void run(action)}
                testID={`life-action-${action.kind}`}
              />
            ))}
          </View>
          <SourceLine
            source={event.source}
            timeLabel={formatRelativeLabel(event.source.timestamp, ctx)}
            onPress={(source) => void openSource(source)}
            style={styles.source}
          />
          <Button
            label={t('common.openSource')}
            variant="ghostSecondary"
            size="sm"
            onPress={() => void openSource(event.source)}
            testID="life-source"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  titleRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleTexts: { flex: 1, minWidth: 0, gap: 4 },
  note: { paddingHorizontal: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  source: { paddingHorizontal: 4 },
});
