import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from '../primitives/Avatar';
import { IconButton } from '../primitives/IconButton';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { ApprovalBadge } from './ApprovalBadge';

export interface ScreenHeaderAvatar {
  name: string;
  imageUrl?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export interface ScreenHeaderProps {
  /** root: kicker + h1 with avatar/approval pill · sub: back circle + centred kicker + context chip */
  variant?: 'root' | 'sub';
  title?: string;
  /** Date line ("5 EYLÜL CUMARTESİ") on root · centred caps label on sub pages */
  kicker?: string;
  /** Optional 14px line under a sub-page title ("3 işlem onayını bekliyor …"). */
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** arrow_back (push) · close (modal) · expand_more (audio player collapse) */
  backIcon?: Extract<IconName, 'back' | 'close' | 'expandMore'>;
  /** Right-side node (context chip such as "18 dk", header pill…). */
  right?: ReactNode;
  avatar?: ScreenHeaderAvatar;
  approvalCount?: number;
  approvalLabel?: string;
  onApprovals?: () => void;
  tone?: 'default' | 'onGradient';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Tab-screen header (h1 28 + date kicker, avatar 40 ink circle, "2 onay" pill) and
 * stacked-page header (36px back circle, centred caps kicker, right context chip).
 */
export function ScreenHeader({
  variant = 'root',
  title,
  kicker,
  subtitle,
  onBack,
  backLabel = 'Geri',
  backIcon = 'back',
  right,
  avatar,
  approvalCount = 0,
  approvalLabel,
  onApprovals,
  tone = 'default',
  style,
  testID,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const onGradient = tone === 'onGradient';
  const kickerTone = onGradient ? 'onGradientMuted' : 'tertiary';
  const titleTone = onGradient ? 'onGradient' : 'ink';

  if (variant === 'sub') {
    return (
      <View style={style} testID={testID}>
        <View style={styles.subRow}>
          {onBack ? (
            <IconButton
              icon={backIcon}
              accessibilityLabel={backLabel}
              variant={onGradient ? 'onGradient' : 'surface'}
              size={36}
              iconSize={20}
              onPress={onBack}
            />
          ) : (
            <View style={styles.spacer} />
          )}
          <View style={styles.center}>
            {kicker ? (
              <Text
                variant="kicker"
                tone={kickerTone}
                align="center"
                numberOfLines={1}
                accessibilityRole="header"
              >
                {kicker}
              </Text>
            ) : null}
          </View>
          {right ?? <View style={styles.spacer} />}
        </View>
        {title ? (
          <Text variant="h1" tone={titleTone} style={styles.subTitle} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            variant="secondary"
            tone={onGradient ? 'onGradientMuted' : 'secondary'}
            style={styles.subtitle}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.rootRow, style]} testID={testID}>
      <View style={styles.rootTexts}>
        {kicker ? (
          <Text variant="kicker" tone={kickerTone} numberOfLines={1}>
            {kicker}
          </Text>
        ) : null}
        {title ? (
          <Text
            variant="h1"
            tone={titleTone}
            style={kicker ? styles.rootTitle : undefined}
            accessibilityRole="header"
            numberOfLines={2}
          >
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.rootRight}>
        {right}
        <ApprovalBadge count={approvalCount} label={approvalLabel} onPress={onApprovals} />
        {avatar ? (
          avatar.onPress ? (
            <Pressable
              onPress={avatar.onPress}
              accessibilityRole="button"
              accessibilityLabel={avatar.accessibilityLabel ?? `Profil · ${avatar.name}`}
              style={styles.avatarPress}
            >
              <Avatar
                name={avatar.name}
                imageUrl={avatar.imageUrl}
                size={theme.sizes.avatarMd}
                variant="ink"
              />
            </Pressable>
          ) : (
            <Avatar
              name={avatar.name}
              imageUrl={avatar.imageUrl}
              size={theme.sizes.avatarMd}
              variant="ink"
            />
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  rootTexts: { flex: 1, minWidth: 0 },
  rootTitle: { marginTop: 4 },
  rootRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarPress: { borderRadius: 999 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
  },
  center: { flex: 1, minWidth: 0, alignItems: 'center' },
  spacer: { width: 36, height: 36 },
  subTitle: { marginTop: 12 },
  subtitle: { marginTop: 4 },
});
