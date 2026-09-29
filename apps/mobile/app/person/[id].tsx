import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Commitment, PersonIntelligence } from '@da/domain';
import { formatDuration, formatRelativeLabel, formatTime } from '@da/i18n';
import {
  Avatar,
  Button,
  CalendarRowCard,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionKicker,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from '@da/ui';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { minutesBetween } from '@/features/plan/dates';
import { useOpenSource } from '@/features/source/openSource';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';

export default function PersonScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { gate } = useEntitlement();
  const { openSource } = useOpenSource();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: qk.person(id ?? ''),
    queryFn: () => ds.people.getPerson(id ?? ''),
    enabled: Boolean(id),
  });
  const person = query.data;

  const setVip = useMutation({
    mutationFn: (isVip: boolean) => ds.people.setVip(id ?? '', isVip),
    onMutate: (isVip) => {
      queryClient.setQueryData<PersonIntelligence>(qk.person(id ?? ''), (prev) =>
        prev ? { ...prev, contact: { ...prev.contact, isVip } } : prev,
      );
    },
    onSuccess: async (_, isVip) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.vips }),
        queryClient.invalidateQueries({ queryKey: qk.person(id ?? '') }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ]);
      if (isVip)
        toast.show({
          message: t('today.vipToast', { name: person?.contact.displayName ?? '' }),
          icon: 'vip',
          iconTone: 'primary',
        });
    },
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: qk.person(id ?? '') });
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
    },
  });

  const toggleVip = () => {
    if (!person) return;
    const next = !person.contact.isVip;
    if (next && !gate('vip_people', 'vip')) return;
    setVip.mutate(next);
  };

  const firstName = person?.contact.displayName.split(' ')[0] ?? '';
  const commitmentRows = (list: Commitment[], prefix: string) =>
    list.map((c, i) => (
      <ListRow
        key={c.id}
        icon="commitment"
        title={c.text}
        meta={c.dueText ?? (c.dueAt ? formatRelativeLabel(c.dueAt, ctx) : undefined)}
        onPress={() => router.push('/commitments')}
        testID={`${prefix}-${i}`}
      />
    ));
  const isEmpty =
    person &&
    !person.lastContact &&
    person.upcomingMeetings.length === 0 &&
    person.recentTopics.length === 0 &&
    person.userOwes.length === 0 &&
    person.theyOwe.length === 0 &&
    person.relatedMessages.length === 0;

  return (
    <Screen
      scroll
      topGap={6}
      bottomInset={96}
      testID="person-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => router.back()}
          backLabel={t('common.back')}
          right={
            person ? (
              <Button
                label={person.contact.isVip ? t('person.vipOn') : t('person.vipOff')}
                icon="vip"
                iconFilled={person.contact.isVip}
                variant={person.contact.isVip ? 'tonal' : 'surface'}
                size="sm"
                loading={setVip.isPending}
                onPress={toggleVip}
                accessibilityState={{ selected: person.contact.isVip }}
                testID="person-vip"
              />
            ) : undefined
          }
        />
      }
      footer={
        person ? (
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: theme.layout.screenPaddingH,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <Button
              label={t('person.ask', { name: firstName })}
              icon="ai"
              size="lg"
              fullWidth
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/assistant',
                  params: { contactId: person.contact.id },
                })
              }
              testID="person-ask"
            />
          </View>
        ) : null
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <View style={styles.stack} testID="person-loading">
          <View style={styles.identity}>
            <Skeleton width={72} height={72} radius={36} />
            <Skeleton width="50%" height={24} />
            <Skeleton width="60%" height={14} />
          </View>
          <Skeleton height={72} radius={theme.radius.lg} />
          <Skeleton height={120} radius={theme.radius.xl} />
        </View>
      ) : query.isError || !person ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.identity}>
            <Avatar
              name={person.contact.displayName}
              imageUrl={person.contact.avatarUrl}
              size={72}
              vip={person.contact.isVip}
            />
            <Text variant="h2" align="center">
              {person.contact.displayName}
            </Text>
            {person.contact.company || person.contact.title ? (
              <Text variant="secondary" tone="secondary" align="center">
                {[person.contact.company, person.contact.title].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={styles.stats}>
            <StatTile
              label={t('person.lastContact')}
              value={person.lastContact ? formatRelativeLabel(person.lastContact.at, ctx) : '—'}
              onPress={
                person.lastContact
                  ? () =>
                      void openSource(
                        person.lastContact?.source as NonNullable<
                          typeof person.lastContact
                        >['source'],
                      )
                  : undefined
              }
              testID="person-stat-last"
            />
            <StatTile
              label={t('person.upcomingMeeting')}
              value={
                person.upcomingMeetings[0]
                  ? formatRelativeLabel(person.upcomingMeetings[0].startAt, ctx)
                  : '—'
              }
              onPress={
                person.upcomingMeetings[0]
                  ? () =>
                      router.push({
                        pathname: '/meeting/[id]/prep',
                        params: { id: person.upcomingMeetings[0]?.id ?? '' },
                      })
                  : undefined
              }
              testID="person-stat-upcoming"
            />
            <StatTile
              label={t('person.openLoops')}
              value={String(person.openLoops)}
              tone={person.openLoops > 0 ? 'warning' : 'ink'}
              testID="person-stat-loops"
            />
          </View>
          {isEmpty ? (
            <EmptyState icon="person" title={t('person.noHistory')} compact testID="person-empty" />
          ) : null}
          {person.upcomingMeetings.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker label={t('person.upcoming')} />
              {person.upcomingMeetings.map((event) => {
                const [hour = '00', minute = '00'] = formatTime(event.startAt, ctx).split(':');
                return (
                  <CalendarRowCard
                    key={event.id}
                    hour={hour}
                    minute={minute}
                    title={event.title}
                    meta={[
                      formatRelativeLabel(event.startAt, ctx),
                      formatDuration(minutesBetween(event.startAt, event.endAt), ctx.locale),
                      event.location,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    actionLabel={t('common.prepare')}
                    onAction={() => {
                      if (gate('meeting_prep', 'meeting_prep'))
                        router.push({ pathname: '/meeting/[id]/prep', params: { id: event.id } });
                    }}
                    onPress={() => {
                      if (gate('meeting_prep', 'meeting_prep'))
                        router.push({ pathname: '/meeting/[id]/prep', params: { id: event.id } });
                    }}
                    testID={`person-event-${event.id}`}
                  />
                );
              })}
            </View>
          ) : null}
          {person.recentTopics.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker label={t('person.recentTopics')} />
              <ListGroup>
                {person.recentTopics.map((topic, i) => (
                  <ListRow
                    key={`${i}-${topic.topic}`}
                    icon="text"
                    title={topic.topic}
                    meta={`${formatRelativeLabel(topic.at, ctx)} · ${topic.source.label}`}
                    onPress={() => void openSource(topic.source)}
                    testID={`person-topic-${i}`}
                  />
                ))}
              </ListGroup>
            </View>
          ) : null}
          {person.userOwes.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker label={t('person.expectedFromYou')} />
              <ListGroup>{commitmentRows(person.userOwes, 'person-owes')}</ListGroup>
            </View>
          ) : null}
          {person.theyOwe.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker label={t('person.expectedFromThem')} />
              <ListGroup>{commitmentRows(person.theyOwe, 'person-owed')}</ListGroup>
            </View>
          ) : null}
          {person.relatedMessages.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker
                label={t('person.relatedMessages')}
                meta={t('email.threadCount', { count: person.relatedMessages.length })}
              />
              <ListGroup>
                {person.relatedMessages.map((thread, i) => (
                  <ListRow
                    key={thread.id}
                    icon="mail"
                    title={thread.subject}
                    meta={[
                      thread.analysis?.summary ?? thread.snippet,
                      formatRelativeLabel(thread.lastMessageAt, ctx),
                    ].join(' · ')}
                    onPress={() =>
                      router.push({ pathname: '/email/[id]', params: { id: thread.id } })
                    }
                    testID={`person-message-${i}`}
                  />
                ))}
              </ListGroup>
            </View>
          ) : null}
          {person.lastContact ? (
            <View style={styles.section}>
              <SectionKicker label={t('person.lastContact')} />
              <ListGroup>
                <ListRow
                  icon="history"
                  title={person.lastContact.summary}
                  meta={`${formatRelativeLabel(person.lastContact.at, ctx)} · ${person.lastContact.source.label}`}
                  onPress={() =>
                    void openSource(
                      person.lastContact?.source as NonNullable<
                        typeof person.lastContact
                      >['source'],
                    )
                  }
                  testID="person-last-contact"
                />
              </ListGroup>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function StatTile({
  label,
  value,
  tone = 'ink',
  onPress,
  testID,
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'warning';
  onPress?: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Card
      radius={theme.radius.lg}
      padding={12}
      style={styles.tile}
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
    >
      <Text variant="tab" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="h4" tone={tone} numberOfLines={1} style={styles.tileValue}>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  section: { gap: 8 },
  identity: { alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0 },
  tileValue: { marginTop: 4 },
  footer: { paddingTop: 12, paddingBottom: 24 },
});
