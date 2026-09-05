import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { layout, motion, palette, shadows, type IconName } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { exitEasing, standardEasing } from '../utils/motion';
import { sansWeight } from '../utils/typography';

export type ToastIconTone = 'primary' | 'critical' | 'success';

export interface ToastOptions {
  message: string;
  /** check (done) · learning ("Öğrendim") · offline (wifi_off, critical tone)… */
  icon?: IconName;
  iconTone?: ToastIconTone;
  actionLabel?: string;
  onAction?: () => void;
  /** Visible time, default 2600 ms. */
  durationMs?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  durationMs: number;
}

export interface ToastContextValue {
  /** Enqueue a toast; returns its id. */
  show: (options: ToastOptions) => number;
  /** Dismiss the current toast (or a queued one by id). */
  hide: (id?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export interface ToastProviderProps {
  children?: ReactNode;
  /** Distance from the bottom edge — above the tab bar by default (84 + 20). */
  bottomOffset?: number;
  style?: StyleProp<ViewStyle>;
}

/** Ink pill toast system: queue, 16px slide-in, 2.6 s hold, screen-reader announcement. */
export function ToastProvider({
  children,
  bottomOffset = layout.tabBarHeight + 20,
  style,
}: ToastProviderProps) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [dismissId, setDismissId] = useState<number | null>(null);
  const currentRef = useRef<ToastItem | null>(null);
  const queue = useRef<ToastItem[]>([]);
  const seq = useRef(0);

  const present = useCallback((item: ToastItem | null) => {
    currentRef.current = item;
    setCurrent(item);
    setPendingCount(queue.current.length);
  }, []);

  const advance = useCallback(() => {
    present(queue.current.shift() ?? null);
  }, [present]);

  const show = useCallback(
    (options: ToastOptions) => {
      seq.current += 1;
      const item: ToastItem = { durationMs: motion.duration.toast, ...options, id: seq.current };
      if (currentRef.current) {
        queue.current.push(item);
        setPendingCount(queue.current.length);
      } else {
        present(item);
      }
      return item.id;
    },
    [present],
  );

  const hide = useCallback((id?: number) => {
    const active = currentRef.current;
    if (id === undefined || active?.id === id) {
      if (active) setDismissId(active.id);
      return;
    }
    queue.current = queue.current.filter((t) => t.id !== id);
    setPendingCount(queue.current.length);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom: bottomOffset }, style]}>
        {current ? (
          <ToastView
            key={current.id}
            item={current}
            pending={pendingCount > 0}
            dismissRequested={dismissId === current.id}
            onDone={advance}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

interface ToastViewProps {
  item: ToastItem;
  pending: boolean;
  dismissRequested: boolean;
  onDone: () => void;
}

function ToastView({ item, pending, dismissRequested, onDone }: ToastViewProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const c = theme.colors;
  const progress = useSharedValue(0);
  const shownAt = useRef(0);
  const finished = useRef(false);
  const exiting = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  const exit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    const duration = reducedMotion ? 120 : 320;
    progress.set(
      withTiming(0, { duration, easing: exitEasing }, (done) => {
        if (done) runOnJS(finish)();
      }),
    );
    setTimeout(finish, duration + 40);
  }, [finish, progress, reducedMotion]);

  useEffect(() => {
    shownAt.current = Date.now();
    progress.set(withTiming(1, { duration: reducedMotion ? 120 : 300, easing: standardEasing }));
    AccessibilityInfo.announceForAccessibility(item.message);
  }, [item.message, progress, reducedMotion]);

  useEffect(() => {
    // A newer toast is waiting: cut the hold short so it "replaces" the current one.
    const hold = pending ? Math.min(item.durationMs, 900) : item.durationMs;
    const remaining = Math.max(0, hold - (Date.now() - shownAt.current));
    const timer = setTimeout(exit, remaining);
    return () => clearTimeout(timer);
  }, [exit, item.durationMs, pending]);

  useEffect(() => {
    if (dismissRequested) exit();
  }, [dismissRequested, exit]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));
  const iconColor = {
    primary: c.primaryGlow,
    success: palette.green300,
    critical: palette.coral300,
  }[item.iconTone ?? 'primary'];
  const textColor = theme.isDark ? c.ink : c.inkInverse;

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.pill,
        {
          backgroundColor: theme.isDark ? c.surfaceElevated : c.inverseSurface,
          borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.cardRing,
        },
        theme.isDark ? null : styles.shadow,
        pillStyle,
      ]}
    >
      {item.icon ? <Icon name={item.icon} size={18} color={iconColor} /> : null}
      <Text
        variant="secondary"
        color={textColor}
        style={[sansWeight('500'), styles.message]}
        numberOfLines={2}
      >
        {item.message}
      </Text>
      {item.actionLabel ? (
        <Pressable
          onPress={() => {
            item.onAction?.();
            exit();
          }}
          accessibilityRole="button"
          accessibilityLabel={item.actionLabel}
          hitSlop={10}
          style={styles.action}
        >
          <Text variant="action" color={c.primaryGlow} numberOfLines={1}>
            {item.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 40 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 12,
    borderRadius: 999,
    maxWidth: '100%',
  },
  shadow: {
    shadowColor: shadows.s1.shadowColor,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 10,
  },
  message: { flexShrink: 1 },
  action: { marginLeft: 6, minHeight: 24, justifyContent: 'center' },
});
