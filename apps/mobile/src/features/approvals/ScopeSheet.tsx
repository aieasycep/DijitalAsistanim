/**
 * "Ek izin gerekli" — progressive OAuth: the action needs a write scope (or the connection expired).
 * The sheet explains which account, then hands off to the provider consent screen and retries.
 */
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Icon, Text, useTheme } from '@da/ui';

export type ScopeGrantMode = 'scope' | 'reconnect';

export interface ScopeSheetProps {
  visible: boolean;
  mode: ScopeGrantMode;
  accountLabel: string;
  busy: boolean;
  onGrant: () => void;
  onClose: () => void;
}

export function ScopeSheet({
  visible,
  mode,
  accountLabel,
  busy,
  onGrant,
  onClose,
}: ScopeSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reconnect = mode === 'reconnect';
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={reconnect ? t('approvals.scopeSheet.reconnectTitle') : t('approvals.scopeSheet.title')}
      closeLabel={t('common.close')}
      dismissOnScrim={!busy}
      footer={
        <View style={styles.footer}>
          <Button
            label={
              reconnect ? t('approvals.scopeSheet.reconnectCta') : t('approvals.scopeSheet.cta')
            }
            size="md"
            fullWidth
            icon={reconnect ? 'sync' : 'key'}
            loading={busy}
            onPress={onGrant}
            testID="approval-scope-grant"
          />
          <Button
            label={t('common.skip')}
            variant="ghostSecondary"
            size="sm"
            fullWidth
            disabled={busy}
            onPress={onClose}
            testID="approval-scope-later"
          />
        </View>
      }
      testID="approval-scope-sheet"
    >
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: theme.colors.primarySoft }]}>
          <Icon name="assurance" size={22} color={theme.colors.primaryText} />
        </View>
        <Text variant="secondary" tone="secondary" style={styles.body}>
          {reconnect
            ? t('approvals.scopeSheet.reconnectBody', { account: accountLabel })
            : t('approvals.scopeSheet.body', { account: accountLabel })}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  footer: { gap: 6, marginTop: 8 },
});
