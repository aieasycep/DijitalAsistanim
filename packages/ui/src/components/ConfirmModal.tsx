import { Modal, StyleSheet, View } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

export interface ConfirmModalProps {
  visible: boolean;
  /** 48×48 tile icon (defaults: delete for destructive, info otherwise). */
  icon?: IconName;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Coral confirm button + critical icon tile — only for irreversible actions. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  testID?: string;
  /** testIDs for the confirm / cancel buttons (Maestro taps them by id). */
  confirmTestID?: string;
  cancelTestID?: string;
}

/** Centred modal (24 radius, 22 padding): icon tile · title 18/600 · body 13 · stacked confirm 44 + ghost 40. */
export function ConfirmModal({
  visible,
  icon,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  destructive = false,
  onConfirm,
  onCancel,
  loading = false,
  testID,
  confirmTestID,
  cancelTestID,
}: ConfirmModalProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const c = theme.colors;
  const tileBg = destructive ? c.criticalSoft : c.primarySoft;
  const tileFg = destructive ? c.criticalText : c.primaryText;
  const cancel = loading ? undefined : onCancel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={cancel}
      testID={testID}
    >
      <View style={[styles.root, { backgroundColor: c.scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={cancel}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          pressScale={1}
          ensureTouchTarget={false}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: c.surfaceElevated,
              borderRadius: theme.radius.modal,
              borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
              borderColor: theme.cardRing,
            },
            theme.shadows.s3,
          ]}
        >
          <View style={[styles.tile, { backgroundColor: tileBg, borderRadius: theme.radius.lg }]}>
            <Icon name={icon ?? (destructive ? 'delete' : 'info')} size={24} color={tileFg} />
          </View>
          <Text variant="h2s" align="center" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {body ? (
            <Text variant="small" tone="secondary" align="center" style={styles.body}>
              {body}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              size="sm"
              fullWidth
              loading={loading}
              onPress={onConfirm}
              style={styles.confirm}
              testID={confirmTestID}
            />
            <Button
              label={cancelLabel}
              variant="ghostSecondary"
              size="sm"
              fullWidth
              disabled={loading}
              onPress={onCancel}
              testID={cancelTestID}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 320, padding: 22, alignItems: 'center' },
  tile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 12 },
  body: { marginTop: 6, lineHeight: 19 },
  buttons: { marginTop: 14, gap: 6, alignSelf: 'stretch' },
  confirm: { height: 44, borderRadius: 14 },
});
