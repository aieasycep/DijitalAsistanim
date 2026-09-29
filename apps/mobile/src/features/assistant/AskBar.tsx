/**
 * ask-bar built from primitives so every control carries a testID: 52px pill, multi-line input,
 * mic (primary) while empty → send (ink) with text, spinner while a reply is in flight.
 */
import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { shadows } from '@da/design-tokens';
import { IconButton, fontFor, useTheme } from '@da/ui';

const RING = 2;
const LINE_HEIGHT = 20;

export interface AskBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  onMic?: () => void;
  placeholder: string;
  sendLabel: string;
  micLabel: string;
  accessibilityLabel: string;
  disabled?: boolean;
  loading?: boolean;
  maxLines?: number;
  maxLength?: number;
  autoFocus?: boolean;
  testIDs: { input: string; send: string; mic: string };
  style?: StyleProp<ViewStyle>;
}

export const AskBar = forwardRef<TextInput, AskBarProps>(function AskBar(
  {
    value,
    onChangeText,
    onSend,
    onMic,
    placeholder,
    sendLabel,
    micLabel,
    accessibilityLabel,
    disabled = false,
    loading = false,
    maxLines = 4,
    maxLength = 2000,
    autoFocus = false,
    testIDs,
    style,
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
        },
        !focused && !theme.isDark ? styles.shadow : null,
        style,
      ]}
    >
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        selectionColor={c.primary}
        textAlignVertical="center"
        blurOnSubmit={false}
        style={[
          styles.input,
          {
            color: c.ink,
            fontFamily: fontFor('sans', '400'),
            maxHeight: maxLines * LINE_HEIGHT + 20,
          },
        ]}
        testID={testIDs.input}
      />
      {loading ? (
        <View
          style={[styles.spinner, { backgroundColor: c.inverseSurface }]}
          accessibilityRole="progressbar"
          accessibilityLabel={sendLabel}
          testID={`${testIDs.send}-busy`}
        >
          <ActivityIndicator size="small" color={c.inkInverse} />
        </View>
      ) : hasText ? (
        <IconButton
          icon="send"
          variant="dark"
          size={40}
          iconSize={20}
          accessibilityLabel={sendLabel}
          onPress={() => onSend(trimmed)}
          disabled={disabled}
          hapticOnPress="light"
          testID={testIDs.send}
        />
      ) : (
        <IconButton
          icon="mic"
          variant="primary"
          size={40}
          iconSize={20}
          accessibilityLabel={micLabel}
          onPress={onMic}
          disabled={disabled || !onMic}
          hapticOnPress="medium"
          testID={testIDs.mic}
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
    paddingLeft: 16 - RING,
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
