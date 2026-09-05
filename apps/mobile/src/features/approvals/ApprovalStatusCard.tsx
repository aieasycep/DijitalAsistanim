/**
 * Execution states of an approval: executing (spinner), executed (check + time), failed (reason + retry /
 * reconnect / grant), expired, rejected. Rendered under the card once the user has decided.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApprovalAction } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import { Button, Card, Icon, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { failureReasonCopy, isDevicePending } from './approvalMeta';

export interface ApprovalStatusCardProps {
  approval: ApprovalAction;
  /** The phone is writing the event right now (device-executed calendar approvals). */
  deviceBusy?: boolean;
  retrying?: boolean;
  onRetry: () => void;
  onReconnect?: () => void;
  onGrant?: () => void;
}

export function ApprovalStatusCard({
  approval,
  deviceBusy = false,
  retrying = false,
  onRetry,
  onReconnect,
  onGrant,
}: ApprovalStatusCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const ctx = useFormatCtx();
  const status = approval.status;
  const busy = deviceBusy || status === 'executing' || status === 'approved';

  let icon: React.ReactNode;
  let title: string;
  let body: string | null = null;
  let tone: 'success' | 'critical' | 'secondary' = 'secondary';

  if (busy) {
    icon = <ActivityIndicator size="small" color={c.primary} />;
    title = t('approvals.executing');
    body =
      deviceBusy || isDevicePending(approval)
        ? t('approvals.deviceExecuting')
        : t('approvals.executingBody');
  } else if (status === 'executed') {
    icon = <Icon name="complete" size={22} color={c.successText} filled />;
    title = t('approvals.executed');
    tone = 'success';
    body = approval.executedAt
      ? t('approvals.executedAt', { time: formatRelativeLabel(approval.executedAt, ctx) })
      : null;
  } else if (status === 'failed') {
    icon = <Icon name="conflict" size={22} color={c.criticalText} />;
    title = t('approvals.failed');
    tone = 'critical';
    body = failureReasonCopy(approval.failureReason, t);
  } else if (status === 'expired') {
    icon = <Icon name="timer" size={22} color={c.inkSecondary} />;
    title = t('approvals.expired');
    body = t('approvals.expiredBody');
  } else {
    icon = <Icon name="learning" size={22} color={c.inkSecondary} />;
    title = t('approvals.rejected');
    body = t('approvals.rejectedBody');
  }

  const reconnectable = status === 'failed' && approval.failureReason === 'connection_expired';
  const needsScope = status === 'failed' && approval.failureReason === 'scope_required';

  return (
    <Card
      padding={16}
      style={styles.card}
      testID="approval-status"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: c.surface2 }]}>{icon}</View>
        <View style={styles.texts}>
          <Text variant="h4" tone={tone === 'secondary' ? 'ink' : tone}>
            {title}
          </Text>
          {body ? (
            <Text variant="small" tone="secondary" style={styles.body}>
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {status === 'failed' ? (
        <View style={styles.actions}>
          {reconnectable && onReconnect ? (
            <Button
              label={t('approvals.scopeSheet.reconnectCta')}
              size="sm"
              icon="sync"
              onPress={onReconnect}
              disabled={retrying}
              testID="approval-reconnect"
            />
          ) : null}
          {needsScope && onGrant ? (
            <Button
              label={t('approvals.scopeSheet.cta')}
              size="sm"
              icon="key"
              onPress={onGrant}
              disabled={retrying}
              testID="approval-grant"
            />
          ) : null}
          <Button
            label={t('approvals.retry')}
            variant={reconnectable || needsScope ? 'tonal' : 'primary'}
            size="sm"
            icon="refresh"
            loading={retrying}
            onPress={onRetry}
            testID="approval-retry"
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  body: { marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
});
