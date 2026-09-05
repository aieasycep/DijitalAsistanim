import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../primitives/Icon';
import { fontFor, Text } from '../primitives/Text';
import { sansWeight } from '../utils/typography';

const RING = 2;
const LINE_HEIGHT = 22;

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'editable' | 'value' | 'onChangeText' | 'multiline' | 'placeholder'
> {
  /** Caption above the field. */
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Coral ring + 12px message with error icon below. */
  error?: string | null;
  helper?: string | null;
  disabled?: boolean;
  leftIcon?: IconName;
  /** Trailing element (eye toggle, counter…). */
  rightElement?: ReactNode;
  /** Grows with content up to `maxLines`. */
  multiline?: boolean;
  maxLines?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * 52px input, radius 16, surface + shadow-1. Focus: 2px indigo ring, no shadow. Error: coral ring + message.
 * Disabled: surface-2 with disabled text.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    placeholder,
    value,
    onChangeText,
    error,
    helper,
    disabled = false,
    leftIcon,
    rightElement,
    multiline = false,
    maxLines = 6,
    style,
    inputStyle,
    testID,
    accessibilityLabel,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const ringColor = focused
    ? c.focusRing
    : hasError
      ? c.critical
      : theme.isDark
        ? theme.cardRing
        : 'transparent';
  const showShadow = !focused && !hasError && !disabled && !theme.isDark;
  const innerHeight = theme.sizes.input - RING * 2;

  return (
    <View style={style} testID={testID}>
      {label ? (
        <Text variant="caption" tone="secondary" style={[sansWeight('600'), styles.label]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            minHeight: theme.sizes.input,
            borderRadius: theme.radius.lg,
            backgroundColor: disabled ? c.surface2 : c.surface,
            borderWidth: RING,
            borderColor: ringColor,
          },
          showShadow ? theme.shadows.s1 : null,
        ]}
      >
        {leftIcon ? <Icon name={leftIcon} size={18} color={c.inkTertiary} /> : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.inkTertiary}
          editable={!disabled}
          multiline={multiline}
          selectionColor={c.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          accessibilityState={{ disabled }}
          accessibilityHint={error ?? helper ?? undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            styles.input,
            { color: disabled ? c.inkDisabled : c.ink, fontFamily: fontFor('sans', '400') },
            multiline
              ? {
                  minHeight: innerHeight,
                  maxHeight: maxLines * LINE_HEIGHT + 28,
                  paddingTop: 14,
                  paddingBottom: 14,
                }
              : { height: innerHeight },
            inputStyle,
          ]}
          {...rest}
        />
        {rightElement}
      </View>
      {error ? (
        <View style={styles.messageRow}>
          <Icon name="conflict" size={14} color={c.criticalText} />
          <Text variant="caption" tone="critical" style={styles.message}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="caption" tone="tertiary" style={[styles.messageRow, styles.message]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: 6, paddingHorizontal: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 - RING },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  message: { flexShrink: 1 },
});
