import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AssistantMessage, SourceRef } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  Button,
  Card,
  Icon,
  ListGroup,
  ListRow,
  MetaChip,
  Pressable,
  SOURCE_ICON,
  Text,
  useTheme,
} from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { useOpenSource } from '../source/openSource';
import { routeForCard } from './routeForCard';

export interface MessageBubbleProps {
  message: AssistantMessage;
  index: number;
  /** Running offsets so `assistant-source-<n>` / `assistant-card-<n>` are unique across the thread. */
  sourceOffset: number;
  cardOffset: number;
  approvalOffset: number;
}

const CARD_ICON = {
  email: 'mail',
  event: 'event',
  person: 'person',
  commitment: 'commitment',
  life_event: 'flow',
  approval: 'approval',
  plan_block: 'plan',
} as const;

export const MessageBubble = memo(function MessageBubble({
  message,
  index,
  sourceOffset,
  cardOffset,
  approvalOffset,
}: MessageBubbleProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const { openSource } = useOpenSource();
  const c = theme.colors;

  if (message.role === 'user') {
    return (
      <View style={styles.userRow} testID={`assistant-message-${index}`}>
        <View
          style={[
            styles.bubble,
            styles.userBubble,
            { backgroundColor: c.primary, borderRadius: theme.radius.xl },
          ]}
        >
          <Text variant="body" color={c.onPrimary}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  const sourceLabel = (s: SourceRef) =>
    [s.label, s.person, formatRelativeLabel(s.timestamp, ctx)].filter(Boolean).join(' · ');

  return (
    <View style={styles.assistantRow} testID={`assistant-message-${index}`}>
      <Card
        padding={{ vertical: 10, horizontal: 14 }}
        radius={theme.radius.xl}
        style={styles.assistantBubble}
      >
        <Text variant="body">{message.content}</Text>
        {message.uncertain ? (
          <View style={styles.uncertain}>
            <Icon name="info" size={14} color={c.inkTertiary} />
            <Text variant="caption" tone="tertiary" testID={`assistant-uncertain-${index}`}>
              {t('assistant.uncertain')}
            </Text>
          </View>
        ) : null}
      </Card>
      {message.sources.length > 0 ? (
        <View style={styles.section}>
          <Text variant="kicker" tone="tertiary">
            {t('assistant.sources')}
          </Text>
          <View style={styles.chips}>
            {message.sources.map((source, i) => (
              <Pressable
                key={`${source.type}-${source.id}-${i}`}
                onPress={() => void openSource(source)}
                accessibilityRole="link"
                accessibilityLabel={t('a11y.source', { label: sourceLabel(source) })}
                testID={`assistant-source-${sourceOffset + i}`}
              >
                <MetaChip label={sourceLabel(source)} icon={SOURCE_ICON[source.type]} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {message.cards.length > 0 ? (
        <ListGroup style={styles.cards}>
          {message.cards.map((card, i) => (
            <ListRow
              key={`${card.kind}-${card.entityId}-${i}`}
              icon={CARD_ICON[card.kind]}
              title={card.title}
              meta={card.subtitle ?? undefined}
              onPress={() => router.push(routeForCard(card))}
              testID={`assistant-card-${cardOffset + i}`}
            />
          ))}
        </ListGroup>
      ) : null}
      {message.approvalIds.length > 0 ? (
        <View style={styles.approvals}>
          {message.approvalIds.map((approvalId, i) => (
            <Button
              key={approvalId}
              label={t('assistant.openApproval')}
              icon="approval"
              variant="tonal"
              size="sm"
              onPress={() =>
                router.push({ pathname: '/approvals/[id]', params: { id: approvalId } })
              }
              testID={`assistant-approval-${approvalOffset + i}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start', gap: 8 },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, maxWidth: '86%' },
  userBubble: { borderBottomRightRadius: 6 },
  assistantBubble: { maxWidth: '92%' },
  uncertain: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  section: { gap: 6, alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cards: { alignSelf: 'stretch' },
  approvals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
