import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatTime } from '@da/i18n';
import {
  Avatar,
  BottomSheet,
  Button,
  Icon,
  MetaChip,
  Pressable,
  ProGate,
  Screen,
  ScreenHeader,
  Text,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { PrepSections } from '@/features/meeting/PrepSections';
import { PrepSkeleton } from '@/features/meeting/PrepSkeleton';
import { TalkingPoints } from '@/features/meeting/TalkingPoints';
import { useMeetingPrep, useMinutesUntil } from '@/features/meeting/useMeetingPrep';
import { minutesBetween } from '@/features/plan/dates';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { detectMeetingProvider, openHandoff } from '@/services/handoff';

export default function MeetingPrepScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasFeature, gate, isLoading: entitlementLoading } = useEntitlement();
  const allowed = hasFeature('meeting_prep');
  const { prep, isLoading, isError, error, refetch, isRefetching, regenerate } = useMeetingPrep(
    id,
    allowed,
  );
  const minutes = useMinutesUntil(prep?.event.startAt);
  const summary = useBottomSheet(false);
  const gated = useRef(false);

  useEffect(() => {
    if (entitlementLoading || gated.current) return;
    gated.current = true;
    gate('meeting_prep', 'meeting_prep');
  }, [entitlementLoading, gate]);

  useEffect(() => {
    if (prep && minutes !== null) track('meeting_prep_opened', { minutesBefore: minutes });
    // Only once per prep load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prep?.eventId]);

  const countdown =
    minutes === null
      ? null
      : minutes <= 0
        ? t('meeting.started')
        : t('meeting.minutesLeft', { minutes });
  const countdownTone = minutes !== null && minutes <= 5 ? 'warning' : 'neutral';
  const event = prep?.event;
  const meetingProvider = event?.meetingUrl ? detectMeetingProvider(event.meetingUrl) : 'other';
  const joinLabel =
    meetingProvider === 'google_meet'
      ? t('meeting.openMeet')
      : meetingProvider === 'teams'
        ? t('meeting.openTeams')
        : t('meeting.join');

  const join = async () => {
    if (!event?.meetingUrl) return;
    const result = await openHandoff({ kind: 'meeting', url: event.meetingUrl });
    if (!result.ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  const directions = async () => {
    if (!event?.location) return;
    const result = await openHandoff({ kind: 'directions', location: event.location });
    if (!result.ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  return (
    <Screen
      scroll
      topGap={6}
      bottomInset={prep ? 96 : 0}
      testID="prep-screen"
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('meeting.prepTitle')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
          right={
            countdown ? (
              <MetaChip icon="schedule" label={countdown} tone={countdownTone} />
            ) : undefined
          }
        />
      }
      footer={
        prep ? (
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: theme.layout.screenPaddingH,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <Button
              label={t('meeting.twoMinute')}
              size="lg"
              style={styles.footerPrimary}
              onPress={summary.open}
              testID="prep-summary"
            />
            <Button
              label={t('meeting.takeNote')}
              icon="draft"
              variant="surface"
              size="lg"
              onPress={() =>
                router.push({ pathname: '/meeting/[id]/post', params: { id: prep.eventId } })
              }
              testID="prep-note"
            />
          </View>
        ) : null
      }
    >
      <OfflineNotice onRetry={() => void refetch()} retrying={isRefetching} />
      {!allowed ? (
        <ProGate
          isPro={false}
          kicker={t('meeting.prepTitle')}
          title={t('paywall.contextTitles.meeting_prep')}
          body={t('paywall.benefits.2')}
          badgeLabel={t('common.pro')}
          ctaLabel={t('paywall.ctaNoTrial')}
          dismissLabel={t('common.back')}
          onUpgrade={() => gate('meeting_prep', 'meeting_prep')}
          onDismiss={() => router.back()}
          testID="prep-gate"
        />
      ) : isLoading ? (
        <PrepSkeleton />
      ) : isError || !prep || !event ? (
        <QueryErrorState
          error={error ?? new Error(t('meeting.prepUnavailable'))}
          onRetry={() => void refetch()}
          testID="prep-error"
        />
      ) : (
        <View style={styles.stack}>
          <Pressable
            onPress={
              prep.primaryPerson
                ? () =>
                    router.push({
                      pathname: '/person/[id]',
                      params: { id: prep.primaryPerson?.id ?? '' },
                    })
                : undefined
            }
            disabled={!prep.primaryPerson}
            accessibilityRole="button"
            accessibilityLabel={prep.primaryPerson?.displayName ?? event.title}
            pressScale={0.99}
            style={styles.person}
            testID="prep-person"
          >
            <Avatar
              name={prep.primaryPerson?.displayName ?? event.title}
              imageUrl={prep.primaryPerson?.avatarUrl}
              size={56}
              vip={prep.primaryPerson?.isVip}
            />
            <View style={styles.personTexts}>
              <Text variant="h2" numberOfLines={1}>
                {prep.primaryPerson?.displayName ?? event.title}
              </Text>
              <Text variant="secondary" tone="secondary" numberOfLines={2}>
                {[
                  event.title,
                  formatTime(event.startAt, ctx),
                  formatDuration(minutesBetween(event.startAt, event.endAt), ctx.locale),
                  event.location ?? (event.meetingUrl ? t('plan.online') : null),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {prep.primaryPerson ? (
              <Icon name="forward" size={22} color={theme.colors.inkDisabled} />
            ) : null}
          </Pressable>
          {event.meetingUrl || event.location ? (
            <View style={styles.handoffRow}>
              {event.meetingUrl ? (
                <Button
                  label={joinLabel}
                  icon="video"
                  variant="tonal"
                  size="sm"
                  onPress={() => void join()}
                  testID="prep-join"
                />
              ) : null}
              {event.location && !event.meetingUrl ? (
                <Button
                  label={t('meeting.directions')}
                  icon="directions"
                  variant="tonal"
                  size="sm"
                  onPress={() => void directions()}
                  testID="prep-directions"
                />
              ) : null}
            </View>
          ) : null}
          {prep.talkingPoints.length > 0 ? <TalkingPoints points={prep.talkingPoints} /> : null}
          {prep.relevantEmails.length +
            prep.openLoops.length +
            prep.userCommitments.length +
            prep.theirCommitments.length +
            prep.relevantFiles.length ===
            0 && !prep.lastContact ? (
            <Text variant="secondary" tone="secondary" style={styles.empty} testID="prep-empty">
              {t('meeting.empty')}
            </Text>
          ) : null}
          <PrepSections prep={prep} />
          <Button
            label={t('briefing.regenerate')}
            icon="refresh"
            variant="ghostSecondary"
            size="sm"
            loading={regenerate.isPending}
            onPress={() =>
              regenerate.mutate(undefined, {
                onError: (e) =>
                  toast.show({
                    message: describeError(e, t).title,
                    icon: 'conflict',
                    iconTone: 'critical',
                  }),
              })
            }
            testID="prep-regenerate"
          />
        </View>
      )}
      <BottomSheet
        visible={summary.visible}
        onClose={summary.close}
        title={t('meeting.summaryTitle')}
        subtitle={
          prep
            ? `${prep.primaryPerson?.displayName ?? prep.event.title} · ${formatTime(prep.event.startAt, ctx)}`
            : undefined
        }
        closeLabel={t('common.close')}
        testID="prep-summary-sheet"
      >
        <ScrollView style={styles.summaryScroll} showsVerticalScrollIndicator={false}>
          <Text variant="editorial" testID="prep-summary-text">
            {prep?.twoMinuteSummary}
          </Text>
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  personTexts: { flex: 1, minWidth: 0, gap: 2 },
  handoffRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  empty: { paddingHorizontal: 4 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingBottom: 24 },
  footerPrimary: { flex: 1 },
  summaryScroll: { maxHeight: 420 },
});
