import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { shadows } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from '../primitives/IconButton';
import { fontFor } from '../primitives/Text';

const RING = 2;
const LINE_HEIGHT = 20;

export interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  /** Mic button (shown while the field is empty). */
  onMic?: () => void;
  /** Shows a leading attach_file button. */
  onAttach?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Reply in flight — the send button becomes a spinner. */
  loading?: boolean;
  /** Grows up to this many lines. */
  maxLines?: number;
  autoFocus?: boolean;
  maxLength?: number;
  sendLabel?: string;
  micLabel?: string;
  attachLabel?: string;
  accessibilityLabel?: string;
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * ask-bar — 52px pill with soft shadow; mic (primary) while empty → send (ink, arrow_upward) with text.
 * Focus: 2px indigo ring, no shadow. Multiline up to 4 lines.
 */
export const ChatInput = forwardRef<TextInput, ChatInputProps>(function ChatInput(
  {
    value,
    onChangeText,
    onSend,
    onMic,
    onAttach,
    placeholder = 'Dijital hayatına sor…',
    disabled = false,
    loading = false,
    maxLines = 4,
    autoFocus = false,
    maxLength,
    sendLabel = 'Gönder',
    micLabel = 'Sesle sor',
    attachLabel = 'Dosya ekle',
    accessibilityLabel = 'Mesaj',
    onFocus,
    onBlur,
    style,
    testID,
  },
  ref,
) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const trimmed = value.trim();
  const hasText = trimmed.length > 0;
  const ringColor = focused ? c.focusRing : theme.isDark ? theme.cardRing : 'transparent';

  return (
    <View
      style={[
        styles.wrap,
        {
          minHeight: theme.sizes.chatInput,
          backgroundColor: c.surface,
          borderWidth: RING,
          borderColor: ringColor,
          opacity: disabled ? 0.5 : 1,
          paddingLeft: onAttach ? 4 - RING : 16 - RING,
        },
        !focused && !theme.isDark ? styles.shadow : null,
        style,
      ]}
      testID={testID}
    >
      {onAttach ? (
        <IconButton
          icon="attach"
          variant="plain"
          size={40}
          iconSize={20}
          color={c.inkTertiary}
          accessibilityLabel={attachLabel}
          onPress={onAttach}
          disabled={disabled || loading}
        />
      ) : null}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.inkTertiary}
        editable={!disabled}
        multiline
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        selectionColor={c.primary}
        textAlignVertical="center"
        style={[
          styles.input,
          {
            color: c.ink,
            fontFamily: fontFor('sans', '400'),
            maxHeight: maxLines * LINE_HEIGHT + 20,
          },
        ]}
      />
      {hasText ? (
        loading ? (
          <View
            style={[styles.spinner, { backgroundColor: c.inverseSurface }]}
            accessibilityRole="progressbar"
            accessibilityLabel={sendLabel}
          >
            <ActivityIndicator size="small" color={c.inkInverse} />
          </View>
        ) : (
          <IconButton
            icon="send"
            variant="dark"
            size={40}
            iconSize={20}
            accessibilityLabel={sendLabel}
            onPress={() => onSend(trimmed)}
            disabled={disabled}
            hapticOnPress="light"
          />
        )
      ) : (
        <IconButton
          icon="mic"
          variant="primary"
          size={40}
          iconSize={20}
          accessibilityLabel={micLabel}
          onPress={onMic}
          disabled={disabled || loading || !onMic}
          hapticOnPress="medium"
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingRight: 6 - RING,
    paddingVertical: 6 - RING,
    borderRadius: 26,
  },
  shadow: {
    shadowColor: shadows.s1.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    minHeight: 40,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
