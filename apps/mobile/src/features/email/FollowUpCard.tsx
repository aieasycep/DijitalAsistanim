import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FollowUp } from '@da/domain';
import { formatRelativeLabel, formatShortDate } from '@da/i18n';
import { Button, PersonCard, type PersonCardStatusTone } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';

export interface FollowUpCardProps {
  followUp: FollowUp;
  busy?: boolean;
  onDraft: (f: FollowUp) => void;
  onSnooze: (f: FollowUp) => void;
  onClose: (f: FollowUp) => void;
  onOpen: (f: FollowUp) => void;
}

export function daysWaiting(sentAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(sentAt)) / 86_400_000));
}

/** Wait-badge thresholds: 0–2 days neutral, 3–5 amber, ≥ 6 coral. */
export function waitTone(days: number): PersonCardStatusTone {
  if (days >= 6) return 'critical';
  if (days >= 3) return 'warning';
  return 'neutral';
}

export function FollowUpCard({
  followUp,
  busy = false,
  onDraft,
  onSnooze,
  onClose,
  onOpen,
}: FollowUpCardProps) {
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const days = daysWaiting(followUp.sentAt, ctx.now ?? new Date());
  const snoozed = followUp.status === 'snoozed' && followUp.snoozedUntil;
  return (
    <View style={styles.wrap} testID={`followup-${followUp.id}`}>
      <PersonCard
        name={followUp.counterpartName}
        topic={followUp.topic}
        timeLabel={formatShortDate(followUp.sentAt, ctx)}
        body={
          snoozed
            ? t('email.followUp.snoozedUntil', {
                date: formatRelativeLabel(followUp.snoozedUntil ?? followUp.sentAt, ctx),
              })
            : t('email.followUp.noReply')
        }
        statusLabel={t('email.followUp.waitingDays', { count: days })}
        statusTone={waitTone(days)}
        onPress={() => onOpen(followUp)}
        accessibilityLabel={`${followUp.counterpartName} · ${followUp.topic} · ${t('email.followUp.waitingDays', { count: days })}`}
      />
      <View style={styles.actions}>
        <Button
          label={t('email.followUp.draft')}
          variant="tonal"
          size="sm"
          icon="draft"
          disabled={busy}
          onPress={() => onDraft(followUp)}
          testID={`followup-draft-${followUp.id}`}
        />
        <Button
          label={t('email.followUp.snooze')}
          variant="ghostSecondary"
          size="sm"
          disabled={busy}
          onPress={() => onSnooze(followUp)}
          testID={`followup-snooze-${followUp.id}`}
        />
        <Button
          label={t('email.followUp.close')}
          variant="ghostSecondary"
          size="sm"
          loading={busy}
          onPress={() => onClose(followUp)}
          testID={`followup-close-${followUp.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
});
