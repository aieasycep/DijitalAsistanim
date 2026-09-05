import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { EmailDetailResponse } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import { Card, Icon, Pressable, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';

export interface OriginalMessagesProps {
  messages: EmailDetailResponse['messages'];
  /** Expanded from the start (e.g. when no AI summary is available). */
  initiallyOpen?: boolean;
}

/** "Orijinal Mail" accordion — collapsed by default, always one tap away. Bodies are never shown elsewhere. */
export function OriginalMessages({ messages, initiallyOpen = false }: OriginalMessagesProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ctx = useFormatCtx();
  const [open, setOpen] = useState(initiallyOpen);
  const youLabel = t('email.you');

  return (
    <Card radius={theme.radius.xl} padding={0} testID="email-original">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t('email.hideOriginal') : t('email.showOriginal')}
        pressScale={1}
        style={styles.header}
        testID="email-original-toggle"
      >
        <Icon name="mail" size={20} color={theme.colors.inkSecondary} />
        <Text variant="button" style={styles.headerText}>
          {t('email.original')}
        </Text>
        <Text variant="caption" tone="tertiary">
          {t('email.threadCount', { count: messages.length })}
        </Text>
        <Icon
          name="expandMore"
          size={22}
          color={theme.colors.inkTertiary}
          style={open ? styles.chevronOpen : undefined}
        />
      </Pressable>
      {open ? (
        <View
          style={[styles.body, { borderTopColor: theme.colors.hairline }]}
          testID="email-original-body"
        >
          {messages.map((m, i) => (
            <View
              key={m.id}
              style={[
                styles.message,
                i > 0
                  ? {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.colors.hairline,
                    }
                  : null,
              ]}
            >
              <View style={styles.meta}>
                <Text variant="chip" numberOfLines={1} style={styles.from}>
                  {m.isFromUser ? youLabel : m.from}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatRelativeLabel(m.sentAt, ctx)}
                </Text>
              </View>
              <Text variant="secondary" style={styles.text} selectable>
                {m.bodyText}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerText: { flex: 1 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 16 },
  message: { paddingTop: 12, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  from: { flex: 1 },
  text: { lineHeight: 21 },
});
