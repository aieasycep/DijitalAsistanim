/**
 * One connected account on the Integrations screen: provider tile, identity, status badge, primary marker,
 * granted scopes in plain words ("Okuma · Gönderme (onaylı)"), last sync, and the real actions —
 * Bağlantıyı Yenile, Yazma izni ver, Şimdi eşitle, Birincil yap, Kaldır.
 */
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ConnectedAccount } from '@da/domain';
import { formatRelativeLabel, formatTime } from '@da/i18n';
import { Badge, Button, Card, Icon, MetaChip, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import type { IntegrationBusy } from './useIntegrations';
import {
  grantedWriteGroups,
  isDeviceAccount,
  isOAuthAccount,
  needsReconnect,
  nextWriteGroup,
  providerCardKeyFor,
  statusTone,
} from './scopes';

export interface AccountCardProps {
  account: ConnectedAccount;
  busy: IntegrationBusy | null;
  /** Another action is running on a different account: lock this card too. */
  locked?: boolean;
  onReconnect: (account: ConnectedAccount) => void;
  onGrantWrite: (account: ConnectedAccount) => void;
  onSync: (account: ConnectedAccount) => void;
  onMakePrimary: (account: ConnectedAccount) => void;
  onRemove: (account: ConnectedAccount) => void;
}

export function AccountCard({
  account,
  busy,
  locked = false,
  onReconnect,
  onGrantWrite,
  onSync,
  onMakePrimary,
  onRemove,
}: AccountCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const c = theme.colors;
  const cardKey = providerCardKeyFor(account);
  const tile = (() => {
    switch (cardKey) {
      case 'gmail':
        return { bg: c.criticalSoft, fg: c.criticalText };
      case 'outlook':
      case 'microsoft_calendar':
        return { bg: c.infoSoft, fg: c.infoText };
      case 'google_calendar':
        return { bg: c.successSoft, fg: c.successText };
      default:
        return { bg: c.surface2, fg: c.inkSecondary };
    }
  })();
  const isMine = (action: IntegrationBusy['action']) =>
    busy?.id === account.id && busy.action === action;
  const disabled = locked || (busy !== null && busy.id !== account.id);
  const oauth = isOAuthAccount(account);
  const attention = needsReconnect(account);
  const missingWrite = nextWriteGroup(account);
  const scopes = [
    t('settings.integrationsScreen.scopes.read'),
    ...grantedWriteGroups(account).map((g) => t(`settings.integrationsScreen.scopes.${g}`)),
  ].join(' · ');
  const kinds = account.kinds
    .filter((k) => k === 'email' || k === 'calendar' || k === 'tasks')
    .map((k) => t(`settings.integrationsScreen.kinds.${k}`))
    .join(' · ');
  const lastSync = account.lastSyncAt
    ? t('settings.integrationsScreen.lastSync', {
        time: `${formatRelativeLabel(account.lastSyncAt, ctx)} ${formatTime(account.lastSyncAt, ctx)}`,
      })
    : t('settings.integrationsScreen.neverSynced');

  return (
    <Card
      testID={`integration-${account.id}`}
      accessibilityLabel={`${account.displayName}, ${t(`settings.integrationsScreen.status.${account.status}`)}`}
    >
      <View style={styles.header}>
        <View style={[styles.tile, { backgroundColor: tile.bg, borderRadius: theme.radius.sm }]}>
          <Icon
            name={account.kinds.includes('email') ? 'mail' : 'event'}
            size={20}
            color={tile.fg}
          />
        </View>
        <View style={styles.texts}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {account.email ?? account.displayName}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {`${t(`settings.integrationsScreen.providers.${cardKey}`)} · ${kinds}`}
          </Text>
        </View>
        <Badge
          label={t(`settings.integrationsScreen.status.${account.status}`)}
          tone={statusTone(account.status)}
        />
      </View>

      <View style={styles.chips}>
        {account.isPrimary ? (
          <MetaChip label={t('settings.integrationsScreen.primary')} icon="check" tone="primary" />
        ) : null}
        {isDeviceAccount(account) ? null : (
          <Text variant="caption" tone="secondary" style={styles.scopes} numberOfLines={2}>
            {scopes}
          </Text>
        )}
      </View>

      <Text
        variant="caption"
        tone={attention ? 'warning' : 'tertiary'}
        style={styles.meta}
        numberOfLines={2}
      >
        {attention ? t('settings.integrationsScreen.needsAttention') : lastSync}
      </Text>

      <View style={styles.actions}>
        {oauth ? (
          <Button
            label={t('settings.integrationsScreen.reconnect')}
            variant={attention ? 'primary' : 'surface'}
            size="sm"
            icon="refresh"
            loading={isMine('reconnect')}
            disabled={disabled}
            onPress={() => onReconnect(account)}
            testID={`integration-reconnect-${account.id}`}
          />
        ) : null}
        {oauth && missingWrite ? (
          <Button
            label={t('settings.integrationsScreen.grantWrite')}
            variant="tonal"
            size="sm"
            icon="key"
            loading={isMine('grant')}
            disabled={disabled}
            accessibilityHint={t('settings.integrationsScreen.grantWriteMeta', {
              scope: t(`settings.integrationsScreen.scopes.${missingWrite}`),
            })}
            onPress={() => onGrantWrite(account)}
            testID={`integration-grant-${account.id}`}
          />
        ) : null}
        <Button
          label={t('settings.integrationsScreen.syncNow')}
          variant="surface"
          size="sm"
          icon="sync"
          loading={isMine('sync')}
          disabled={disabled || attention}
          onPress={() => onSync(account)}
          testID={`integration-sync-${account.id}`}
        />
        {!account.isPrimary && account.kinds.includes('email') ? (
          <Button
            label={t('settings.integrationsScreen.makePrimary')}
            variant="surface"
            size="sm"
            loading={isMine('primary')}
            disabled={disabled}
            onPress={() => onMakePrimary(account)}
            testID={`integration-primary-${account.id}`}
          />
        ) : null}
        <Button
          label={t('settings.integrationsScreen.remove')}
          variant="ghostSecondary"
          size="sm"
          icon="linkOff"
          loading={isMine('remove')}
          disabled={disabled}
          onPress={() => onRemove(account)}
          testID={`integration-remove-${account.id}`}
        />
      </View>
      {missingWrite && oauth ? (
        <Text variant="caption" tone="tertiary" style={styles.grantMeta}>
          {t('settings.integrationsScreen.grantWriteMeta', {
            scope: t(`settings.integrationsScreen.scopes.${missingWrite}`),
          })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  scopes: { flexShrink: 1 },
  meta: { marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  grantMeta: { marginTop: 8 },
});
