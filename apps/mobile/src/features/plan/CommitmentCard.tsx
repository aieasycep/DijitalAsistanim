import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Commitment } from '@da/domain';
import { formatRelativeLabel, isToday } from '@da/i18n';
import { Badge, Button, Card, SourceLine, Text } from '@da/ui';
import type { BadgeTone } from '@da/design-tokens';
import { useFormatCtx } from '../flow/useFormatCtx';

export interface CommitmentCardProps {
  commitment: Commitment;
  busy?: boolean;
  onDone: (c: Commitment) => void;
  onPostpone: (c: Commitment) => void;
  onSource: (c: Commitment) => void;
  onConfirm: (c: Commitment, accept: boolean) => void;
}

export function commitmentStatus(
  c: Commitment,
  now: Date,
): { key: 'proposed' | 'overdue' | 'today' | 'open' | 'completed' | 'postponed'; tone: BadgeTone } {
  if (c.status === 'proposed') return { key: 'proposed', tone: 'neutral' };
  if (c.status === 'completed') return { key: 'completed', tone: 'approved' };
  if (c.status === 'postponed' && c.postponedUntil && Date.parse(c.postponedUntil) > now.getTime())
    return { key: 'postponed', tone: 'neutral' };
  if (c.dueAt && Date.parse(c.dueAt) < now.getTime()) return { key: 'overdue', tone: 'critical' };
  return { key: 'open', tone: 'neutral' };
}

/** card/commitment — status badge · date · Lora quote · Taahhüt / Kime / Kaynak · actions. */
export function CommitmentCard({
  commitment,
  busy = false,
  onDone,
  onPostpone,
  onSource,
  onConfirm,
}: CommitmentCardProps) {
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const now = ctx.now ?? new Date();
  const status = commitmentStatus(commitment, now);
  const dueToday = commitment.dueAt ? isToday(commitment.dueAt, ctx) : false;
  const badgeLabel =
    status.key === 'open' && dueToday
      ? t('commitments.statuses.today')
      : t(`commitments.statuses.${status.key}`);
  const badgeTone: BadgeTone = status.key === 'open' && dueToday ? 'deadline' : status.tone;
  const dateLabel =
    commitment.dueText ?? (commitment.dueAt ? formatRelativeLabel(commitment.dueAt, ctx) : null);
  const done = commitment.status === 'completed';

  return (
    <Card
      testID={`commitment-${commitment.id}`}
      accessibilityLabel={`${badgeLabel} · ${commitment.text}`}
    >
      <View style={styles.header}>
        <Badge label={badgeLabel} tone={badgeTone} />
        {dateLabel ? (
          <Text variant="caption" tone="tertiary">
            {dateLabel}
          </Text>
        ) : null}
      </View>
      {commitment.quote ? (
        <Text variant="editorialSmall" style={styles.quote}>
          {t('commitments.quote', { quote: commitment.quote })}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <MetaRow label={t('commitments.commitment')} value={commitment.text} strong />
        {commitment.counterpartName ? (
          <MetaRow
            label={
              commitment.direction === 'user_owes' ? t('commitments.toWhom') : t('commitments.from')
            }
            value={commitment.counterpartName}
          />
        ) : null}
      </View>
      <SourceLine
        source={commitment.source}
        timeLabel={formatRelativeLabel(commitment.source.timestamp, ctx)}
        onPress={() => onSource(commitment)}
        style={styles.source}
      />
      <View style={styles.actions}>
        {commitment.status === 'proposed' ? (
          <>
            <Button
              label={t('commitments.confirmYes')}
              size="sm"
              icon="check"
              loading={busy}
              onPress={() => onConfirm(commitment, true)}
              testID={`commitment-confirm-${commitment.id}`}
            />
            <Button
              label={t('commitments.confirmNo')}
              variant="ghostSecondary"
              size="sm"
              disabled={busy}
              onPress={() => onConfirm(commitment, false)}
              testID={`commitment-reject-${commitment.id}`}
            />
          </>
        ) : !done ? (
          <>
            <Button
              label={t('common.done')}
              variant="tonal"
              size="sm"
              icon="check"
              loading={busy}
              onPress={() => onDone(commitment)}
              testID={`commitment-done-${commitment.id}`}
            />
            <Button
              label={t('common.postpone')}
              variant="ghostSecondary"
              size="sm"
              disabled={busy}
              onPress={() => onPostpone(commitment)}
              testID={`commitment-postpone-${commitment.id}`}
            />
          </>
        ) : null}
        <View style={styles.spacer} />
        <Button
          label={t('common.openSource')}
          variant="ghostSecondary"
          size="ghost"
          onPress={() => onSource(commitment)}
          testID={`commitment-source-${commitment.id}`}
        />
      </View>
    </Card>
  );
}

function MetaRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text variant="small" tone="tertiary" style={styles.metaLabel}>
        {label}
      </Text>
      <Text variant={strong ? 'bodyMedium' : 'small'} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  quote: { marginTop: 10, fontStyle: 'italic' },
  meta: { marginTop: 10, gap: 4 },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  metaLabel: { width: 56 },
  metaValue: { flex: 1 },
  source: { marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  spacer: { flex: 1 },
});
