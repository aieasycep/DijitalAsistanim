import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, ScreenHeader, useTheme } from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';

export interface SettingsScreenProps {
  title: string;
  subtitle?: string;
  kicker?: string;
  right?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  keyboardAvoiding?: boolean;
  testID?: string;
}

/** Stacked settings page: back circle header, offline notice, 18px section rhythm. */
export function SettingsScreen({
  title,
  subtitle,
  kicker,
  right,
  children,
  footer,
  onRefresh,
  refreshing = false,
  keyboardAvoiding = false,
  testID,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  };

  return (
    <Screen
      scroll
      topGap={6}
      keyboardAvoiding={keyboardAvoiding}
      refreshing={refreshing}
      onRefresh={onRefresh}
      header={
        <ScreenHeader
          variant="sub"
          title={title}
          subtitle={subtitle}
          kicker={kicker}
          right={right}
          onBack={goBack}
          backLabel={t('common.back')}
        />
      }
      footer={footer}
      contentContainerStyle={{ gap: theme.layout.sectionGap }}
      testID={testID}
    >
      <OfflineNotice onRetry={onRefresh} retrying={refreshing} />
      {children}
    </Screen>
  );
}

/** Sticky footer wrapper for a page CTA (matches the onboarding footers). */
export function SettingsFooter({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.footer,
        {
          paddingHorizontal: theme.layout.screenPaddingH,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: 10, paddingBottom: 12, gap: 8 },
});
