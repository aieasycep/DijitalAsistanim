import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { fontFor } from '../primitives/Text';

const RING = 2;

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Submit from the keyboard search key. */
  onSubmit?: (text: string) => void;
  onClear?: () => void;
  /** Shows a text "Vazgeç" button next to the pill while focused (or always with `showCancel`). */
  onCancel?: () => void;
  showCancel?: boolean;
  cancelLabel?: string;
  clearLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  editable?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  accessibilityLabel?: string;
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 44px pill search field: search 18 tertiary · "Hafızada ara…" · clear (×) when there is text · optional cancel. */
export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  {
    value,
    onChangeText,
    onSubmit,
    onClear,
    onCancel,
    showCancel,
    cancelLabel = 'Vazgeç',
    clearLabel = 'Temizle',
    placeholder = 'Hafızada ara…',
    autoFocus = false,
    editable = true,
    returnKeyType = 'search',
    accessibilityLabel = 'Ara',
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
  const cancelVisible = showCancel ?? (focused && Boolean(onCancel));
  const ringColor = focused ? c.focusRing : theme.isDark ? theme.cardRing : 'transparent';

  return (
    <View style={[styles.row, style]} testID={testID}>
      <View
        style={[
          styles.pill,
          {
            height: theme.sizes.searchBar,
            backgroundColor: c.surface,
            borderWidth: RING,
            borderColor: ringColor,
          },
          !focused && !theme.isDark ? theme.shadows.s1 : null,
        ]}
      >
        <Icon name="search" size={18} color={c.inkTertiary} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.inkTertiary}
          autoFocus={autoFocus}
          editable={editable}
          returnKeyType={returnKeyType}
          autoCorrect={false}
          onSubmitEditing={() => onSubmit?.(value)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="search"
          selectionColor={c.primary}
          style={[styles.input, { color: c.ink, fontFamily: fontFor('sans', '400') }]}
        />
        {value.length > 0 ? (
          <IconButton
            icon="close"
            variant="plain"
            size={36}
            iconSize={18}
            color={c.inkTertiary}
            accessibilityLabel={clearLabel}
            onPress={() => {
              onChangeText('');
              onClear?.();
            }}
            style={styles.clear}
          />
        ) : null}
      </View>
      {cancelVisible && onCancel ? (
        <Button label={cancelLabel} variant="ghostSecondary" size="ghost" onPress={onCancel} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14 - RING,
    paddingRight: 8 - RING,
    borderRadius: 999,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: 40,
  },
  clear: { marginRight: -4 },
});
