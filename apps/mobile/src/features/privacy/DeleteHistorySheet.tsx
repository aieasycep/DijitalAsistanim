/**
 * "Analiz geçmişi silinsin mi?" — the destructive sheet from design 7.4: coral icon tile, what is deleted
 * vs. what is kept, coral primary button with "Vazgeç" directly below at the same width.
 */
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RetentionOption } from '@da/domain';
import { BottomSheet, Button, Icon, Text, useTheme } from '@da/ui';

export interface DeleteHistorySheetProps {
  visible: boolean;
  retention: RetentionOption;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteHistorySheet({
  visible,
  retention,
  loading = false,
  onConfirm,
  onClose,
}: DeleteHistorySheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const cancel = loading ? () => undefined : onClose;
  return (
    <BottomSheet
      visible={visible}
      onClose={cancel}
      closeLabel={t('common.cancel')}
      dismissOnScrim={!loading}
      swipeToClose={!loading}
      testID="privacy-delete-history-sheet"
    >
      <View
        style={[styles.tile, { backgroundColor: c.criticalSoft, borderRadius: theme.radius.lg }]}
      >
        <Icon name="delete" size={26} color={c.criticalText} />
      </View>
      <Text variant="h2" style={styles.title} accessibilityRole="header">
        {t('settings.privacyScreen.deleteHistoryTitle')}
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        {t('settings.privacyScreen.deleteHistoryBody')}
      </Text>
      <View style={[styles.info, { backgroundColor: c.background, borderRadius: theme.radius.md }]}>
        <Text variant="small" tone="secondary">
          {t('settings.privacyScreen.retentionSaved', {
            option: t(`settings.privacyScreen.retentionOptions.${retention}`),
          })}
        </Text>
        <Text variant="small" tone="secondary">
          {t('settings.privacyScreen.deleteHistoryPreserved')}
        </Text>
      </View>
      <View style={styles.buttons}>
        <Button
          label={t('settings.privacyScreen.deleteHistoryCta')}
          variant="destructive"
          size="lg"
          fullWidth
          loading={loading}
          loadingLabel={t('common.deleting')}
          onPress={onConfirm}
          testID="privacy-delete-history-confirm"
        />
        <Button
          label={t('common.cancel')}
          variant="ghostSecondary"
          size="md"
          fullWidth
          disabled={loading}
          onPress={onClose}
          testID="privacy-delete-history-cancel"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tile: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 14 },
  body: { marginTop: 8 },
  info: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  buttons: { marginTop: 18, gap: 8 },
});
