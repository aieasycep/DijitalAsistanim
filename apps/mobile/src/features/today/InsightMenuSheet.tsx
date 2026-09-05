/**
 * "···" menu of a priority card: Neden önemli? · Önemli değil · Bunu daha sık göster · Bu kişiyi VIP yap ·
 * Bunu takip etme · Kaynağı Gör. Feedback rows teach the ranking (ds.feed.sendFeedback); VIP adds the person.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { AiFeedbackKind, Insight } from '@da/domain';
import { BottomSheet, Button, SheetRow, Text, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { useInsightActions } from '@/features/insights/useInsightActions';
import { useOpenSource } from '@/features/source/openSource';

export interface InsightMenuSheetProps {
  insight: Insight | null;
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

export function InsightMenuSheet({
  insight,
  visible,
  onClose,
  testID = 'insight-menu',
}: InsightMenuSheetProps) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const { dismiss } = useInsightActions();
  const { openSource } = useOpenSource();
  const [showReason, setShowReason] = useState(false);

  const close = useCallback(() => {
    setShowReason(false);
    onClose();
  }, [onClose]);

  const invalidateFeeds = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['flow'] }),
      queryClient.invalidateQueries({ queryKey: qk.followUps }),
    ]);
  }, [queryClient]);

  const feedback = useMutation({
    mutationFn: (input: { kind: AiFeedbackKind; insight: Insight }) =>
      ds.feed.sendFeedback({
        kind: input.kind,
        entityType: 'insight',
        entityId: input.insight.id,
        contactId: input.insight.source.personId ?? null,
      }),
    onSuccess: async (_result, variables) => {
      await invalidateFeeds();
      toast.show({
        message:
          variables.kind === 'stop_following'
            ? t('today.menu.stopFollowingToast')
            : t('today.menu.showMoreToast'),
        icon: 'learning',
        iconTone: 'primary',
      });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const makeVip = useMutation({
    mutationFn: (target: Insight) =>
      ds.people.addVip({
        contactId: target.source.personId ?? null,
        displayName: target.source.person ?? '',
        email: null,
        notifyAlways: true,
      }),
    onSuccess: async (vip) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.vips }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        invalidateFeeds(),
      ]);
      toast.show({
        message: t('today.vipToast', { name: vip.displayName }),
        icon: 'vip',
        iconTone: 'primary',
      });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const run = useCallback(
    (fn: (target: Insight) => void) => {
      if (!insight) return;
      close();
      fn(insight);
    },
    [insight, close],
  );

  const person = insight?.source.person ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={showReason ? t('common.whyImportant') : t('today.menu.title')}
      subtitle={insight?.title}
      closeLabel={t('common.close')}
      testID={testID}
    >
      {showReason ? (
        <View style={styles.reason}>
          <Text variant="body">{insight?.reason ?? t('today.menu.noReason')}</Text>
          {insight?.priorityReasons.length ? (
            <View style={styles.reasons}>
              {insight.priorityReasons.map((reason) => (
                <Text key={reason} variant="small" tone="secondary">
                  · {reason}
                </Text>
              ))}
            </View>
          ) : null}
          <Button
            label={t('common.back')}
            variant="ghostSecondary"
            size="ghost"
            onPress={() => setShowReason(false)}
            style={styles.back}
          />
        </View>
      ) : (
        <View>
          <SheetRow
            icon="info"
            label={t('common.whyImportant')}
            onPress={() => setShowReason(true)}
            testID={`${testID}-why`}
          />
          <SheetRow
            icon="thumbDown"
            label={t('common.notImportant')}
            divider
            onPress={() => run((target) => dismiss(target, 'not_important'))}
            testID={`${testID}-not-important`}
          />
          <SheetRow
            icon="thumbUp"
            iconTone="primary"
            label={t('common.showMore')}
            divider
            onPress={() => run((target) => feedback.mutate({ kind: 'show_more', insight: target }))}
            testID={`${testID}-show-more`}
          />
          <SheetRow
            icon="vip"
            iconTone="primary"
            label={person ? `${t('common.makeVip')} · ${person}` : t('common.makeVip')}
            divider
            disabled={!person}
            onPress={() =>
              run((target) => {
                if (!target.source.person) {
                  toast.show({ message: t('today.menu.noPerson'), icon: 'info' });
                  return;
                }
                makeVip.mutate(target);
              })
            }
            testID={`${testID}-vip`}
          />
          <SheetRow
            icon="block"
            label={t('common.stopFollowing')}
            divider
            onPress={() =>
              run((target) => feedback.mutate({ kind: 'stop_following', insight: target }))
            }
            testID={`${testID}-stop-following`}
          />
          <SheetRow
            icon="link"
            label={t('common.openSource')}
            divider
            onPress={() => run((target) => void openSource(target.source))}
            testID={`${testID}-source`}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reason: { paddingVertical: 8, gap: 10 },
  reasons: { gap: 4 },
  back: { alignSelf: 'flex-start' },
});
