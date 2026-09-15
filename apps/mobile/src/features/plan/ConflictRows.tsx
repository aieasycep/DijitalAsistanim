import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CalendarConflict } from '@da/domain';
import { formatTime } from '@da/i18n';
import { ListGroup, ListRow, SectionKicker, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';

export function ConflictRows({ conflicts }: { conflicts: CalendarConflict[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const ctx = useFormatCtx();
  if (conflicts.length === 0) return null;
  return (
    <>
      <SectionKicker
        label={t('plan.conflicts')}
        meta={t('plan.conflictCount', { count: conflicts.length })}
      />
      <ListGroup testID="plan-conflicts">
        {conflicts.map((conflict) => (
          <ListRow
            key={conflict.id}
            icon="conflict"
            iconColor={theme.colors.criticalText}
            title={t('plan.conflict.body', { a: conflict.eventA.title, b: conflict.eventB.title })}
            meta={`${formatTime(conflict.eventA.startAt, ctx)} · ${t('plan.conflict.overlap', { minutes: conflict.overlapMinutes })}`}
            onPress={() => router.push({ pathname: '/conflict/[id]', params: { id: conflict.id } })}
            testID={`plan-conflict-${conflict.id}`}
          />
        ))}
      </ListGroup>
    </>
  );
}
