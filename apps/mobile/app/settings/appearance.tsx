import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { darkColors, lightColors } from '@da/design-tokens';
import { THEME_PREFERENCES, type ThemePreference } from '@da/domain';
import { Icon, ListGroupTitle, Pressable, Text, useTheme, useThemeContext } from '@da/ui';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { SettingsSkeleton } from '@/features/settings/SettingsSkeleton';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { usePreferences } from '@/features/settings/usePreferences';

interface ThemeTileProps {
  preference: ThemePreference;
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

/** Mini preview drawn with the real surface tokens of each scheme (design 7.8 theme tiles). */
function ThemeTile({ preference, label, selected, onPress, testID }: ThemeTileProps) {
  const theme = useTheme();
  const c = theme.colors;
  const halves = preference === 'system' ? [lightColors, darkColors] : [];
  const single = preference === 'light' ? lightColors : preference === 'dark' ? darkColors : null;

  const preview = (colors: typeof lightColors, key: string) => (
    <View key={key} style={[styles.previewHalf, { backgroundColor: colors.background }]}>
      <View style={[styles.previewTitle, { backgroundColor: colors.ink }]} />
      <View style={[styles.previewCard, { backgroundColor: colors.surface }]} />
      <View style={[styles.previewCardSmall, { backgroundColor: colors.surface }]} />
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      pressScale={0.98}
      style={styles.tileWrap}
      testID={testID}
    >
      <View
        style={[
          styles.tile,
          {
            borderColor: selected ? c.focusRing : c.hairline,
            borderRadius: theme.radius.lg,
            backgroundColor: c.surface2,
          },
        ]}
      >
        {single ? preview(single, 'single') : halves.map((h, i) => preview(h, String(i)))}
      </View>
      <Text
        variant={selected ? 'chip' : 'small'}
        tone={selected ? 'ink' : 'secondary'}
        align="center"
        style={styles.tileLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Theme (system / light / dark) applied instantly through the session store → ThemeProvider. */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { scheme } = useThemeContext();
  const { preferences, isLoading, update } = usePreferences();
  const current = preferences?.theme ?? 'system';

  return (
    <SettingsScreen title={t('settings.appearance')} testID="appearance-screen">
      {!preferences && isLoading ? (
        <SettingsSkeleton rows={3} testID="appearance-loading" />
      ) : (
        <>
          <View>
            <ListGroupTitle label={t('settings.appearanceScreen.theme')} />
            <View style={styles.tiles} accessibilityRole="radiogroup">
              {THEME_PREFERENCES.map((preference) => (
                <ThemeTile
                  key={preference}
                  preference={preference}
                  label={t(`settings.appearanceScreen.${preference}`)}
                  selected={current === preference}
                  onPress={() => void update({ theme: preference })}
                  testID={`appearance-${preference}`}
                />
              ))}
            </View>
            <View style={styles.current} testID={`theme-${scheme}`}>
              <Icon
                name={scheme === 'dark' ? 'bedtime' : 'today'}
                size={16}
                color={theme.colors.inkTertiary}
              />
              <Text variant="caption" tone="tertiary">
                {t('settings.appearanceScreen.current', {
                  mode: t(`settings.appearanceScreen.${scheme}`),
                })}
              </Text>
            </View>
          </View>

          <SettingsSection title={t('settings.appearanceScreen.accessibility')}>
            <ToggleRow
              icon="sync"
              title={t('settings.appearanceScreen.reducedMotion')}
              meta={t('settings.appearanceScreen.reducedMotionNote')}
              value={preferences?.reducedMotion ?? false}
              onValueChange={(reducedMotion) => void update({ reducedMotion })}
              disabled={!preferences}
              testID="appearance-reduced-motion"
            />
            <ToggleRow
              icon="waveform"
              title={t('settings.appearanceScreen.haptics')}
              meta={t('settings.appearanceScreen.hapticsNote')}
              value={preferences?.hapticsEnabled ?? true}
              onValueChange={(hapticsEnabled) => void update({ hapticsEnabled })}
              disabled={!preferences}
              testID="appearance-haptics"
            />
          </SettingsSection>
        </>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10 },
  tileWrap: { flex: 1 },
  tile: {
    height: 120,
    borderWidth: 2,
    padding: 8,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 6,
  },
  previewHalf: { flex: 1, borderRadius: 8, padding: 8, gap: 6 },
  previewTitle: { height: 8, width: '50%', borderRadius: 4 },
  previewCard: { height: 36, borderRadius: 8 },
  previewCardSmall: { height: 22, borderRadius: 8 },
  tileLabel: { marginTop: 8 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingLeft: 4 },
});
