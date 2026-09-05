/**
 * "Diğer seçenekler" sheet of a priority card: why it matters, not important, show more of this,
 * make the sender VIP, stop following, open the source. Feedback calls are internal-only mutations.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiFeedbackKind, Insight } from '@da/domain';
import { BottomSheet, SheetRow, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';
import { useInsightActions } from '../insights/useInsightActions';
import { useOpenSource } from '../source/openSource';

export interface InsightMenuSheetProps {
  insight: Insight | null;
  onClose: () => void;
}

export function InsightMenuSheet({ insight, onClose }: InsightMenuSheetProps) {
  const { t } = useTranslation();
  const ds = useDataSource();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { gate } = useEntitlement();
  const { dismiss } = useInsightActions();
  const { openSource } = useOpenSource();

  const feedback = useMutation({
    mutationFn: (input: { kind: AiFeedbackKind; target: Insight }) =>
      ds.feed.sendFeedback({
        kind: input.kind,
        entityType: input.target.entityType,
        entityId: input.target.entityId,
        contactId: input.target.source.personId ?? null,
      }),
    onSuccess: (_, input) => {
      toast.show({
        message:
          input.kind === 'show_more' ? t('today.dismissedToast') : t('today.dismissedToast'),
        icon: 'learning',
        iconTone: 'primary',
      });
    },
    onError: (e) => toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const makeVip = useMutation({
    mutationFn: async (target: Insight) => {
      const contactId = target.source.personId;
      if (contactId) {
        await ds.people.setVip(contactId, true);
      } else {
        await ds.people.addVip({ displayName: target.source.person ?? target.title, notifyAlways: true });
      }
    },
    onSuccess: async (_, target) => {
      await queryClient.invalidateQueries({ queryKey: ['vips'] });
      toast.show({ message: t('today.vipToast', { name: target.source.person ?? '' }), icon: 'vip', iconTone: 'primary' });
    },
    onError: (e) => toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const run = useCallback(
    (fn: () => void) => {
      onClose();
      fn();
    },
    [onClose],
  );

  if (!insight) return <BottomSheet visible={false} onClose={onClose} />;

  return (
    <BottomSheet
      visible={Boolean(insight)}
      onClose={onClose}
      title={insight.title}
      subtitle={insight.reason ?? undefined}
      closeLabel={t('common.close')}
      testID="insight-menu"
    >
      <SheetRow
        icon="thumbDown"
        label={t('common.notImportant')}
        onPress={() => run(() => dismiss(insight, 'not_important'))}
        testID="insight-menu-not-important"
      />
      <SheetRow
        icon="thumbUp"
        label={t('common.showMore')}
        divider
        onPress={() => run(() => feedback.mutate({ kind: 'show_more', target: insight }))}
        testID="insight-menu-show-more"
      />
      {insight.source.person ? (
        <SheetRow
          icon="vip"
          iconTone="primary"
          label={t('common.makeVip')}
          divider
          onPress={() =>
            run(() => {
              if (gate('vip_people', 'vip')) makeVip.mutate(insight);
            })
          }
          testID="insight-menu-vip"
        />
      ) : null}
      <SheetRow
        icon="block"
        label={t('common.stopFollowing')}
        divider
        onPress={() => run(() => feedback.mutate({ kind: 'stop_following', target: insight }))}
        testID="insight-menu-stop"
      />
      <SheetRow
        icon="link"
        label={t('common.openSource')}
        divider
        onPress={() => run(() => void openSource(insight.source))}
        testID="insight-menu-source"
      />
    </BottomSheet>
  );
}
