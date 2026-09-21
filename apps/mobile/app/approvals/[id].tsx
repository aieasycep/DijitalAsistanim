import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ApprovalAction, DecideApprovalResponse, ReminderCreatePayload } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  Badge,
  Button,
  Card,
  Icon,
  Screen,
  ScreenHeader,
  SourceLine,
  Text,
  haptic,
  useTheme,
  useThemeContext,
  useToast,
} from '@da/ui';
import { ApprovalEditForm } from '@/features/approvals/ApprovalEditForm';
import { ApprovalStatusCard } from '@/features/approvals/ApprovalStatusCard';
import { useApprovalDraft } from '@/features/approvals/approvalDraft';
import {
  APPROVAL_ICON,
  badgeToneForType,
  describePayload,
  failureReasonCopy,
  isDevicePending,
} from '@/features/approvals/approvalMeta';
import { executeDeviceApproval } from '@/features/approvals/deviceExecution';
import { ScopeSheet, type ScopeGrantMode } from '@/features/approvals/ScopeSheet';
import { useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { resolveApprovalAccount, useScopeGrant } from '@/features/approvals/useScopeGrant';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useOpenSource } from '@/features/source/openSource';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

const EXECUTING_POLL_MS = 1500;

/** Approval card: Ne · Neden · Ne değişecek, Onayla / Düzenle / Reddet, then the execution state. */
export default function ApprovalScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const { hapticsEnabled } = useThemeContext();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const offline = useUiStore((s) => s.offline);
  const { id } = useLocalSearchParams<{ id: string }>();
  const approvalId = id ?? '';
  const { decide, retry, refreshPending } = useApprovalFlow();
  const { openSource } = useOpenSource();
  const scopeGrant = useScopeGrant();
  const [draft, setDraft] = useApprovalDraft(approvalId);
  const [editing, setEditing] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeGrantMode | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceRan = useRef<string | null>(null);

  const query = useQuery({
    queryKey: qk.approval(approvalId),
    queryFn: () => ds.approvals.getApproval(approvalId),
    enabled: Boolean(approvalId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'executing' || status === 'approved' ? EXECUTING_POLL_MS : false;
    },
  });
  const approval = query.data;
  const payload = (draft ?? approval?.payload ?? {}) as Record<string, unknown>;

  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
    enabled: scopeMode !== null,
    staleTime: 60_000,
  });
  const scopeAccount = approval ? resolveApprovalAccount(approval, accountsQuery.data ?? []) : null;

  const announceExecuted = useCallback(
    (a: ApprovalAction) => {
      void haptic('success', hapticsEnabled);
      if (a.type === 'reminder_create') {
        const remindAt = (a.payload as ReminderCreatePayload).remindAt;
        toast.show({
          message: t('reminder.set', { time: formatRelativeLabel(remindAt, ctx) }),
          icon: 'reminder',
          iconTone: 'success',
        });
        return;
      }
      toast.show({
        message: t('approvals.executedToast', { what: a.what }),
        icon: 'check',
        iconTone: 'success',
      });
    },
    [ctx, hapticsEnabled, t, toast],
  );

  const showError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [t, toast],
  );

  const handleResult = useCallback(
    (result: DecideApprovalResponse) => {
      const a = result.approval;
      if (result.requiredScope) {
        setScopeMode('scope');
        return;
      }
      if (a.status === 'executed') {
        announceExecuted(a);
        return;
      }
      if (a.status === 'failed') {
        void haptic('error', hapticsEnabled);
        if (a.failureReason === 'connection_expired') setScopeMode('reconnect');
        else if (a.failureReason === 'scope_required') setScopeMode('scope');
      }
      // executing → the query polls; a device-handled write is picked up by the effect below.
    },
    [announceExecuted, hapticsEnabled],
  );

  // Device-executed calendar approvals: write on the phone, then report the outcome.
  useEffect(() => {
    if (!approval) return;
    if (!isDevicePending(approval)) {
      if (!deviceBusy) deviceRan.current = null;
      return;
    }
    if (deviceRan.current === approval.id) return;
    deviceRan.current = approval.id;
    setDeviceBusy(true);
    void executeDeviceApproval(ds, approval)
      .then(async (result) => {
        await queryClient.invalidateQueries({ queryKey: qk.approval(approval.id) });
        await refreshPending();
        if (result.outcome === 'executed') announceExecuted(approval);
        else
          toast.show({
            message: failureReasonCopy(result.reason, t),
            icon: 'conflict',
            iconTone: 'critical',
          });
      })
      .finally(() => setDeviceBusy(false));
  }, [approval, deviceBusy, ds, queryClient, refreshPending, announceExecuted, toast, t]);

  const approve = useCallback(async () => {
    if (!approval) return;
    try {
      const result = await decide.mutateAsync({
        approvalId,
        decision: 'approve',
        editedPayload: draft ?? undefined,
      });
      if (draft && result.approval.status !== 'pending') setDraft(null);
      handleResult(result);
    } catch (e) {
      showError(e);
    }
  }, [approval, approvalId, decide, draft, handleResult, setDraft, showError]);

  const reject = useCallback(async () => {
    try {
      await decide.mutateAsync({ approvalId, decision: 'reject' });
      setDraft(null);
      void haptic('warning', hapticsEnabled);
      toast.show({ message: t('approvals.rejectedToast'), icon: 'learning' });
    } catch (e) {
      showError(e);
    }
  }, [approvalId, decide, hapticsEnabled, setDraft, showError, t, toast]);

  const retryNow = useCallback(async () => {
    try {
      handleResult(await retry.mutateAsync(approvalId));
    } catch (e) {
      showError(e);
    }
  }, [approvalId, handleResult, retry, showError]);

  /** After a scope grant: a still-pending approval is approved again, anything else is retried. */
  const runAgain = useCallback(async () => {
    const current = queryClient.getQueryData<ApprovalAction>(qk.approval(approvalId)) ?? approval;
    if (!current) return;
    if (current.status === 'pending') await approve();
    else await retryNow();
  }, [approval, approvalId, approve, queryClient, retryNow]);

  const grant = useCallback(async () => {
    if (!approval || !scopeMode) return;
    try {
      const outcome = await scopeGrant.grant(approval, scopeMode);
      if (outcome === 'granted') {
        setScopeMode(null);
        toast.show({
          message: t('approvals.scopeSheet.granted'),
          icon: 'check',
          iconTone: 'success',
        });
        await runAgain();
      } else if (outcome === 'no_account') {
        setScopeMode(null);
        toast.show({
          message: t('approvals.scopeSheet.noAccount'),
          icon: 'conflict',
          iconTone: 'critical',
        });
      } else {
        toast.show({ message: t('approvals.scopeSheet.cancelled'), icon: 'warning' });
      }
    } catch (e) {
      showError(e);
    }
  }, [approval, runAgain, scopeGrant, scopeMode, showError, t, toast]);

  const saveEdit = useCallback(
    (edited: Record<string, unknown>) => {
      setDraft(edited);
      setEditing(false);
      void haptic('success', hapticsEnabled);
      toast.show({ message: t('approvals.editSaved'), icon: 'edit' });
    },
    [hapticsEnabled, setDraft, t, toast],
  );

  const typeLabel = approval ? t(`approvals.types.${approval.type}`) : '';
  const edited = Boolean(draft) || Boolean(approval?.editedByUser);
  const lines = approval
    ? edited || approval.changeSummary.length === 0
      ? describePayload(approval.type, payload, ctx, t)
      : approval.changeSummary
    : [];
  const approving = decide.isPending && decide.variables?.decision === 'approve';
  const rejecting = decide.isPending && decide.variables?.decision === 'reject';
  const busy = decide.isPending || retry.isPending || deviceBusy || scopeGrant.busy;
  const showButtons = approval?.status === 'pending' && !editing;
  const showStatus = approval !== undefined && (approval.status !== 'pending' || deviceBusy);

  return (
    <Screen
      scroll
      topGap={6}
      testID="approval-screen"
      refreshing={query.isRefetching && !busy}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('approvals.title')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
          testID="approval-header"
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={1} testID="approval-loading" />
      ) : query.isError || !approval ? (
        <QueryErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          testID="approval-error"
        />
      ) : (
        <View style={styles.stack}>
          <Card padding={16} testID="approval-card">
            <View style={styles.headerRow}>
              <View style={[styles.tile, { backgroundColor: c.primarySoft }]}>
                <Icon name={APPROVAL_ICON[approval.type]} size={17} color={c.primaryText} />
              </View>
              <Badge label={typeLabel} tone={badgeToneForType(approval.type)} />
              <View style={styles.spacer} />
              <Text variant="caption" tone="tertiary" tabular>
                {formatRelativeLabel(approval.createdAt, ctx)}
              </Text>
            </View>

            <Text variant="chip" tone="tertiary" style={styles.label}>
              {t('approvals.what')}
            </Text>
            <Text variant="h3" accessibilityRole="header" testID="approval-what">
              {approval.what}
            </Text>

            <Text variant="chip" tone="tertiary" style={styles.label}>
              {t('approvals.why')}
            </Text>
            <Text variant="secondary" testID="approval-why">
              {approval.why}
            </Text>

            <Text variant="chip" tone="tertiary" style={styles.label}>
              {t('approvals.change')}
            </Text>
            {editing ? (
              <ApprovalEditForm
                type={approval.type}
                initial={payload}
                onSave={saveEdit}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <View style={styles.lines} testID="approval-change">
                {lines.map((line, i) => (
                  <View key={`${i}-${line}`} style={styles.lineRow}>
                    <View style={[styles.dot, { backgroundColor: c.primary }]} />
                    <Text variant="secondary" style={styles.lineText}>
                      {line}
                    </Text>
                  </View>
                ))}
                {edited ? (
                  <View style={styles.editedRow}>
                    <Icon name="edit" size={14} color={c.inkTertiary} />
                    <Text variant="caption" tone="tertiary" testID="approval-edited">
                      {t('approvals.edited')}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {approval.source ? (
              <SourceLine
                source={approval.source}
                timeLabel={formatRelativeLabel(approval.source.timestamp, ctx)}
                onPress={(source) => void openSource(source)}
                style={styles.source}
              />
            ) : null}

            {showButtons ? (
              <>
                {offline ? (
                  <Text variant="caption" tone="tertiary" style={styles.offlineHint}>
                    {t('approvals.offlineHint')}
                  </Text>
                ) : null}
                <View style={styles.buttons}>
                  <Button
                    label={t('approvals.approve')}
                    size="inline"
                    loading={approving}
                    disabled={offline || busy}
                    onPress={() => void approve()}
                    style={styles.approve}
                    testID="approval-approve"
                  />
                  <Button
                    label={t('approvals.edit')}
                    variant="tonal"
                    size="inline"
                    disabled={offline || busy}
                    onPress={() => setEditing(true)}
                    testID="approval-edit"
                  />
                  <Button
                    label={t('approvals.reject')}
                    variant="surface"
                    size="inline"
                    loading={rejecting}
                    disabled={offline || busy}
                    onPress={() => void reject()}
                    testID="approval-reject"
                  />
                </View>
              </>
            ) : null}
          </Card>

          {showStatus ? (
            <ApprovalStatusCard
              approval={approval}
              deviceBusy={deviceBusy}
              retrying={retry.isPending}
              onRetry={() => void retryNow()}
              onReconnect={() => setScopeMode('reconnect')}
              onGrant={() => setScopeMode('scope')}
            />
          ) : null}

          <View style={styles.trust}>
            <Icon name="assurance" size={18} color={c.successText} />
            <Text variant="small" tone="secondary" style={styles.trustText}>
              {t('approvals.trust')}
            </Text>
          </View>
        </View>
      )}
      <ScopeSheet
        visible={scopeMode !== null}
        mode={scopeMode ?? 'scope'}
        accountLabel={scopeAccount?.displayName ?? t('approvals.scopeSheet.accountFallback')}
        busy={scopeGrant.busy}
        onGrant={() => void grant()}
        onClose={() => setScopeMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  label: { marginTop: 14, marginBottom: 4 },
  lines: { gap: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  lineText: { flex: 1, minWidth: 0 },
  editedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  source: { marginTop: 12 },
  offlineHint: { marginTop: 12 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  approve: { flex: 1 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  trustText: { flex: 1, minWidth: 0 },
});
