import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { REPLY_TONES, type ReplyTone } from '@da/domain';
import { FilterChip } from '@da/ui';

export interface ToneChipsProps {
  value: ReplyTone;
  onChange: (tone: ReplyTone) => void;
  disabled?: boolean;
}

/** Kısa · Profesyonel · Samimi · Detaylı */
export function ToneChips({ value, onChange, disabled = false }: ToneChipsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityRole="tablist" testID="reply-tones">
      {REPLY_TONES.map((tone) => (
        <FilterChip
          key={tone}
          label={t(`email.reply.tones.${tone}`)}
          selected={tone === value}
          disabled={disabled}
          onPress={() => onChange(tone)}
          testID={`reply-tone-${tone}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
