import { useTranslation } from 'react-i18next';
import { formatRelativeLabel } from '@da/i18n';
import { BottomSheet, SheetRow } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { isoAtLocal } from './dates';

export interface PostponeOption {
  key: 'tomorrow' | 'threeDays' | 'week';
  until: string;
}

export interface PostponeSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPick: (option: PostponeOption) => void;
  testIDPrefix?: string;
}

/** Yarın / 3 gün / 1 hafta — 09:00 local on the chosen day. */
export function PostponeSheet({
  visible,
  title,
  subtitle,
  onClose,
  onPick,
  testIDPrefix = 'postpone',
}: PostponeSheetProps) {
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const options: PostponeOption[] = [
    { key: 'tomorrow', until: isoAtLocal(ctx, 1, 9) },
    { key: 'threeDays', until: isoAtLocal(ctx, 3, 9) },
    { key: 'week', until: isoAtLocal(ctx, 7, 9) },
  ];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      closeLabel={t('common.close')}
      testID={`${testIDPrefix}-sheet`}
    >
      {options.map((o, i) => (
        <SheetRow
          key={o.key}
          icon="schedule"
          label={t(`commitments.postponeOptions.${o.key}`)}
          value={formatRelativeLabel(o.until, ctx)}
          divider={i > 0}
          onPress={() => onPick(o)}
          testID={`${testIDPrefix}-${o.key}`}
        />
      ))}
    </BottomSheet>
  );
}
