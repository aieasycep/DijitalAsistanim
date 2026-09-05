import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { GradientName } from '@da/design-tokens';
import {
  BRIEFING_KINDS,
  type Briefing,
  type BriefingItem,
  type BriefingKind,
  type Feature,
  type UserPreferences,
} from '@da/domain';
import { formatDateRange, formatShortDate, formatTime, type FormatCtx } from '@da/i18n';
import {
  BottomSheet,
  Button,
  CardSkeleton,
  EmptyState,
  ErrorState,
  GradientHeader,
  IconButton,
  ProGate,
  Screen,
  ScreenHeader,
  SheetRow,
  Skeleton,
  Text,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { formatCtx } from '@/lib/i18n';
import { captureError } from '@/lib/monitoring';
import { useSessionStore, selectFirstName } from '@/store/session';
import { useOpenSource } from '@/features/source/openSource';
import { BriefingSections } from '@/features/briefing/BriefingSections';
import { BriefingShare, weeklyShareText } from '@/features/briefing/BriefingShare';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

const GRADIENT: Record<BriefingKind, GradientName> = {
  morning: 'dawn',
  midday: 'dawn',
  evening: 'dusk',
  weekly: 'night',
};
const FEATURE: Partial<Record<BriefingKind, { feature: Feature; context: string }>> = {
  midday: { feature: 'midday_pulse', context: 'midday' },
  evening: { feature: 'evening_close', context: 'evening' },
  weekly: { feature: 'weekly_insights', context: 'weekly' },
};

function isBriefingKind(value: string | undefined): value is BriefingKind {
  return Boolean(value) && (BRIEFING_KINDS as readonly string[]).includes(value as string);
}

function upper(value: string, locale: FormatCtx['locale']): string {
  return value.toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-GB');
}

/** Formatting context from the user's saved locale / timezone (device values otherwise). */
function ctxFromPreferences(preferences: UserPreferences | null): FormatCtx {
  return formatCtx({
    ...(preferences?.locale ? { locale: preferences.locale } : {}),
    ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
  });
}

/** Full-screen briefing: gradient header, Lora narrative, sections as list groups, listen / close-day / share. */
export default function BriefingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind: BriefingKind = isBriefingKind(params.kind) ? params.kind : 'morning';
  const id = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;
  const firstName = useSessionStore(selectFirstName);
  const preferences = useSessionStore((s) => s.preferences);
  const { isPro, isLoading: entitlementLoading, gate } = useEntitlement();
  const { openSource } = useOpenSource();
  const carrySheet = useBottomSheet();
  const [carryIds, setCarryIds] = useState<Set<string> | null>(null);
  const player = useAudioPlayer();
  const [sharing, setSharing] = useState(false);
  const openedRef = useRef<string | null>(null);
  const c = theme.colors;

  const ctx = ctxFromPreferences(preferences);

  const queryKey = id ? qk.briefingById(id) : kind === 'weekly' ? qk.weekly() : qk.briefing(kind);
  const query = useQuery({
    queryKey,
    queryFn: (): Promise<Briefing | null> =>
      id
        ? ds.briefings.getBriefingById(id)
        : kind === 'weekly'
          ? ds.briefings.getWeekly()
          : ds.briefings.getBriefing({ kind }),
  });
  const briefing = query.data ?? null;

  const regenerate = useMutation({
    mutationFn: () => ds.briefings.getBriefing({ kind, regenerate: true }),
    onSuccess: (fresh) => queryClient.setQueryData(queryKey, fresh),
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  useEffect(() => {
    if (!briefing || openedRef.current === briefing.id) return;
    openedRef.current = briefing.id;
    if (!briefing.openedAt) {
      ds.briefings
        .markOpened(briefing.id)
        .catch((e) => captureError(e, { where: 'briefing.markOpened' }));
      if (briefing.kind === 'morning')
        track('first_brief_opened', { itemCount: briefing.items.length });
    }
  }, [briefing, ds]);

  const closeDay = useMutation({
    mutationFn: (input: { briefingId: string; carryOverInsightIds: string[] }) =>
      ds.briefings.closeDay(input),
    onSuccess: async (closed) => {
      queryClient.setQueryData(queryKey, closed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['briefing'] }),
      ]);
      carrySheet.close();
      toast.show({
        message: t('briefing.readyForTomorrowDone', {
          time: preferences?.briefing.morningTime ?? '08:00',
        }),
        icon: 'bedtime',
        iconTone: 'success',
      });
      router.back();
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const carriedItems = (briefing?.items ?? []).filter(
    (i) => i.section === 'carried_over' && i.insightId,
  );
  const selectedCarry = carryIds ?? new Set(carriedItems.map((i) => i.insightId as string));

  const openCarrySheet = useCallback(() => {
    if (!briefing) return;
    if (carriedItems.length === 0) {
      closeDay.mutate({ briefingId: briefing.id, carryOverInsightIds: [] });
      return;
    }
    setCarryIds(new Set(carriedItems.map((i) => i.insightId as string)));
    carrySheet.open();
  }, [briefing, carriedItems, closeDay, carrySheet]);

  const toggleCarry = useCallback((insightId: string) => {
    setCarryIds((current) => {
      const next = new Set(current ?? []);
      if (next.has(insightId)) next.delete(insightId);
      else next.add(insightId);
      return next;
    });
  }, []);

  const loadAudio = player.load;
  const listen = useCallback(async () => {
    if (!briefing || player.loading) return;
    if (!gate('voice_briefing', 'voice')) return;
    const ok = await loadAudio(briefing.id, {
      title: t(`briefing.audio.${briefing.kind}Title`),
      autoplay: true,
    });
    if (!ok) {
      toast.show({
        message: t('briefing.audio.unavailable'),
        icon: 'warning',
        iconTone: 'critical',
      });
      return;
    }
    router.push({ pathname: '/briefing/audio', params: { id: briefing.id } });
  }, [briefing, player.loading, gate, loadAudio, t, router, toast]);

  const share = async (): Promise<void> => {
    if (!briefing?.weekly || sharing) return;
    setSharing(true);
    try {
      await Share.share({
        message: weeklyShareText(briefing.weekly, t, ctx),
        title: t('briefing.weeklyShareTitle'),
      });
    } catch (e) {
      captureError(e, { where: 'briefing.share' });
    } finally {
      setSharing(false);
    }
  };

  const onItemPress = useCallback(
    (item: BriefingItem) => {
      if (item.source) void openSource(item.source);
    },
    [openSource],
  );

  const gateSpec = FEATURE[kind];
  if (gateSpec && !isPro) {
    if (entitlementLoading) {
      return (
        <Screen
          topGap={6}
          header={
            <ScreenHeader variant="sub" onBack={() => router.back()} backLabel={t('common.back')} />
          }
          testID="briefing-screen"
        >
          <Skeleton width="60%" height={24} radius={8} />
          <CardSkeleton style={styles.gapTop} />
        </Screen>
      );
    }
    return (
      <Screen
        topGap={6}
        header={
          <ScreenHeader
            variant="sub"
            onBack={() => router.back()}
            backLabel={t('common.back')}
            kicker={upper(t(`briefing.audio.${kind}Title`), ctx.locale)}
          />
        }
        testID="briefing-screen"
      >
        <ProGate
          isPro={false}
          kicker={upper(t(`briefing.audio.${kind}Title`), ctx.locale)}
          title={t(`paywall.contextTitles.${gateSpec.context}`)}
          body={t(`briefing.proBody.${kind}`)}
          badgeLabel={t('badges.pro')}
          ctaLabel={t('briefing.upgrade')}
          onUpgrade={() => gate(gateSpec.feature, gateSpec.context)}
          dismissLabel={t('common.skip')}
          onDismiss={() => router.back()}
          style={styles.gapTop}
          testID="briefing-pro-gate"
        />
      </Screen>
    );
  }

  const kicker = (() => {
    switch (kind) {
      case 'morning':
        return t('briefing.morningKicker', {
          date: upper(formatShortDate(briefing?.forDate ?? new Date(), ctx), ctx.locale),
        });
      case 'midday':
        return t('briefing.middayKicker');
      case 'evening':
        return t('briefing.eveningKicker', {
          date: upper(formatShortDate(briefing?.forDate ?? new Date(), ctx), ctx.locale),
        });
      default:
        return t('briefing.weeklyKicker', {
          range: briefing?.weekly
            ? formatDateRange(briefing.weekly.weekStart, briefing.weekly.weekEnd, ctx)
            : '',
        });
    }
  })();
  const title =
    kind === 'morning'
      ? t('greeting.morningNoComma', { name: firstName }).trim()
      : kind === 'weekly'
        ? t('briefing.weeklyTitle')
        : (briefing?.headline ?? t('briefing.notReadyTitle'));
  const subtitle = briefing ? (kind === 'weekly' ? briefing.subline : briefing.mood) : null;
  const scheduledTime =
    kind === 'morning'
      ? preferences?.briefing.morningTime
      : kind === 'midday'
        ? preferences?.briefing.middayTime
        : kind === 'evening'
          ? preferences?.briefing.eveningTime
          : null;
  const readMinutes = briefing
    ? Math.max(1, Math.round((briefing.audio?.durationSec ?? briefing.estimatedReadSec) / 60))
    : 0;

  let footer: React.ReactNode = null;
  if (briefing) {
    if (kind === 'morning' || kind === 'midday') {
      footer =
        kind === 'morning' ? (
          <Button
            label={t('briefing.listenCta', { minutes: readMinutes })}
            icon="listen"
            variant="dark"
            size="lg"
            fullWidth
            loading={player.loading}
            loadingLabel={t('common.preparing')}
            onPress={() => void listen()}
            testID="briefing-listen"
          />
        ) : (
          <Button
            label={t('common.ok')}
            variant="dark"
            size="lg"
            fullWidth
            onPress={() => router.back()}
            testID="briefing-done"
          />
        );
    } else if (kind === 'evening') {
      footer = (
        <Button
          label={briefing.closedAt ? t('briefing.closed') : t('briefing.readyForTomorrow')}
          icon={briefing.closedAt ? 'check' : 'bedtime'}
          variant="dark"
          size="lg"
          fullWidth
          disabled={Boolean(briefing.closedAt)}
          loading={closeDay.isPending}
          onPress={openCarrySheet}
          testID="briefing-close-day"
        />
      );
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="briefing-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: (footer ? 96 : 24) + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <GradientHeader
            gradient={GRADIENT[kind]}
            kicker={kicker}
            title={title}
            subtitle={subtitle}
            contentStyle={[
              styles.sheet,
              { paddingHorizontal: theme.layout.screenPaddingH, gap: theme.layout.sectionGapLarge },
            ]}
          >
            {query.isPending ? (
              <View style={styles.loading}>
                <Skeleton width="100%" height={18} radius={6} />
                <Skeleton width="92%" height={18} radius={6} />
                <Skeleton width="70%" height={18} radius={6} />
                <CardSkeleton style={styles.gapTop} />
                <CardSkeleton />
              </View>
            ) : query.isError ? (
              <ErrorState
                variant="full"
                title={t('briefing.generateFailed')}
                message={describeError(query.error, t).title}
                retryLabel={t('common.retry')}
                onRetry={() => void query.refetch()}
                testID="briefing-error"
              />
            ) : !briefing ? (
              <EmptyState
                icon="ai"
                title={t('briefing.notReadyTitle')}
                body={
                  scheduledTime
                    ? t('briefing.notReadyBody', { time: scheduledTime })
                    : t('briefing.notReadyBodyGeneric')
                }
                actionLabel={kind !== 'weekly' ? t('briefing.regenerate') : undefined}
                onAction={kind !== 'weekly' ? () => regenerate.mutate() : undefined}
                secondaryLabel={t('common.back')}
                onSecondary={() => router.back()}
                testID="briefing-empty"
              />
            ) : (
              <>
                <Text variant="editorial">{briefing.narrative}</Text>
                {kind === 'midday' && !briefing.hasChanges ? (
                  <View
                    style={[
                      styles.calm,
                      { backgroundColor: c.successSoft, borderRadius: theme.radius.lg },
                    ]}
                    testID="briefing-no-changes"
                  >
                    <Text variant="bodyMedium" color={c.successText}>
                      {t('briefing.middayNoChange')}
                    </Text>
                  </View>
                ) : null}
                {kind === 'weekly' && briefing.weekly ? (
                  <BriefingShare
                    briefing={briefing}
                    weekly={briefing.weekly}
                    ctx={ctx}
                    onShare={() => void share()}
                    sharing={sharing}
                  />
                ) : null}
                <BriefingSections briefing={briefing} onItemPress={onItemPress} />
                <Text variant="caption" tone="tertiary" align="center">
                  {t('briefing.analyzedFooter', {
                    mails: briefing.counts.analyzedEmails,
                    calendars: briefing.counts.analyzedCalendars,
                    days: briefing.counts.analyzedDays,
                    time: formatTime(briefing.generatedAt, ctx),
                  })}
                </Text>
              </>
            )}
          </GradientHeader>
          <View
            style={[
              styles.topRow,
              {
                top: insets.top + 6,
                left: theme.layout.screenPaddingH,
                right: theme.layout.screenPaddingH,
              },
            ]}
            pointerEvents="box-none"
          >
            <IconButton
              icon="back"
              variant="onGradient"
              accessibilityLabel={t('a11y.back')}
              onPress={() => router.back()}
              testID="briefing-back"
            />
            {kind === 'weekly' && briefing?.weekly ? (
              <IconButton
                icon="share"
                variant="onGradient"
                accessibilityLabel={t('a11y.share')}
                onPress={() => void share()}
                testID="briefing-share"
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.layout.screenPaddingH,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              backgroundColor: c.background,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}

      <BottomSheet
        visible={carrySheet.visible}
        onClose={carrySheet.close}
        title={t('briefing.carryOverTitle')}
        subtitle={t('briefing.carryOverSelect')}
        closeLabel={t('common.close')}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label={`${t('briefing.carryOver')} · ${t('briefing.carryOverBody', { count: selectedCarry.size })}`}
              size="md"
              fullWidth
              loading={closeDay.isPending}
              onPress={() =>
                briefing &&
                closeDay.mutate({
                  briefingId: briefing.id,
                  carryOverInsightIds: [...selectedCarry],
                })
              }
              testID="briefing-carry-confirm"
            />
            <Button
              label={t('briefing.closeWithout')}
              variant="ghostSecondary"
              size="ghost"
              disabled={closeDay.isPending}
              onPress={() =>
                briefing && closeDay.mutate({ briefingId: briefing.id, carryOverInsightIds: [] })
              }
              style={styles.center}
              testID="briefing-carry-none"
            />
          </View>
        }
        testID="briefing-carry-sheet"
      >
        {carriedItems.map((item, index) => {
          const insightId = item.insightId as string;
          const selected = selectedCarry.has(insightId);
          return (
            <SheetRow
              key={item.id}
              icon={selected ? 'complete' : 'uncheck'}
              iconTone={selected ? 'primary' : 'secondary'}
              iconFilled={selected}
              label={item.title}
              value={item.meta}
              selected={selected}
              divider={index > 0}
              onPress={() => toggleCarry(insightId)}
              testID={`briefing-carry-${index}`}
            />
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { paddingBottom: 24 },
  loading: { gap: 10 },
  gapTop: { marginTop: 12 },
  calm: { padding: 14 },
  topRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10 },
  sheetFooter: { marginTop: 12, gap: 6 },
  center: { alignSelf: 'center' },
});
