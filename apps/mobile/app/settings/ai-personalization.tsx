import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { LearnedPreference } from '@da/domain';
import { formatShortDate } from '@da/i18n';
import {
  ConfirmModal,
  EmptyState,
  Icon,
  IconButton,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  Toggle,
  useTheme,
  useToast,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { usePreferences } from '@/features/privacy/usePreferences';
import {
  LEARNED_GROUPS,
  iconForKind,
  useLearnedPreferences,
} from '@/features/rules/useLearnedPreferences';
import { useDataSource } from '@/hooks/useDataSource';
import { useUiStore } from '@/store/ui';

/** AI Kişiselleştirme — "Dijital Asistan beni nasıl tanıyor?": learn toggle + transparent learned model. */
export default function AiPersonalizationScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { preferences, update, isSaving } = usePreferences();
  const { query, grouped, count, busyId, toggle, remove } = useLearnedPreferences();
  const rulesQuery = useQuery({ queryKey: qk.rules, queryFn: () => ds.rules.listRules() });
  const [deleting, setDeleting] = useState<LearnedPreference | null>(null);
  const c = theme.colors;
  const learning = preferences?.learnFromInteractions ?? true;

  const onLearnChange = useCallback(
    async (next: boolean) => {
      const saved = await update({ learnFromInteractions: next });
      if (saved)
        toast.show({
          message: next ? t('settings.aiScreen.learnOn') : t('settings.aiScreen.learnOff'),
          icon: 'learning',
          iconTone: 'primary',
        });
    },
    [update, toast, t],
  );

  const confirmDelete = useCallback(() => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target, { onSettled: () => setDeleting(null) });
  }, [deleting, remove]);

  const metaFor = (pref: LearnedPreference) =>
    pref.enabled
      ? t('settings.aiScreen.evidence', {
          count: pref.evidenceCount,
          date: formatShortDate(pref.lastReinforcedAt, ctx),
        })
      : t('settings.aiScreen.disabledMeta', { count: pref.evidenceCount });

  return (
    <Screen
      scroll
      topGap={6}
      testID="ai-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.aiScreen.title')}
          subtitle={t('settings.aiScreen.subtitle')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />

      <ListGroup>
        <ListRow
          icon="learning"
          iconColor={c.primary}
          title={t('settings.aiScreen.learn')}
          meta={t('settings.aiScreen.learnNote')}
          trailing={
            <Toggle
              value={learning}
              onValueChange={(next) => void onLearnChange(next)}
              disabled={isSaving || offline || !preferences}
              accessibilityLabel={t('settings.aiScreen.learn')}
              testID="ai-learn-toggle"
            />
          }
        />
      </ListGroup>

      <View style={styles.section}>
        <ListGroupTitle label={t('settings.aiScreen.explicit')} />
        <ListGroup>
          <ListRow
            icon="filter"
            title={t('settings.aiScreen.rulesLink')}
            meta={t('settings.aiScreen.rulesLinkMeta', { count: rulesQuery.data?.length ?? 0 })}
            onPress={() => router.push('/settings/priority-rules')}
            testID="ai-rules-link"
          />
        </ListGroup>
        <View style={styles.note}>
          <Icon name="assurance" size={16} color={c.successText} />
          <Text variant="caption" tone="secondary" style={styles.noteText}>
            {t('settings.aiScreen.precedence')}
          </Text>
        </View>
      </View>

      {query.isLoading ? (
        <ListSkeleton count={2} testID="ai-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : count === 0 ? (
        <EmptyState
          icon="learning"
          title={t('settings.aiScreen.empty')}
          body={t('settings.aiScreen.emptyBody')}
          compact
          testID="ai-empty"
        />
      ) : (
        LEARNED_GROUPS.filter((group) => grouped[group].length > 0).map((group) => (
          <View key={group} style={styles.section}>
            <ListGroupTitle label={t(`settings.aiScreen.groups.${group}`)} />
            <ListGroup>
              {grouped[group].map((pref) => {
                const rowBusy = busyId === pref.id || offline;
                return (
                  <View
                    key={pref.id}
                    style={[styles.row, { opacity: pref.enabled ? 1 : 0.55 }]}
                    testID={`learned-${pref.id}`}
                    accessible
                    accessibilityLabel={`${pref.statement}, ${metaFor(pref)}`}
                  >
                    <View
                      style={[
                        styles.tile,
                        { backgroundColor: c.surface2, borderRadius: theme.radius.xs },
                      ]}
                    >
                      <Icon name={iconForKind(pref.kind)} size={17} color={c.inkSecondary} />
                    </View>
                    <View style={styles.texts}>
                      <Text variant="body" numberOfLines={3}>
                        {pref.statement}
                      </Text>
                      <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
                        {metaFor(pref)}
                      </Text>
                    </View>
                    <Toggle
                      value={pref.enabled}
                      onValueChange={() => toggle.mutate(pref)}
                      disabled={rowBusy}
                      accessibilityLabel={t('settings.aiScreen.toggle', {
                        statement: pref.statement,
                      })}
                      testID={`learned-toggle-${pref.id}`}
                    />
                    <IconButton
                      icon="delete"
                      variant="plain"
                      size={36}
                      iconSize={18}
                      color={c.inkTertiary}
                      disabled={rowBusy}
                      accessibilityLabel={`${t('settings.aiScreen.delete')} · ${pref.statement}`}
                      onPress={() => setDeleting(pref)}
                      testID={`learned-delete-${pref.id}`}
                    />
                  </View>
                );
              })}
            </ListGroup>
          </View>
        ))
      )}

      <ConfirmModal
        visible={deleting !== null}
        title={t('settings.aiScreen.deleteTitle')}
        body={
          deleting
            ? t('settings.aiScreen.deleteBody', { statement: deleting.statement })
            : undefined
        }
        confirmLabel={t('settings.aiScreen.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        testID="learned-delete-modal"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  noteText: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  tile: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
});
