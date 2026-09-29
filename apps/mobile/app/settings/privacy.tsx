import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { RETENTION_OPTIONS, type RetentionOption } from '@da/domain';
import { palette } from '@da/design-tokens';
import { formatNumber, formatRelativeLabel, formatTime } from '@da/i18n';
import {
  Button,
  Card,
  Icon,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Pressable,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { isLiveAccount } from '@/features/integrations/scopes';
import { DeleteAccountSheet } from '@/features/privacy/DeleteAccountSheet';
import { DeleteHistorySheet } from '@/features/privacy/DeleteHistorySheet';
import { auditActionKey, auditActorKey } from '@/features/privacy/auditLabels';
import { exportView, useDataExport } from '@/features/privacy/useDataExport';
import { usePreferences } from '@/features/privacy/usePreferences';
import {
  useAuditLogs,
  useDeleteAccount,
  useDeleteHistory,
} from '@/features/privacy/usePrivacyActions';
import { useDataSource } from '@/hooks/useDataSource';
import { useUiStore } from '@/store/ui';

const ASSURANCES = ['assure1', 'assure2', 'assure3'] as const;

/** Gizlilik ve Güvenlik — the trust promise made visible: what is read, kept, exported and deleted. */
export default function PrivacyScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { preferences, update, isSaving } = usePreferences();
  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
  });
  const dataExport = useDataExport();
  const audit = useAuditLogs();
  const deleteHistory = useDeleteHistory();
  const deleteAccount = useDeleteAccount();
  const historySheet = useBottomSheet();
  const accountSheet = useBottomSheet();
  const c = theme.colors;

  const retention: RetentionOption = preferences?.retention ?? '90d';
  const connectedCount = useMemo(
    () => (accountsQuery.data ?? []).filter(isLiveAccount).length,
    [accountsQuery.data],
  );
  const view = exportView(dataExport.request, ctx.now ?? new Date());

  const onRetention = useCallback(
    async (option: RetentionOption) => {
      if (option === retention) return;
      const saved = await update({ retention: option });
      if (saved)
        toast.show({
          message: t('settings.privacyScreen.retentionSaved', {
            option: t(`settings.privacyScreen.retentionOptions.${option}`),
          }),
          icon: 'history',
        });
    },
    [retention, update, toast, t],
  );

  const exportSize = (bytes: number | null | undefined): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1
      ? t('settings.privacyScreen.sizeMb', {
          size: formatNumber(Math.round(mb * 10) / 10, ctx.locale),
        })
      : t('settings.privacyScreen.sizeKb', {
          size: formatNumber(Math.round(bytes / 1024), ctx.locale),
        });
  };

  const dangerRow = (
    label: string,
    icon: 'history' | 'accountDelete',
    onPress: () => void,
    testID: string,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={offline}
      accessibilityRole="button"
      accessibilityLabel={label}
      pressScale={1}
      ensureTouchTarget={false}
      style={[styles.dangerRow, { minHeight: theme.layout.listRowMinHeight }]}
      testID={testID}
    >
      <View style={[styles.tile, { backgroundColor: c.criticalSoft }]}>
        <Icon name={icon} size={17} color={c.criticalText} />
      </View>
      <Text variant="bodyMedium" tone="critical" style={styles.dangerLabel}>
        {label}
      </Text>
      <Icon name="forward" size={18} color={c.inkDisabled} />
    </Pressable>
  );

  return (
    <Screen
      scroll
      topGap={6}
      testID="privacy-screen"
      refreshing={audit.isRefetching}
      onRefresh={() => {
        void audit.refetch();
        void dataExport.refetch();
      }}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.privacyScreen.title')}
          subtitle={t('settings.privacyScreen.subtitle')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice />

      <Card variant="inverse" radius={theme.radius.modal} testID="privacy-assurances">
        <Text variant="kicker" tone="onGradientMuted">
          {t('settings.privacyScreen.assuranceKicker')}
        </Text>
        {ASSURANCES.map((key) => (
          <View key={key} style={styles.assurance}>
            <Icon name="assurance" size={20} color={palette.green300} />
            <Text variant="body" tone="inverse" style={styles.assuranceText}>
              {t(`settings.privacyScreen.${key}`)}
            </Text>
          </View>
        ))}
      </Card>

      <View style={styles.section}>
        <ListGroupTitle label={t('settings.privacyScreen.dataKicker')} />
        <ListGroup>
          <ListRow
            icon="link"
            title={t('settings.privacyScreen.connected')}
            trailingText={t('settings.privacyScreen.connectedMeta', { count: connectedCount })}
            onPress={() => router.push('/settings/integrations')}
            testID="privacy-row-connections"
          />
          <ListRow
            icon="eye"
            title={t('settings.privacyScreen.dataSources')}
            meta={t('settings.privacyScreen.aiDataNote')}
            onPress={() => router.push('/settings/data-sources')}
            testID="privacy-row-dataSources"
          />
          <ListRow
            icon="learning"
            title={t('settings.privacyScreen.aiPersonalization')}
            trailingText={
              preferences?.learnFromInteractions === false
                ? t('settings.privacyScreen.off')
                : t('settings.privacyScreen.on')
            }
            onPress={() => router.push('/settings/ai-personalization')}
            testID="privacy-row-aiPersonalization"
          />
          {dangerRow(
            t('settings.privacyScreen.deleteHistory'),
            'history',
            historySheet.open,
            'privacy-delete-history',
          )}
          {dangerRow(
            t('settings.privacyScreen.deleteAccount'),
            'accountDelete',
            accountSheet.open,
            'privacy-delete-account',
          )}
        </ListGroup>
      </View>

      <View style={styles.section}>
        <ListGroupTitle
          label={t('settings.privacyScreen.retentionKicker')}
          meta={t(`settings.privacyScreen.retentionOptions.${retention}`)}
        />
        <Text variant="small" tone="secondary" style={styles.body}>
          {t('settings.privacyScreen.retentionBody')}
        </Text>
        <ListGroup>
          {RETENTION_OPTIONS.map((option) => {
            const selected = option === retention;
            return (
              <ListRow
                key={option}
                title={t(`settings.privacyScreen.retentionOptions.${option}`)}
                onPress={() => void onRetention(option)}
                disabled={isSaving || offline || !preferences}
                accessibilityLabel={t('settings.privacyScreen.retentionSelect', {
                  option: t(`settings.privacyScreen.retentionOptions.${option}`),
                })}
                trailing={
                  <Icon
                    name={selected ? 'complete' : 'uncheck'}
                    size={22}
                    color={selected ? c.primary : c.inkDisabled}
                    filled={selected}
                  />
                }
                testID={`retention-${option}`}
              />
            );
          })}
        </ListGroup>
        <Text variant="caption" tone="tertiary" style={styles.note}>
          {t('settings.privacyScreen.retentionNote')}
        </Text>
      </View>

      <View style={styles.section}>
        <ListGroupTitle label={t('settings.privacyScreen.exportKicker')} />
        <Card testID="privacy-export">
          <Text variant="bodyMedium">{t('settings.privacyScreen.exportTitle')}</Text>
          <Text variant="small" tone="secondary" style={styles.exportBody}>
            {t('settings.privacyScreen.exportBody')}
          </Text>
          {dataExport.isLoading ? (
            <Skeleton width="60%" height={12} style={styles.exportStatus} />
          ) : view === 'preparing' ? (
            <Text
              variant="small"
              tone="primary"
              style={styles.exportStatus}
              testID="privacy-export-status"
            >
              {t('settings.privacyScreen.exportPreparing')}
            </Text>
          ) : view === 'ready' && dataExport.request ? (
            <Text
              variant="small"
              tone="success"
              style={styles.exportStatus}
              testID="privacy-export-status"
            >
              {t('settings.privacyScreen.exportReadyMeta', {
                size: exportSize(dataExport.request.sizeBytes),
                until: dataExport.request.urlExpiresAt
                  ? `${formatRelativeLabel(dataExport.request.urlExpiresAt, ctx)} ${formatTime(dataExport.request.urlExpiresAt, ctx)}`
                  : '',
              })}
            </Text>
          ) : view === 'failed' ? (
            <Text
              variant="small"
              tone="critical"
              style={styles.exportStatus}
              testID="privacy-export-status"
            >
              {t('settings.privacyScreen.exportFailedBody')}
            </Text>
          ) : view === 'expired' ? (
            <Text
              variant="small"
              tone="warning"
              style={styles.exportStatus}
              testID="privacy-export-status"
            >
              {t('settings.privacyScreen.exportExpiredBody')}
            </Text>
          ) : null}
          <View style={styles.exportActions}>
            {view === 'ready' ? (
              <Button
                label={t('settings.privacyScreen.download')}
                size="sm"
                icon="download"
                onPress={() => void dataExport.download()}
                testID="privacy-export-download"
              />
            ) : null}
            <Button
              label={
                view === 'idle'
                  ? t('settings.privacyScreen.exportStart')
                  : view === 'preparing'
                    ? t('settings.privacyScreen.exportStatus.processing')
                    : t('settings.privacyScreen.exportRestart')
              }
              variant={view === 'ready' ? 'ghostSecondary' : 'tonal'}
              size="sm"
              icon={view === 'ready' ? undefined : 'export'}
              loading={dataExport.isStarting || view === 'preparing'}
              loadingLabel={t('settings.privacyScreen.exportStatus.processing')}
              disabled={offline || dataExport.isLoading}
              onPress={() => dataExport.start()}
              testID="privacy-export-start"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <ListGroupTitle label={t('settings.privacyScreen.auditKicker')} />
        {audit.isLoading ? (
          <ListGroup>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.auditSkeleton}>
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} />
              </View>
            ))}
          </ListGroup>
        ) : audit.isError || (audit.data ?? []).length === 0 ? (
          <Text variant="small" tone="tertiary" style={styles.body} testID="privacy-audit-empty">
            {t('settings.privacyScreen.auditEmpty')}
          </Text>
        ) : (
          <ListGroup>
            {(audit.data ?? []).map((log, index) => (
              <View key={`${log.createdAt}-${index}`} testID={`privacy-audit-${index}`}>
                <ListRow
                  icon="history"
                  title={t(auditActionKey(log.action), { defaultValue: log.action })}
                  meta={`${t(auditActorKey(log.actor), { defaultValue: log.actor })} · ${formatRelativeLabel(log.createdAt, ctx)} ${formatTime(log.createdAt, ctx)}`}
                />
              </View>
            ))}
          </ListGroup>
        )}
      </View>

      <View style={styles.compliance}>
        <Icon name="lock" size={16} color={c.inkTertiary} />
        <Text variant="caption" tone="tertiary" style={styles.complianceText}>
          {t('settings.privacyScreen.compliance')}
        </Text>
      </View>

      <DeleteHistorySheet
        visible={historySheet.visible}
        retention={retention}
        loading={deleteHistory.isPending}
        onConfirm={() => deleteHistory.mutate(undefined, { onSuccess: historySheet.close })}
        onClose={historySheet.close}
      />
      <DeleteAccountSheet
        visible={accountSheet.visible}
        loading={deleteAccount.isPending}
        onConfirm={(confirmation) =>
          deleteAccount.mutate(confirmation, { onSuccess: accountSheet.close })
        }
        onClose={accountSheet.close}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  assuranceText: { flex: 1 },
  body: { paddingHorizontal: 4, marginBottom: 10 },
  note: { marginTop: 8, paddingHorizontal: 4 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  tile: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { flex: 1, minWidth: 0 },
  exportBody: { marginTop: 4 },
  exportStatus: { marginTop: 10 },
  exportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  auditSkeleton: { paddingVertical: 12, gap: 6 },
  compliance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 22,
  },
  complianceText: { flex: 1 },
});
