import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { MeetingPrep } from '@da/domain';
import { formatRelativeLabel, formatTime } from '@da/i18n';
import { ListGroup, ListRow, SectionKicker } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { useOpenSource } from '../source/openSource';

/** Evidence blocks: purpose · last contact · emails · open loops · commitments (both ways) · files · travel. */
export function PrepSections({ prep }: { prep: MeetingPrep }) {
  const { t } = useTranslation();
  const router = useRouter();
  const ctx = useFormatCtx();
  const { openSource } = useOpenSource();

  return (
    <View style={styles.stack}>
      {prep.travel ? (
        <ListGroup testID="prep-travel">
          <ListRow
            icon="directions"
            title={t('meeting.leaveBy', { time: formatTime(prep.travel.leaveAt, ctx) })}
            meta={`${prep.travel.provider} · ${t('meeting.minutesLeft', { minutes: prep.travel.durationMin })}`}
          />
        </ListGroup>
      ) : null}
      {prep.purpose ? (
        <View style={styles.section}>
          <SectionKicker label={t('meeting.purpose')} />
          <ListGroup>
            <ListRow icon="deadline" title={prep.purpose} meta={t('meeting.fromInvite')} />
          </ListGroup>
        </View>
      ) : null}
      {prep.lastContact ? (
        <View style={styles.section}>
          <SectionKicker label={t('meeting.lastContact')} />
          <ListGroup>
            <ListRow
              icon="history"
              title={prep.lastContact.summary}
              meta={`${formatRelativeLabel(prep.lastContact.at, ctx)} · ${prep.lastContact.source.label}`}
              onPress={() =>
                void openSource(
                  prep.lastContact?.source as NonNullable<typeof prep.lastContact>['source'],
                )
              }
              testID="prep-last-contact"
            />
          </ListGroup>
        </View>
      ) : null}
      {prep.relevantEmails.length > 0 ? (
        <View style={styles.section}>
          <SectionKicker
            label={t('meeting.recentEmails')}
            meta={t('email.threadCount', { count: prep.relevantEmails.length })}
          />
          <ListGroup>
            {prep.relevantEmails.map(({ thread, why }, i) => (
              <ListRow
                key={thread.id}
                icon="mail"
                title={thread.subject}
                meta={[why, formatRelativeLabel(thread.lastMessageAt, ctx)]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push({ pathname: '/email/[id]', params: { id: thread.id } })}
                testID={`prep-email-${i}`}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
      {prep.openLoops.length > 0 ? (
        <View style={styles.section}>
          <SectionKicker
            label={t('meeting.openLoops')}
            meta={t('today.prioritiesCount', { count: prep.openLoops.length })}
          />
          <ListGroup>
            {prep.openLoops.map((loop, i) => (
              <ListRow
                key={`${i}-${loop.text}`}
                icon="uncheck"
                title={loop.text}
                meta={[loop.source.label, formatRelativeLabel(loop.source.timestamp, ctx)].join(
                  ' · ',
                )}
                onPress={() => void openSource(loop.source)}
                testID={`prep-loop-${i}`}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
      {prep.userCommitments.length > 0 ? (
        <View style={styles.section}>
          <SectionKicker label={t('meeting.expectedFromYou')} />
          <ListGroup>
            {prep.userCommitments.map((c, i) => (
              <ListRow
                key={c.id}
                icon="person"
                title={c.text}
                meta={c.dueText ?? (c.dueAt ? formatRelativeLabel(c.dueAt, ctx) : undefined)}
                onPress={() => router.push('/commitments')}
                testID={`prep-mine-${i}`}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
      {prep.theirCommitments.length > 0 ? (
        <View style={styles.section}>
          <SectionKicker label={t('meeting.expectedFromThem')} />
          <ListGroup>
            {prep.theirCommitments.map((c, i) => (
              <ListRow
                key={c.id}
                icon="followUp"
                title={c.text}
                meta={c.dueText ?? (c.dueAt ? formatRelativeLabel(c.dueAt, ctx) : undefined)}
                onPress={() => router.push('/commitments')}
                testID={`prep-theirs-${i}`}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
      {prep.relevantFiles.length > 0 ? (
        <View style={styles.section}>
          <SectionKicker label={t('meeting.files')} />
          <ListGroup>
            {prep.relevantFiles.map((file, i) => (
              <ListRow
                key={`${i}-${file.name}`}
                icon={file.mimeType === 'application/pdf' ? 'pdf' : 'file'}
                title={file.name}
                meta={[file.source.label, formatRelativeLabel(file.source.timestamp, ctx)].join(
                  ' · ',
                )}
                onPress={() => void openSource(file.source)}
                testID={`prep-file-${i}`}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  section: { gap: 8 },
});
