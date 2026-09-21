import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PriorityRule } from '@da/domain';
import {
  Button,
  ConfirmModal,
  EmptyState,
  Icon,
  ListGroup,
  ListGroupTitle,
  Pressable,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { RuleRow } from '@/features/rules/RuleRow';
import { RuleSheet } from '@/features/rules/RuleSheet';
import { useRules, type RuleInput } from '@/features/rules/useRules';
import { useUiStore } from '@/store/ui';

/** Öncelik Kuralları — the user's explicit rules; they always beat what the AI learned on its own. */
export default function PriorityRulesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const offline = useUiStore((s) => s.offline);
  const { query, rules, busy, save, toggle, remove, move } = useRules();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PriorityRule | null>(null);
  const [deleting, setDeleting] = useState<PriorityRule | null>(null);
  const c = theme.colors;

  const openAdd = useCallback(() => {
    setEditing(null);
    setSheetOpen(true);
  }, []);
  const openEdit = useCallback((rule: PriorityRule) => {
    setEditing(rule);
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const onSubmit = useCallback(
    (input: RuleInput) => save.mutate(input, { onSuccess: () => setSheetOpen(false) }),
    [save],
  );

  const confirmDelete = useCallback(() => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target, { onSettled: () => setDeleting(null) });
  }, [deleting, remove]);

  return (
    <Screen
      scroll
      topGap={6}
      testID="rules-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.rules.title')}
          subtitle={t('settings.rules.subtitle')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, backgroundColor: c.background },
          ]}
        >
          <Button
            label={t('settings.rules.add')}
            size="lg"
            fullWidth
            icon="add"
            disabled={offline || query.isLoading}
            onPress={openAdd}
            testID="rules-add"
          />
        </View>
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="rules-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rules.length === 0 ? (
        <EmptyState
          icon="filter"
          title={t('settings.rules.empty')}
          body={t('settings.rules.precedenceNote')}
          actionLabel={t('settings.rules.add')}
          onAction={openAdd}
          testID="rules-empty"
        />
      ) : (
        <View style={styles.section}>
          <ListGroupTitle
            label={t('settings.rules.count', { count: rules.length })}
            meta={t('settings.rules.orderNote')}
          />
          <ListGroup>
            {rules.map((rule, index) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                index={index}
                count={rules.length}
                busy={busy?.id === rule.id || offline}
                onToggle={(r) => toggle.mutate(r)}
                onEdit={openEdit}
                onDelete={setDeleting}
                onMove={move}
              />
            ))}
          </ListGroup>
        </View>
      )}

      <View style={styles.note}>
        <Icon name="learning" size={18} color={c.primary} />
        <View style={styles.noteTexts}>
          <Text variant="small" tone="secondary">
            {t('settings.rules.aiLink')}
          </Text>
          <Pressable
            onPress={() => router.push('/settings/ai-personalization')}
            accessibilityRole="link"
            accessibilityLabel={t('settings.rules.aiLinkCta')}
            hitSlop={8}
            style={styles.link}
            testID="rules-ai-link"
          >
            <Text variant="action" tone="primary">
              {t('settings.rules.aiLinkCta')}
            </Text>
          </Pressable>
        </View>
      </View>

      <RuleSheet
        visible={sheetOpen}
        rule={editing}
        saving={save.isPending}
        onClose={closeSheet}
        onSubmit={onSubmit}
      />
      <ConfirmModal
        visible={deleting !== null}
        title={t('settings.rules.deleteConfirm')}
        body={deleting ? t('settings.rules.deleteBody', { label: deleting.label }) : undefined}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        testID="rule-delete-modal"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 0 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 16,
  },
  noteTexts: { flex: 1, minWidth: 0, gap: 4 },
  link: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center' },
  footer: { paddingTop: 10, paddingBottom: 12 },
});
