import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Text } from './Text';

export interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: 28 | 40 | 56 | 72;
  /** ink background (header avatar) vs tinted initials */
  variant?: 'ink' | 'tinted';
  vip?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/** Deterministic tint: green or blue pair from the design (SK green, MY blue). */
function tintFor(name: string): 'green' | 'blue' {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 === 0 ? 'green' : 'blue';
}

export function Avatar({ name, imageUrl, size = 40, variant = 'tinted', vip = false, style }: AvatarProps) {
  const theme = useTheme();
  const c = theme.colors;
  const tint = tintFor(name);
  const bg = variant === 'ink' ? c.inverseSurface : tint === 'green' ? c.avatarGreenBg : c.avatarBlueBg;
  const fg = variant === 'ink' ? c.inkInverse : tint === 'green' ? c.avatarGreenFg : c.avatarBlueFg;
  const fontSize = size <= 28 ? 11 : size <= 40 ? 13 : size <= 56 ? 18 : 24;
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityRole="image" accessibilityLabel={name}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={120} />
        ) : (
          <Text variant="chip" color={fg} style={{ fontSize, lineHeight: fontSize + 4 }}>
            {initialsOf(name)}
          </Text>
        )}
      </View>
      {vip ? (
        <View style={[styles.vip, { backgroundColor: c.surface, borderColor: c.surface }]}>
          <Icon name="vip" size={size <= 28 ? 10 : 12} color={c.primary} filled />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vip: { position: 'absolute', right: -2, bottom: -2, borderRadius: 999, padding: 2, borderWidth: 1 },
});
