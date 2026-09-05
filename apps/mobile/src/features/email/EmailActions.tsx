import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@da/ui';

export interface EmailActionsProps {
  onReply: () => void;
  onTask: () => void;
  onCalendar: () => void;
  onRemind: () => void;
  onOpen: () => void;
  busy?: boolean;
  disabled?: boolean;
}

/** 2×2 action grid + open-in-provider: Yanıt Hazırla · Görev Oluştur · Takvime Ekle · Hatırlat · Orijinal Maili Aç. */
export function EmailActions({
  onReply,
  onTask,
  onCalendar,
  onRemind,
  onOpen,
  busy = false,
  disabled = false,
}: EmailActionsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.grid} testID="email-actions">
      <View style={styles.row}>
        <Button
          label={t('email.actions.draftReply')}
          icon="draft"
          size="md"
          style={styles.cell}
          disabled={disabled}
          onPress={onReply}
          testID="email-action-reply"
        />
        <Button
          label={t('email.actions.createTask')}
          icon="taskAdd"
          variant="surface"
          size="md"
          style={styles.cell}
          disabled={disabled}
          loading={busy}
          onPress={onTask}
          testID="email-action-task"
        />
      </View>
      <View style={styles.row}>
        <Button
          label={t('email.actions.addToCalendar')}
          icon="event"
          variant="surface"
          size="md"
          style={styles.cell}
          disabled={disabled}
          onPress={onCalendar}
          testID="email-action-calendar"
        />
        <Button
          label={t('email.actions.remind')}
          icon="reminder"
          variant="surface"
          size="md"
          style={styles.cell}
          disabled={disabled}
          onPress={onRemind}
          testID="email-action-remind"
        />
      </View>
      <Button
        label={t('email.actions.openOriginal')}
        icon="mail"
        variant="ghostSecondary"
        size="sm"
        fullWidth
        onPress={onOpen}
        testID="email-action-open"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
});
