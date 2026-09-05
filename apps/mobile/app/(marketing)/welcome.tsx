import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { palette } from '@da/design-tokens';
import { Badge, Button, Card, Icon, Pressable, Text, useTheme, useThemeContext } from '@da/ui';
import { track } from '@/lib/analytics';

const PAGES = [0, 1, 2, 3] as const;
type PageIndex = (typeof PAGES)[number];

const SKELETON_WIDTHS = ['62%', '80%', '46%', '70%'] as const;

function BrandPage() {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  return (
    <LinearGradient
      colors={theme.gradients.dawn.stops}
      locations={theme.gradients.dawn.locations}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.page}
    >
      <View style={[styles.brandTile, { borderRadius: 30 }]}>
        <Icon name="ai" size={52} color={c.primary} filled />
      </View>
      <Text variant="kicker" color={c.onGradientMuted} style={styles.wordmark}>
        {t('app.name')}
      </Text>
      <Text
        variant="display"
        tone="onGradient"
        align="center"
        style={styles.gapLg}
        accessibilityRole="header"
      >
        {t('onboarding.welcome.title')}
      </Text>
      <Text
        variant="body"
        color={c.onGradientMuted}
        align="center"
        style={[styles.gapSm, styles.narrow]}
      >
        {t('app.tagline3')}
      </Text>
    </LinearGradient>
  );
}

function NoisePage() {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const rows = t('onboarding.value1.rows', { returnObjects: true });
  const rowTexts: string[] = Array.isArray(rows) ? rows.map(String) : [];
  const tones = ['urgent', 'deadline', 'follow_up'] as const;
  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <View style={styles.illustration}>
        <View
          style={styles.skeletonStack}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {SKELETON_WIDTHS.map((width, i) => (
            <View
              key={width}
              style={[
                styles.skeletonRow,
                {
                  backgroundColor: c.surface,
                  borderRadius: theme.radius.xs,
                  opacity: 0.55 - i * 0.08,
                },
              ]}
            >
              <View style={[styles.skeletonDot, { backgroundColor: c.hairline }]} />
              <View style={[styles.skeletonBar, { width, backgroundColor: c.divider }]} />
            </View>
          ))}
        </View>
        <View style={[styles.arrow, { backgroundColor: c.primary }]}>
          <Icon name="expandMore" size={18} color={c.onPrimary} />
        </View>
        <View style={styles.miniRows}>
          {rowTexts.map((row, i) => (
            <Card key={row} radius={theme.radius.sm} padding={{ vertical: 9, horizontal: 14 }}>
              <View style={styles.miniRow}>
                <Badge
                  label={t(`badges.${tones[i] ?? 'personal'}`)}
                  tone={i === 0 ? 'critical' : i === 1 ? 'deadline' : 'neutral'}
                />
                <Text variant="chip" numberOfLines={1} style={styles.miniText}>
                  {row}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>
      <Text variant="button" tone="primary" align="center">
        {t('onboarding.value1.eyebrow', {
          from: t('onboarding.value1.from', { count: 127 }),
          to: t('onboarding.value1.to', { count: 3 }),
        })}
      </Text>
      <Text variant="display" align="center" style={styles.gapSm} accessibilityRole="header">
        {t('onboarding.value1.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center" style={[styles.gapSm, styles.narrow]}>
        {t('onboarding.value1.body')}
      </Text>
    </View>
  );
}

function BriefingPage() {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.sampleCard,
          { borderRadius: theme.radius.hero, transform: [{ rotate: '-2deg' }] },
          theme.shadows.s3,
        ]}
      >
        <LinearGradient
          colors={theme.gradients.dawn.stops}
          locations={theme.gradients.dawn.locations}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sampleHeader}
        >
          <Text variant="kicker" color={c.onGradientMuted}>
            {t('briefing.morningKicker', { date: '08:00' })}
          </Text>
          <Text variant="h2" tone="onGradient" style={styles.gapXs}>
            {t('greeting.morningNoComma', { name: t('onboarding.welcome.sampleName') })}
          </Text>
          <Text variant="secondary" color={c.onGradientMuted} style={styles.gapXs}>
            {t('onboarding.value2.sampleMood')}
          </Text>
        </LinearGradient>
        <View
          style={[
            styles.sampleBody,
            { backgroundColor: c.background, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
          ]}
        >
          <Text variant="editorialSmall">{t('onboarding.value2.sampleNarrative')}</Text>
          <View
            style={[
              styles.sampleListen,
              { backgroundColor: c.inverseSurface, borderRadius: theme.radius.sm },
            ]}
          >
            <Icon name="listen" size={18} color={c.inkInverse} />
            <Text variant="chip" color={c.inkInverse}>
              {t('briefing.listenCta', { minutes: 2 })}
            </Text>
          </View>
        </View>
      </View>
      <Text variant="button" tone="primary" align="center" style={styles.gapLg}>
        {t('onboarding.value2.eyebrow', { time: '08:00' })}
      </Text>
      <Text variant="display" align="center" style={styles.gapSm} accessibilityRole="header">
        {t('onboarding.value2.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center" style={[styles.gapSm, styles.narrow]}>
        {t('onboarding.value2.body')}
      </Text>
    </View>
  );
}

function ControlPage() {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const pills: { label: string; bg: string; fg: string; flex?: boolean }[] = [
    { label: t('common.approve'), bg: c.primary, fg: c.onPrimary, flex: true },
    { label: t('common.edit'), bg: c.primarySoft, fg: c.primaryText },
    { label: t('common.reject'), bg: c.surface2, fg: c.inkSecondary },
  ];
  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <Card
        radius={theme.radius.xxl}
        style={[styles.approvalCard, { transform: [{ rotate: '1.5deg' }] }]}
      >
        <View style={styles.approvalHeader}>
          <View style={[styles.approvalTile, { backgroundColor: c.primarySoft }]}>
            <Icon name="send" size={17} color={c.primaryText} />
          </View>
          <Text variant="aiLabel" tone="secondary" style={styles.miniText} numberOfLines={1}>
            {t('onboarding.value3.sampleAction')}
          </Text>
          <Badge label={t('badges.waiting')} tone="waiting" />
        </View>
        <Text variant="h4" style={styles.gapSm}>
          {t('onboarding.value3.sampleTitle')}
        </Text>
        <View style={[styles.approvalGrid, styles.gapSm]}>
          <Text variant="caption" tone="tertiary" style={styles.gridLabel}>
            {t('approvals.why')}
          </Text>
          <Text variant="caption" style={styles.miniText}>
            {t('onboarding.value3.sampleWhy')}
          </Text>
        </View>
        <View style={styles.approvalGrid}>
          <Text variant="caption" tone="tertiary" style={styles.gridLabel}>
            {t('onboarding.value3.sampleChangeLabel')}
          </Text>
          <Text variant="caption" style={styles.miniText}>
            {t('onboarding.value3.sampleChange')}
          </Text>
        </View>
        <View
          style={[styles.approvalActions, styles.gapMd]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {pills.map((pill) => (
            <View
              key={pill.label}
              style={[
                styles.approvalPill,
                { backgroundColor: pill.bg, borderRadius: theme.radius.sm },
                pill.flex ? styles.flex : null,
              ]}
            >
              <Text variant="chip" color={pill.fg}>
                {pill.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <Text variant="button" tone="primary" align="center" style={styles.gapLg}>
        {t('onboarding.value3.eyebrow')}
      </Text>
      <Text variant="display" align="center" style={styles.gapSm} accessibilityRole="header">
        {t('onboarding.value3.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center" style={[styles.gapSm, styles.narrow]}>
        {t('onboarding.value3.body')}
      </Text>
    </View>
  );
}

/** 4-page value carousel: brand → noise → briefing → control. Every page can skip to account creation. */
export default function WelcomeScreen() {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<PageIndex>>(null);
  const [index, setIndex] = useState<PageIndex>(0);
  const c = theme.colors;
  const last = index === PAGES.length - 1;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(PAGES.length - 1, next)) as PageIndex;
      listRef.current?.scrollToOffset({ offset: clamped * width, animated: !reducedMotion });
      setIndex(clamped);
    },
    [reducedMotion, width],
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      setIndex(Math.max(0, Math.min(PAGES.length - 1, next)) as PageIndex);
    },
    [width],
  );

  const start = useCallback(() => {
    track('onboarding_started', { platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    router.push('/(auth)/sign-in');
  }, [router]);

  const signIn = useCallback(() => {
    router.push({ pathname: '/(auth)/sign-in', params: { mode: 'signin' } });
  }, [router]);

  const renderItem: ListRenderItem<PageIndex> = useCallback(
    ({ item }) => (
      <View
        style={{ width }}
        testID={`welcome-page-${item}`}
        accessibilityLabel={t('a11y.page', { current: item + 1, total: PAGES.length })}
      >
        {item === 0 ? (
          <BrandPage />
        ) : item === 1 ? (
          <NoisePage />
        ) : item === 2 ? (
          <BriefingPage />
        ) : (
          <ControlPage />
        )}
      </View>
    ),
    [width, t],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: index === 0 ? palette.dawn0 : c.background }]}
      testID="welcome-screen"
    >
      <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
        {!last ? (
          <Button
            label={t('onboarding.welcome.skip')}
            variant={index === 0 ? 'onGradient' : 'ghostSecondary'}
            size="ghost"
            onPress={start}
            testID="welcome-start"
          />
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>
      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(item) => String(item)}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={styles.flex}
      />
      <View
        style={[
          styles.bottom,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            backgroundColor: index === 0 ? palette.dawn0 : c.background,
          },
        ]}
      >
        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityLabel={t('a11y.page', { current: index + 1, total: PAGES.length })}
        >
          {PAGES.map((page) => (
            <Pressable
              key={page}
              onPress={() => goTo(page)}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.page', { current: page + 1, total: PAGES.length })}
              accessibilityState={{ selected: page === index }}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    page === index
                      ? index === 0
                        ? palette.white
                        : c.ink
                      : index === 0
                        ? 'rgba(255,255,255,0.4)'
                        : c.inkDisabled,
                },
              ]}
            />
          ))}
        </View>
        {last ? (
          <Button
            label={t('onboarding.value3.cta')}
            variant="primary"
            size="lg"
            fullWidth
            onPress={start}
            testID="welcome-start"
          />
        ) : (
          <Button
            label={index === 0 ? t('onboarding.welcome.cta') : t('common.next')}
            variant={index === 0 ? 'onGradient' : 'dark'}
            size="lg"
            fullWidth
            onPress={() => goTo(index + 1)}
            testID="welcome-next"
          />
        )}
        <Button
          label={t('onboarding.welcome.signIn')}
          variant={index === 0 ? 'onGradient' : 'ghost'}
          size="ghost"
          onPress={signIn}
          style={[styles.signIn, index === 0 ? styles.transparent : null]}
          testID="welcome-signin"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    minHeight: 36,
  },
  topSpacer: { height: 36 },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  brandTile: {
    width: 96,
    height: 96,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  wordmark: { letterSpacing: 1.5, opacity: 0.85 },
  gapXs: { marginTop: 4 },
  gapSm: { marginTop: 8 },
  gapMd: { marginTop: 12 },
  gapLg: { marginTop: 24 },
  narrow: { maxWidth: 300 },
  illustration: { width: '100%', maxWidth: 320, marginBottom: 28 },
  skeletonStack: { gap: 6, paddingHorizontal: 12 },
  skeletonRow: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  skeletonDot: { width: 16, height: 16, borderRadius: 8 },
  skeletonBar: { height: 8, borderRadius: 4 },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 10,
  },
  miniRows: { gap: 8 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniText: { flex: 1, minWidth: 0 },
  sampleCard: { width: '100%', maxWidth: 320, overflow: 'hidden' },
  sampleHeader: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 },
  sampleBody: { marginTop: -18, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  sampleListen: {
    marginTop: 12,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  approvalCard: { width: '100%', maxWidth: 320 },
  approvalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approvalTile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalGrid: { flexDirection: 'row', gap: 10, marginTop: 4 },
  gridLabel: { width: 56 },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approvalPill: {
    height: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { paddingHorizontal: 28, paddingTop: 12, gap: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  signIn: { alignSelf: 'center' },
  transparent: { backgroundColor: 'transparent' },
});
