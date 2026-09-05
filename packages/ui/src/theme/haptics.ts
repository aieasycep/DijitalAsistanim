import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind =
  'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * Restrained haptics per the design's annotated moments. Silently no-ops on unsupported platforms
 * or when the user disabled haptics in Appearance settings.
 */
export async function haptic(kind: HapticKind, enabled = true): Promise<void> {
  if (!enabled || Platform.OS === 'web') return;
  try {
    switch (kind) {
      case 'selection':
        await Haptics.selectionAsync();
        return;
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
    }
  } catch {
    // haptics are best-effort
  }
}
