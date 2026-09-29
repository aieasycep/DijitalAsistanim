import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, Text, useTheme } from '@da/ui';
import type { IconName } from '@da/design-tokens';
import { useUiStore } from '@/store/ui';

const TAB_ICONS: Record<string, IconName> = {
  today: 'today',
  flow: 'flow',
  plan: 'plan',
  assistant: 'ai',
};

/** Bottom navigation: Bugün · Akış · Plan · Asistan. Active = filled icon + indigo; passive = outline + tertiary. */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const miniPlayerVisible = useUiStore((s) => s.audio.visible);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 22);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.tabActive,
        tabBarInactiveTintColor: theme.colors.tabInactive,
        tabBarStyle: {
          position: 'absolute',
          height: 62 + bottomPad,
          paddingTop: 8,
          paddingBottom: bottomPad,
          backgroundColor: theme.colors.tabBarBackground,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.tabBarBorder,
          elevation: 0,
        },
        tabBarBackground: () => (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.tabBarBackground }]}
          />
        ),
        tabBarLabel: ({ focused, color }) => (
          <Text
            variant="tab"
            color={String(color)}
            style={{ marginTop: 3, fontWeight: focused ? '600' : '500' }}
          >
            {t(`tabs.${route.name}`)}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <Icon
            name={TAB_ICONS[route.name] ?? 'today'}
            size={26}
            color={String(color)}
            filled={focused}
          />
        ),
        tabBarAccessibilityLabel: t('a11y.tab', { label: t(`tabs.${route.name}`) }),
        sceneStyle: {
          backgroundColor: theme.colors.background,
          paddingBottom: miniPlayerVisible ? 60 : 0,
        },
        lazy: true,
      })}
    >
      <Tabs.Screen name="today" options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="flow" options={{ title: t('tabs.flow') }} />
      <Tabs.Screen name="plan" options={{ title: t('tabs.plan') }} />
      <Tabs.Screen name="assistant" options={{ title: t('tabs.assistant') }} />
    </Tabs>
  );
}
