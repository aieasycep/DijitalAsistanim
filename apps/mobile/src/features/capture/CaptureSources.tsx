import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { Icon, Pressable, Text, useTheme } from '@da/ui';
import type { CaptureSource } from './useCapture';

const SOURCES: { key: CaptureSource; icon: IconName; pro?: boolean }[] = [
  { key: 'camera', icon: 'camera' },
  { key: 'photo', icon: 'image' },
  { key: 'pdf', icon: 'pdf', pro: true },
  { key: 'file', icon: 'file', pro: true },
  { key: 'link', icon: 'link' },
  { key: 'text', icon: 'text' },
];

export interface CaptureSourcesProps {
  selected: CaptureSource | null;
  isPro: boolean;
  disabled?: boolean;
  onSelect: (source: CaptureSource) => void;
}

/** Source tiles: Kamera · Fotoğraf · PDF · Dosya · Bağlantı · Metin (PDF/Dosya carry a PRO mark for free users). */
export function CaptureSources({
  selected,
  isPro,
  disabled = false,
  onSelect,
}: CaptureSourcesProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.grid} testID="capture-sources">
      {SOURCES.map((source) => {
        const active = selected === source.key;
        return (
          <Pressable
            key={source.key}
            onPress={() => onSelect(source.key)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={t(`capture.sources.${source.key}`)}
            hapticOnPress="selection"
            style={[
              styles.tile,
              {
                backgroundColor: active ? c.primarySoft : c.surface,
                borderRadius: theme.radius.lg,
                borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
                borderColor: theme.cardRing,
                opacity: disabled ? 0.5 : 1,
              },
              !active && !theme.isDark ? theme.shadows.s1 : null,
            ]}
            testID={`capture-source-${source.key}`}
          >
            <Icon name={source.icon} size={22} color={active ? c.primaryText : c.primary} />
            <Text
              variant="caption"
              color={active ? c.primaryText : c.inkSecondary}
              numberOfLines={1}
            >
              {t(`capture.sources.${source.key}`)}
            </Text>
            {source.pro && !isPro ? (
              <Text variant="badge" tone="tertiary" style={styles.pro}>
                {t('common.pro')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31%',
    flexGrow: 1,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pro: { position: 'absolute', top: 6, right: 8 },
});
