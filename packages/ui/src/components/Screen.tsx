import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

export type ScreenBackground = 'background' | 'surface' | 'paper';

export interface ScreenPaddingOptions {
  /** 20px horizontal screen padding (design: screen edge 20). Default true. */
  padded?: boolean;
  /** Extra bottom space reserved for the tab bar / mini player / sticky CTA. When > 0 the safe-area bottom is assumed to be handled by that bar. */
  bottomInset?: number;
  /** Apply the status-bar safe-area on top. Default true. */
  topInset?: boolean;
  /** Gap between the status bar and the first element (root tabs 16 · stacked screens 6). Default 16. */
  topGap?: number;
}

export interface ScreenProps extends ScreenPaddingOptions {
  children?: ReactNode;
  /** Wrap children in a ScrollView. Leave false when the child is a FlatList/FlashList — use `useScreenPadding` for its contentContainerStyle. */
  scroll?: boolean;
  scrollProps?: Omit<
    ScrollViewProps,
    'children' | 'refreshControl' | 'contentContainerStyle' | 'style'
  >;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  background?: ScreenBackground;
  /** Fixed element above the scroll area (already safe-area padded). */
  header?: ReactNode;
  /** Fixed element below the scroll area (sticky CTA, ask bar). */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Padding for a screen's content area — reuse for FlatList `contentContainerStyle`. */
export function useScreenPadding({
  padded = true,
  bottomInset = 0,
  topInset = true,
  topGap,
}: ScreenPaddingOptions = {}): ViewStyle {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const gap = topGap ?? theme.spacing.lg;
  const paddingBottom =
    bottomInset > 0 ? bottomInset + theme.spacing.xl : Math.max(insets.bottom, theme.spacing.xl);
  return {
    paddingHorizontal: padded ? theme.layout.screenPaddingH : 0,
    paddingTop: (topInset ? insets.top : 0) + gap,
    paddingBottom,
  };
}

/**
 * Safe-area aware page container: warm background token, optional scrolling with pull-to-refresh,
 * keyboard avoidance and reserved bottom space for the tab bar / mini player.
 */
export function Screen({
  children,
  scroll = false,
  scrollProps,
  refreshing = false,
  onRefresh,
  keyboardAvoiding = false,
  keyboardVerticalOffset = 0,
  background = 'background',
  header,
  footer,
  style,
  contentContainerStyle,
  testID,
  padded = true,
  bottomInset = 0,
  topInset = true,
  topGap,
}: ScreenProps) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const hasHeader = header !== undefined && header !== null;
  const contentPadding = useScreenPadding({
    padded,
    bottomInset,
    topInset: topInset && !hasHeader,
    topGap: hasHeader ? 0 : topGap,
  });
  const backgroundColor =
    background === 'surface' ? c.surface : background === 'paper' ? c.paper : c.background;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      {...scrollProps}
      style={styles.flex}
      contentContainerStyle={[contentPadding, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
            colors={[c.primary]}
            progressBackgroundColor={c.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentPadding, contentContainerStyle]}>{children}</View>
  );

  const inner = (
    <>
      {hasHeader ? (
        <View
          style={{
            paddingTop: (topInset ? insets.top : 0) + (topGap ?? theme.spacing.lg),
            paddingHorizontal: padded ? theme.layout.screenPaddingH : 0,
          }}
        >
          {header}
        </View>
      ) : null}
      {body}
      {footer}
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor }, style]} testID={testID}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
