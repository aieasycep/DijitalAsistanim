import { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ConnectedAccount } from '@da/domain';
import {
  Button,
  ConfirmModal,
  EmptyState,
  Icon,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { AccountCard } from '@/features/integrations/AccountCard';
import { AddAccountSheet, type AddAccountChoice } from '@/features/integrations/AddAccountSheet';
import { isDeviceAccount, isOAuthAccount } from '@/features/integrations/scopes';
import { useIntegrations } from '@/features/integrations/useIntegrations';
import {
  isDeviceCalendarAccount,
  useDeviceCalendar,
} from '@/features/onboarding/useDeviceCalendar';
import { useOAuthConnect } from '@/features/onboarding/useOAuthConnect';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isDemoMode } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

const DEVICE_PROVIDER_KEY = Platform.OS === 'ios' ? 'apple_calendar' : 'device_calendar';

/** Bağlantılar — connected accounts with status, scopes, reconnect / write access / sync / remove. */
export default function IntegrationsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const { query, accounts, busy, reconnect, grantWrite, disconnect, syncNow, setPrimary, refetch } =
    useIntegrations();
  const { isPro, gate } = useEntitlement();
  const { connect, connecting } = useOAuthConnect();
  const device = useDeviceCalendar();
  const addSheet = useBottomSheet();
  const [removing, setRemoving] = useState<ConnectedAccount | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const c = theme.colors;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const hasEmail = useMemo(
    () => accounts.some((a) => isOAuthAccount(a) && a.kinds.includes('email')),
    [accounts],
  );
  const hasDevice = useMemo(() => accounts.some(isDeviceCalendarAccount), [accounts]);
  const gatedByPlan = hasEmail && !isPro;

  const onAdd = useCallback(() => {
    if (hasEmail && !gate('multiple_accounts', 'integrations')) return;
    addSheet.open();
  }, [hasEmail, gate, addSheet]);

  const showError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  const deniedToast = useCallback(
    () =>
      toast.show({
        message: t('settings.integrationsScreen.deviceDenied'),
        icon: 'warning',
        iconTone: 'critical',
        actionLabel: t('settings.integrationsScreen.openSettings'),
        onAction: () => void device.openSettings(),
      }),
    [toast, t, device],
  );

  /** Device calendar: register in demo mode, otherwise ask the OS permission then register + upload. */
  const connectDevice = useCallback(async () => {
    setDeviceBusy(true);
    try {
      if (isDemoMode) {
        await device.registerDemo();
        return;
      }
      const result = await device.request();
      if (result.outcome === 'denied') deniedToast();
      else if (result.outcome === 'granted')
        toast.show({
          message: t('settings.integrationsScreen.deviceSynced', { count: result.uploaded }),
          icon: 'check',
        });
    } catch (e) {
      showError(e);
    } finally {
      setDeviceBusy(false);
    }
  }, [device, deniedToast, toast, t, showError]);

  const syncDevice = useCallback(
    async (account: ConnectedAccount) => {
      setDeviceBusy(true);
      try {
        if (isDemoMode) {
          await syncNow.mutateAsync(account);
          return;
        }
        const permission = await device.check();
        const result =
          permission === 'granted' ? await device.registerAndSync() : await device.request();
        if (result.outcome === 'denied') deniedToast();
        else if (result.outcome === 'granted')
          toast.show({
            message: t('settings.integrationsScreen.deviceSynced', { count: result.uploaded }),
            icon: 'check',
          });
      } catch (e) {
        showError(e);
      } finally {
        setDeviceBusy(false);
      }
    },
    [device, deniedToast, syncNow, toast, t, showError],
  );

  const onPick = useCallback(
    async (choice: AddAccountChoice) => {
      addSheet.close();
      if (choice === 'device') {
        await connectDevice();
        return;
      }
      await connect(choice);
    },
    [addSheet, connect, connectDevice],
  );

  const confirmRemove = useCallback(() => {
    if (!removing) return;
    const target = removing;
    disconnect.mutate(target, { onSettled: () => setRemoving(null) });
  }, [removing, disconnect]);

  const locked = offline || connecting !== null || deviceBusy;

  return (
    <Screen
      scroll
      topGap={6}
      testID="integrations-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.integrationsScreen.title')}
          subtitle={t('settings.integrationsScreen.subtitle')}
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
          {gatedByPlan ? (
            <View style={styles.proRow}>
              <Icon name="lock" size={16} color={c.inkTertiary} />
              <Text variant="caption" tone="tertiary" style={styles.proText}>
                {t('settings.integrationsScreen.proNeeded')}
              </Text>
            </View>
          ) : null}
          <Button
            label={t('settings.integrationsScreen.add')}
            size="lg"
            fullWidth
            icon={gatedByPlan ? 'crown' : 'add'}
            disabled={offline || query.isLoading}
            loading={connecting !== null || deviceBusy}
            onPress={onAdd}
            testID="integrations-add"
          />
        </View>
      }
    >
      <OfflineNotice onRetry={() => void refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={2} testID="integrations-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="link"
          title={t('settings.integrationsScreen.empty')}
          body={t('settings.integrationsScreen.emptyBody')}
          actionLabel={t('settings.integrationsScreen.add')}
          onAction={onAdd}
          testID="integrations-empty"
        />
      ) : (
        <View>
          <ListGroupTitle
            label={t('settings.integrationsScreen.countKicker', { count: accounts.length })}
          />
          <View style={[styles.cards, { gap: theme.layout.cardGap }]}>
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                busy={busy}
                locked={locked}
                onReconnect={(a) => reconnect.mutate(a)}
                onGrantWrite={(a) => grantWrite.mutate(a)}
                onSync={(a) => (isDeviceAccount(a) ? void syncDevice(a) : syncNow.mutate(a))}
                onMakePrimary={(a) => setPrimary.mutate(a)}
                onRemove={setRemoving}
              />
            ))}
          </View>
        </View>
      )}

      {!query.isLoading && !query.isError && !hasDevice ? (
        <View style={styles.device}>
          <ListGroupTitle label={t('settings.integrationsScreen.deviceCalendar')} />
          <ListGroup>
            <ListRow
              icon="event"
              title={t(`settings.integrationsScreen.providers.${DEVICE_PROVIDER_KEY}`)}
              meta={t(`onboarding.connect.providerMeta.${DEVICE_PROVIDER_KEY}`)}
              trailing={
                <Button
                  label={t('settings.integrationsScreen.deviceConnect')}
                  variant="tonal"
                  size="sm"
                  loading={deviceBusy}
                  disabled={offline || connecting !== null}
                  onPress={() => void connectDevice()}
                  testID="integrations-device-connect"
                />
              }
            />
          </ListGroup>
        </View>
      ) : null}

      <AddAccountSheet
        visible={addSheet.visible}
        connecting={connecting ?? (deviceBusy ? 'device' : null)}
        hasDeviceCalendar={hasDevice}
        onClose={addSheet.close}
        onPick={(choice) => void onPick(choice)}
      />
      <ConfirmModal
        visible={removing !== null}
        icon="linkOff"
        title={
          removing
            ? t('settings.integrationsScreen.disconnectTitle', {
                name: removing.email ?? removing.displayName,
              })
            : ''
        }
        body={t('settings.integrationsScreen.disconnectBody')}
        confirmLabel={t('settings.integrationsScreen.remove')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={disconnect.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
        testID="integration-remove-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cards: {},
  device: { marginTop: 22 },
  footer: { paddingTop: 10, paddingBottom: 12, gap: 8 },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  proText: { flex: 1 },
});
