import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { IconName } from '@da/design-tokens';
import type { Reminder, ReminderOption } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  BottomSheet,
  Button,
  ErrorState,
  Icon,
  ListGroup,
  SheetRow,
  Skeleton,
  Text,
  useTheme,
} from '@da/ui';
import { approvalIdempotencyKey, useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { DateTimePickerPanel, roundToInterval } from '@/features/reminders/DateTimePickerSheet';
import { useDataSource } from '@/hooks/useDataSource';
import { getPermissionStatus, type NotificationPermission } from '@/services/notifications';

type TargetType = NonNullable<Reminder['targetType']>;

const TARGET_TYPES: readonly TargetType[] = [
  'email_thread',
  'calendar_event',
  'task',
  'commitment',
  'life_event',
  'insight',
  'follow_up',
];

function isTargetType(value: string | undefined): value is TargetType {
  return value !== undefined && (TARGET_TYPES as readonly string[]).includes(value);
}

const OPTION_ICON: Record<ReminderOption, IconName> = {
  before_30m: 'schedule',
  before_1h: 'schedule',
  this_evening: 'bedtime',
  tomorrow_morning: 'today',
  smart: 'ai',
  custom: 'edit',
};

const MAX_TITLE = 200;
const CLOSE_MS = 260;
const HOUR_MS = 60 * 60_000;

/**
 * Smart reminder sheet (transparent modal route): six computed options + "Kendin seç"; confirming
 * creates a `reminder_create` approval and replaces this sheet with the approval card.
 */
export default function ReminderSheetScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const { requestApproval, isCreating } = useApprovalFlow();
  const params = useLocalSearchParams<{
    targetType?: string;
    targetId?: string;
    title?: string;
    dueAt?: string;
    sourceLabel?: string;
  }>();
  const targetId = params.targetId ?? '';
  const targetTypeParam = params.targetType;
  const target = useMemo(
    () =>
      isTargetType(targetTypeParam) && targetId ? { targetType: targetTypeParam, targetId } : null,
    [targetTypeParam, targetId],
  );
  const title = (params.title ?? '').trim().slice(0, MAX_TITLE);
  const dueAt = params.dueAt || null;

  const [visible, setVisible] = useState(true);
  const [selected, setSelected] = useState<ReminderOption | null>(null);
  /** "Kendin seç" result; `past` is evaluated when the time is confirmed. */
  const [custom, setCustom] = useState<{ at: string; past: boolean } | null>(null);
  /** Non-null while the inline picker is open. */
  const [picker, setPicker] = useState<{ draft: Date; min: Date } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    let active = true;
    void getPermissionStatus().then((p) => {
      if (active) setPermission(p);
    });
    return () => {
      active = false;
    };
  }, []);

  const query = useQuery({
    queryKey: qk.reminderSuggest(target?.targetType ?? 'unknown', targetId),
    queryFn: () => {
      if (!target) throw new Error('reminder target missing');
      return ds.reminders.suggestReminder({ ...target, dueAt });
    },
    enabled: target !== null,
  });

  // The smart option is pre-selected once suggestions arrive; the user's tap overrides it.
  const defaultOption: ReminderOption | null = query.data
    ? query.data.smart
      ? 'smart'
      : (query.data.options[0]?.option ?? null)
    : null;
  const active = selected ?? defaultOption;
  const options = query.data?.options ?? [];
  const chosen = options.find((o) => o.option === active);
  const chosenAt = active === 'custom' ? (custom?.at ?? null) : (chosen?.at ?? null);
  const reason =
    active === 'smart'
      ? (query.data?.smart?.reason ?? chosen?.reason ?? null)
      : (chosen?.reason ?? null);
  const customPast = active === 'custom' && Boolean(custom?.past);
  const picking = picker !== null;
  const canConfirm = target !== null && chosenAt !== null && !customPast && !isCreating;

  const close = () => {
    setVisible(false);
    setTimeout(() => router.back(), CLOSE_MS);
  };

  const confirm = async () => {
    if (!target || !chosenAt || !active) return;
    const timeLabel = formatRelativeLabel(chosenAt, ctx);
    const smartReason = active === 'smart' ? (reason ?? null) : null;
    const approval = await requestApproval(
      {
        type: 'reminder_create',
        what: t('approvals.types.reminder_create'),
        why: smartReason ?? t('reminder.whyDefault', { time: timeLabel }),
        changeSummary: [title, timeLabel].filter(Boolean),
        payload: {
          title,
          remindAt: chosenAt,
          option: active,
          targetType: target.targetType,
          targetId: target.targetId,
          smartReason,
        },
        requestedBy: 'reminder',
        idempotencyKey: approvalIdempotencyKey([
          'reminder',
          target.targetType,
          target.targetId,
          active,
          chosenAt,
        ]),
      },
      { navigate: false },
    );
    if (approval) router.replace({ pathname: '/approvals/[id]', params: { id: approval.id } });
  };

  const openPicker = () => {
    const now = Date.now();
    const base = custom
      ? new Date(custom.at)
      : roundToInterval(
          dueAt && Date.parse(dueAt) > now ? new Date(dueAt) : new Date(now + HOUR_MS),
        );
    setPicker({ draft: base, min: new Date(now) });
  };
  const confirmPicker = () => {
    if (!picker) return;
    setCustom({ at: picker.draft.toISOString(), past: picker.draft.getTime() <= Date.now() });
    setSelected('custom');
    setPicker(null);
  };

  const subtitle = [
    title,
    dueAt
      ? t('reminder.dueLabel', { time: formatRelativeLabel(dueAt, ctx) })
      : (params.sourceLabel ?? null),
  ]
    .filter(Boolean)
    .join(' · ');

  const footer = picking ? (
    <View style={styles.footer}>
      <Button
        label={t('common.ok')}
        size="md"
        fullWidth
        onPress={confirmPicker}
        testID="reminder-custom-done"
      />
      <Button
        label={t('common.back')}
        variant="ghostSecondary"
        size="sm"
        fullWidth
        onPress={() => setPicker(null)}
        testID="reminder-custom-back"
      />
    </View>
  ) : (
    <View style={styles.footer}>
      {customPast ? (
        <Text variant="caption" tone="critical" align="center">
          {t('reminder.pastTime')}
        </Text>
      ) : null}
      {permission === 'denied' ? (
        <Text variant="caption" tone="tertiary" align="center" testID="reminder-permission-hint">
          {t('reminder.permissionBody')}
        </Text>
      ) : null}
      <Button
        label={t('reminder.confirm')}
        size="md"
        fullWidth
        loading={isCreating}
        loadingLabel={t('common.preparing')}
        disabled={!canConfirm}
        onPress={() => void confirm()}
        testID="reminder-confirm"
      />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ contentStyle: { backgroundColor: 'transparent' } }} />
      <BottomSheet
        visible={visible}
        onClose={close}
        title={t('reminder.title')}
        subtitle={subtitle || undefined}
        closeLabel={t('common.close')}
        footer={footer}
        testID="reminder-sheet"
      >
        {picker ? (
          <View testID="reminder-custom-picker">
            <Text variant="chip" tone="secondary" style={styles.pickerTitle}>
              {t('reminder.customPick')}
            </Text>
            <DateTimePickerPanel
              value={picker.draft}
              minimumDate={picker.min}
              onChange={(draft) => setPicker({ draft, min: picker.min })}
              testID="reminder-custom-picker-input"
            />
          </View>
        ) : query.isLoading ? (
          <View style={styles.skeletons} testID="reminder-loading">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={16} width={i % 2 ? '60%' : '80%'} />
            ))}
          </View>
        ) : query.isError || !target ? (
          <ErrorState
            message={t('reminder.loadFailed')}
            retryLabel={t('common.retry')}
            onRetry={target ? () => void query.refetch() : undefined}
            testID="reminder-error"
          />
        ) : (
          <>
            <ListGroup padding={{ vertical: 0, horizontal: 0 }} style={styles.group}>
              {options.map((o) => {
                const isSmart = o.option === 'smart';
                const isCustom = o.option === 'custom';
                const value = isCustom
                  ? custom
                    ? formatRelativeLabel(custom.at, ctx)
                    : null
                  : isSmart
                    ? t('reminder.aiMeta', { time: formatRelativeLabel(o.at, ctx) })
                    : formatRelativeLabel(o.at, ctx);
                return (
                  <SheetRow
                    key={o.option}
                    icon={OPTION_ICON[o.option]}
                    iconFilled={isSmart}
                    iconTone={isSmart ? 'primary' : 'secondary'}
                    label={t(`reminder.options.${o.option}`)}
                    value={value}
                    valueTone={active === o.option ? 'primary' : 'tertiary'}
                    selected={active === o.option}
                    disabled={isCreating}
                    onPress={() => (isCustom ? openPicker() : setSelected(o.option))}
                    testID={`reminder-option-${o.option}`}
                  />
                );
              })}
            </ListGroup>
            {reason ? (
              <View style={styles.reason}>
                <Icon name="ai" size={16} color={c.primary} filled />
                <Text
                  variant="small"
                  tone="secondary"
                  style={styles.reasonText}
                  testID="reminder-reason"
                >
                  {reason}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  group: { shadowOpacity: 0, elevation: 0 },
  skeletons: { gap: 14, paddingVertical: 8 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 12,
  },
  reasonText: { flex: 1, minWidth: 0 },
  footer: { gap: 8, marginTop: 12 },
  pickerTitle: { marginBottom: 6, paddingHorizontal: 4 },
});
