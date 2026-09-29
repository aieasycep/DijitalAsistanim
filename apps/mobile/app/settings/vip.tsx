import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { VipPerson } from '@da/domain';
import {
  Avatar,
  Button,
  ConfirmModal,
  EmptyState,
  IconButton,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  Toggle,
  useBottomSheet,
  useTheme,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { AddVipSheet } from '@/features/vip/AddVipSheet';
import { useVips, type AddVipInput } from '@/features/vip/useVips';
import { useUiStore } from '@/store/ui';

/** Önemli Kişiler — the user-controlled VIP list; VIP is a sort boost, never a colour. */
export default function VipScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const offline = useUiStore((s) => s.offline);
  const { query, vips, busy, add, remove, setNotify, addFromContacts } = useVips();
  const sheet = useBottomSheet();
  const [removing, setRemoving] = useState<VipPerson | null>(null);
  const c = theme.colors;

  const onSubmit = useCallback(
    (input: AddVipInput) => add.mutate(input, { onSuccess: () => sheet.close() }),
    [add, sheet],
  );

  const onPickContacts = useCallback(async () => {
    const picked = await addFromContacts();
    if (picked) sheet.close();
  }, [addFromContacts, sheet]);

  const confirmRemove = useCallback(() => {
    if (!removing) return;
    const target = removing;
    remove.mutate(target, { onSettled: () => setRemoving(null) });
  }, [removing, remove]);

  const metaFor = (vip: VipPerson) =>
    [vip.relation, vip.email].filter((v): v is string => Boolean(v)).join(' · ') ||
    (vip.notifyAlways ? t('settings.vipScreen.notifyMeta') : t('settings.vipScreen.notifyOffMeta'));

  return (
    <Screen
      scroll
      topGap={6}
      testID="vip-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.vipScreen.title')}
          subtitle={t('settings.vipScreen.subtitle')}
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
            label={t('settings.vipScreen.add')}
            size="lg"
            fullWidth
            icon="add"
            disabled={offline || query.isLoading}
            onPress={sheet.open}
            testID="vip-add"
          />
        </View>
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="vip-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : vips.length === 0 ? (
        <EmptyState
          icon="vip"
          title={t('settings.vipScreen.empty')}
          body={t('settings.vipScreen.emptyBody')}
          actionLabel={t('settings.vipScreen.add')}
          onAction={sheet.open}
          testID="vip-empty"
        />
      ) : (
        <View>
          <ListGroupTitle
            label={t('settings.vipScreen.count', { count: vips.length })}
            meta={t('settings.vipScreen.notifyAlways')}
          />
          <ListGroup>
            {vips.map((vip) => {
              const rowBusy = busy?.id === vip.id;
              return (
                <ListRow
                  key={vip.id}
                  title={vip.displayName}
                  meta={metaFor(vip)}
                  leading={<Avatar name={vip.displayName} size={40} vip />}
                  onPress={
                    vip.contactId
                      ? () =>
                          router.push({ pathname: '/person/[id]', params: { id: vip.contactId } })
                      : undefined
                  }
                  accessibilityHint={vip.contactId ? t('person.lastContact') : undefined}
                  testID={`vip-row-${vip.id}`}
                  trailing={
                    <View style={styles.trailing}>
                      <Toggle
                        value={vip.notifyAlways}
                        onValueChange={(next) => setNotify.mutate({ vip, notifyAlways: next })}
                        disabled={rowBusy || offline}
                        accessibilityLabel={t('settings.vipScreen.notifyToggle', {
                          name: vip.displayName,
                        })}
                        testID={`vip-notify-${vip.id}`}
                      />
                      <IconButton
                        icon="close"
                        variant="plain"
                        size={36}
                        iconSize={18}
                        color={c.inkTertiary}
                        disabled={rowBusy || offline}
                        accessibilityLabel={`${t('settings.vipScreen.remove')} · ${vip.displayName}`}
                        onPress={() => setRemoving(vip)}
                        testID={`vip-remove-${vip.id}`}
                      />
                    </View>
                  }
                />
              );
            })}
          </ListGroup>
          <Text variant="caption" tone="tertiary" style={styles.note}>
            {t('settings.vipScreen.notifyMeta')}
          </Text>
        </View>
      )}

      <AddVipSheet
        visible={sheet.visible}
        saving={add.isPending}
        onClose={sheet.close}
        onPickContacts={() => void onPickContacts()}
        onSubmit={onSubmit}
      />
      <ConfirmModal
        visible={removing !== null}
        icon="vip"
        title={removing ? t('settings.vipScreen.removeTitle', { name: removing.displayName }) : ''}
        body={t('settings.vipScreen.removeBody')}
        confirmLabel={t('settings.vipScreen.remove')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
        testID="vip-remove-modal"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { marginTop: 10, paddingHorizontal: 4 },
  footer: { paddingTop: 10, paddingBottom: 12 },
});
