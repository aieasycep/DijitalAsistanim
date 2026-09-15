import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ConnectedAccount, DataSourceControls } from '@da/domain';
import {
  EmptyState,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  Toggle,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import {
  CONTROL_GROUPS,
  controlGroupsFor,
  providerCardKeyFor,
} from '@/features/integrations/scopes';
import { useDataSourceControls } from '@/features/integrations/useDataSourceControls';
import { useUiStore } from '@/store/ui';

/** Veri Kaynağı Kontrolü — per-account read/analyse toggles; off means "never enters analysis". */
export default function DataSourcesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const offline = useUiStore((s) => s.offline);
  const { query, accounts, pending, setControl } = useDataSourceControls();

  const accountName = (account: ConnectedAccount) => account.email ?? account.displayName;

  const rowsFor = (account: ConnectedAccount, keys: readonly (keyof DataSourceControls)[]) =>
    keys.map((key) => (
      <ListRow
        key={key}
        title={t(`settings.dataSourceScreen.${key}`)}
        meta={t(`settings.dataSourceScreen.hints.${key}`)}
        trailing={
          <Toggle
            value={account.controls[key]}
            onValueChange={(next) => setControl(account.id, key, next)}
            disabled={offline || pending === `${account.id}:${key}`}
            accessibilityLabel={t('settings.dataSourceScreen.toggle', {
              account: accountName(account),
              control: t(`settings.dataSourceScreen.${key}`),
            })}
            testID={`dsc-${account.id}-${key}`}
          />
        }
      />
    ));

  return (
    <Screen
      scroll
      topGap={6}
      testID="data-sources-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('settings.dataSourceScreen.title')}
          subtitle={t('settings.dataSourceScreen.subtitle')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="data-sources-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="link"
          title={t('settings.dataSourceScreen.empty')}
          body={t('settings.dataSourceScreen.emptyBody')}
          actionLabel={t('settings.dataSourceScreen.goConnections')}
          onAction={() => router.push('/settings/integrations')}
          testID="data-sources-empty"
        />
      ) : (
        <View style={styles.accounts}>
          {accounts.map((account) => (
            <View key={account.id} style={styles.account} testID={`dsc-account-${account.id}`}>
              <Text variant="h3" numberOfLines={1} accessibilityRole="header">
                {accountName(account)}
              </Text>
              <Text variant="caption" tone="tertiary" style={styles.provider}>
                {t(`settings.integrationsScreen.providers.${providerCardKeyFor(account)}`)}
              </Text>
              {controlGroupsFor(account).map((group) => (
                <View key={group} style={styles.group}>
                  <ListGroupTitle label={t(`settings.dataSourceScreen.groups.${group}`)} />
                  <ListGroup>{rowsFor(account, CONTROL_GROUPS[group])}</ListGroup>
                  {group === 'mail' ? (
                    <Text variant="caption" tone="tertiary" style={styles.note}>
                      {t('settings.dataSourceScreen.attachmentsNote')}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  accounts: { gap: 28 },
  account: { gap: 0 },
  provider: { marginTop: 2 },
  group: { marginTop: 14 },
  note: { marginTop: 8, paddingHorizontal: 4 },
});
