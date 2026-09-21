import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ApprovalAction } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  EmptyState,
  Icon,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@da/ui';
import { APPROVAL_ICON, statusLabelKey, statusTone } from '@/features/approvals/approvalMeta';
import { useApprovalCenter } from '@/features/approvals/useApprovalCenter';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';

/** Approval Center: everything the AI wants to do, pending first, then the 30-day history. */
export default function ApprovalsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const { query, pending, history } = useApprovalCenter();

  const open = (approval: ApprovalAction) =>
    router.push({ pathname: '/approvals/[id]', params: { id: approval.id } });

  const row = (approval: ApprovalAction, index: number, section: 'pending' | 'history') => {
    const typeLabel = t(`approvals.types.${approval.type}`);
    const time = formatRelativeLabel(
      section === 'pending' ? approval.createdAt : approval.updatedAt,
      ctx,
    );
    const statusLabel = t(statusLabelKey(approval.status));
    return (
      <View key={approval.id} testID={`approvals-item-${index}`}>
        <ListRow
          icon={APPROVAL_ICON[approval.type]}
          iconColor={section === 'pending' ? theme.colors.primaryText : undefined}
          title={approval.what}
          meta={`${typeLabel} · ${time}`}
          trailingText={section === 'history' ? statusLabel : null}
          trailingTone={section === 'history' ? statusTone(approval.status) : undefined}
          onPress={() => open(approval)}
          accessibilityLabel={`${typeLabel}: ${approval.what}, ${statusLabel}`}
          testID={`approval-${approval.id}`}
        />
      </View>
    );
  };

  const subtitle = query.data
    ? pending.length > 0
      ? t('approvals.subtitle', { count: pending.length })
      : t('approvals.subtitleEmpty')
    : undefined;

  return (
    <Screen
      scroll
      topGap={6}
      testID="approvals-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('approvals.title')}
          subtitle={subtitle}
          onBack={() => router.back()}
          backLabel={t('common.back')}
          testID="approvals-header"
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="approvals-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View style={styles.stack}>
          {pending.length === 0 ? (
            <EmptyState
              icon="approval"
              title={t('approvals.empty')}
              body={t('approvals.emptyBody')}
              compact={history.length > 0}
              testID="approvals-empty"
            />
          ) : (
            <View style={styles.section} testID="approvals-pending">
              <ListGroupTitle
                label={t('approvals.pendingSection')}
                meta={t('today.prioritiesCount', { count: pending.length })}
              />
              <ListGroup>{pending.map((a, i) => row(a, i, 'pending'))}</ListGroup>
            </View>
          )}
          {history.length > 0 ? (
            <View style={styles.section} testID="approvals-history">
              <ListGroupTitle
                label={t('approvals.history')}
                meta={t('today.prioritiesCount', { count: history.length })}
              />
              <ListGroup>{history.map((a, i) => row(a, pending.length + i, 'history'))}</ListGroup>
            </View>
          ) : null}
          <View style={styles.trust}>
            <Icon name="assurance" size={18} color={theme.colors.successText} />
            <Text variant="small" tone="secondary" style={styles.trustText}>
              {t('approvals.trust')}
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  section: { gap: 0 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  trustText: { flex: 1, minWidth: 0 },
});
