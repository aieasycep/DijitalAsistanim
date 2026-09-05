import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, type IconName } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { haptic } from '../theme/haptics';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { exitEasing, standardEasing } from '../utils/motion';
import { sansWeight } from '../utils/typography';

const OPEN_MS = 300;
const CLOSE_MS = 240;
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 800;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 17/600 title ("Ne zaman hatırlatayım?") */
  title?: string;
  /** 12 secondary line under the title */
  subtitle?: string;
  children?: ReactNode;
  /** Pinned below the content (e.g. a full-width CTA). */
  footer?: ReactNode;
  closeLabel?: string;
  dismissOnScrim?: boolean;
  swipeToClose?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Modal bottom sheet: 35 % ink scrim, 24px top radius, 36×5 grabber, slides up 300 ms / down 240 ms.
 * Dismiss via scrim tap, hardware back or drag down (velocity snap). Reduced motion → instant.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeLabel = 'Kapat',
  dismissOnScrim = true,
  swipeToClose = true,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const theme = useTheme();
  const { reducedMotion, hapticsEnabled } = useThemeContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const ty = useSharedValue(windowHeight);

  // Mount the Modal first (next frame), then slide in from the mounted state.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  useEffect(() => {
    if (visible) void haptic('light', hapticsEnabled);
  }, [visible, hapticsEnabled]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      ty.set(reducedMotion ? 0 : withTiming(0, { duration: OPEN_MS, easing: standardEasing }));
      return;
    }
    const duration = reducedMotion ? 0 : CLOSE_MS;
    ty.set(withTiming(windowHeight, { duration, easing: exitEasing }));
    const timer = setTimeout(() => setMounted(false), duration + 30);
    return () => clearTimeout(timer);
  }, [mounted, visible, reducedMotion, windowHeight, ty]);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const pan = Gesture.Pan()
    .enabled(swipeToClose && !reducedMotion)
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      ty.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (ty.get() > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY) {
        ty.set(withTiming(windowHeight, { duration: CLOSE_MS, easing: exitEasing }));
        runOnJS(requestClose)();
      } else {
        ty.set(withSpring(0, { damping: 22, stiffness: 240 }));
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [0, windowHeight], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]}>
          <Pressable
            style={styles.flex}
            onPress={dismissOnScrim ? onClose : undefined}
            disabled={!dismissOnScrim}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            pressScale={1}
            ensureTouchTarget={false}
          />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              {
                backgroundColor: c.surfaceElevated,
                borderTopLeftRadius: theme.radius.modal,
                borderTopRightRadius: theme.radius.modal,
                paddingBottom: Math.max(insets.bottom, 10) + 10,
                maxHeight: windowHeight * 0.9,
                borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
                borderColor: theme.cardRing,
              },
              theme.shadows.s3,
              panelStyle,
            ]}
          >
            <View
              style={[
                styles.handle,
                {
                  width: theme.layout.sheetHandleWidth,
                  height: theme.layout.sheetHandleHeight,
                  backgroundColor: theme.isDark ? c.divider : palette.warm250,
                },
              ]}
            />
            {title ? (
              <Text variant="h3" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" tone="secondary" style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
            {children ? <View style={[styles.content, contentStyle]}>{children}</View> : null}
            {footer}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

export interface UseBottomSheetResult {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Local visibility state for a BottomSheet: `const sheet = useBottomSheet(); <BottomSheet visible={sheet.visible} onClose={sheet.close} />`. */
export function useBottomSheet(initialVisible = false): UseBottomSheetResult {
  const [visible, setVisible] = useState(initialVisible);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  return { visible, open, close, toggle };
}

export interface SheetRowProps {
  icon?: IconName;
  iconFilled?: boolean;
  /** primary = AI option (auto_awesome indigo) */
  iconTone?: 'secondary' | 'primary' | 'critical';
  label: string;
  /** Right value ("16:00", "Takvimine göre: 12:10") */
  value?: string | null;
  valueTone?: 'tertiary' | 'primary';
  onPress?: () => void;
  /** Hairline on top (ListGroup sets this automatically). */
  divider?: boolean;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Sheet option row — min 44 high, icon 18 + label 14/500 + right value 12, hairline on top. */
export function SheetRow({
  icon,
  iconFilled,
  iconTone = 'secondary',
  label,
  value,
  valueTone = 'tertiary',
  onPress,
  divider = false,
  selected = false,
  disabled = false,
  accessibilityLabel,
  testID,
}: SheetRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const iconColor =
    iconTone === 'primary' ? c.primary : iconTone === 'critical' ? c.criticalText : c.inkSecondary;
  const valueColor = valueTone === 'primary' ? c.primaryText : c.inkTertiary;
  const body = (
    <View
      style={[
        styles.row,
        {
          minHeight: theme.layout.touchTargetMin,
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderTopColor: c.hairline,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={18} color={iconColor} filled={iconFilled} />
        </View>
      ) : null}
      <Text
        variant="secondary"
        color={selected ? c.primaryText : c.ink}
        style={[sansWeight('500'), styles.rowLabel]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {value ? (
        <Text
          variant="caption"
          color={valueColor}
          style={valueTone === 'primary' ? sansWeight('600') : undefined}
          numberOfLines={1}
          tabular
        >
          {value}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label} · ${value}` : label)}
      pressScale={1}
      ensureTouchTarget={false}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  panel: { paddingTop: 10, paddingHorizontal: 20 },
  handle: { borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  subtitle: { marginTop: 2 },
  content: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { flex: 1, minWidth: 0 },
});
