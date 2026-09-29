/**
 * One explicit rule in the list: icon tile, label, "outcome · value" meta, enable switch, and an action
 * row with up/down (priority order), edit and delete. Disabled rules render at 55 % opacity (design 7.9).
 */
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PriorityRule } from '@da/domain';
import { Icon, IconButton, Pressable, Text, Toggle, useTheme } from '@da/ui';
import { ruleSpec, ruleValueForDisplay } from './ruleTypes';

export interface RuleRowProps {
  rule: PriorityRule;
  index: number;
  count: number;
  busy?: boolean;
  onToggle: (rule: PriorityRule) => void;
  onEdit: (rule: PriorityRule) => void;
  onDelete: (rule: PriorityRule) => void;
  onMove: (rule: PriorityRule, direction: -1 | 1) => void;
}

export function RuleRow({
  rule,
  index,
  count,
  busy = false,
  onToggle,
  onEdit,
  onDelete,
  onMove,
}: RuleRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const spec = ruleSpec(rule.type);
  const value = ruleValueForDisplay(rule);
  const outcome = t(`settings.rules.outcomes.${spec.outcome}`);
  const meta = value ? `${outcome} · ${value}` : t(`settings.rules.types.${rule.type}`);
  const canMoveUp = index > 0;
  const canMoveDown = index < count - 1;

  return (
    <View style={[styles.wrap, { opacity: rule.enabled ? 1 : 0.55 }]} testID={`rule-${rule.id}`}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onEdit(rule)}
          accessibilityRole="button"
          accessibilityLabel={`${rule.label}, ${meta}`}
          accessibilityHint={t('settings.rules.edit')}
          pressScale={1}
          ensureTouchTarget={false}
          style={styles.main}
          testID={`rule-open-${rule.id}`}
        >
          <View
            style={[styles.tile, { backgroundColor: c.surface2, borderRadius: theme.radius.xs }]}
          >
            <Icon name={spec.icon} size={18} color={c.inkSecondary} />
          </View>
          <View style={styles.texts}>
            <Text variant="bodyMedium" numberOfLines={2}>
              {rule.label}
            </Text>
            <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
              {rule.enabled ? meta : `${t('settings.rules.disabledMeta')} · ${meta}`}
            </Text>
          </View>
        </Pressable>
        <Toggle
          value={rule.enabled}
          onValueChange={() => onToggle(rule)}
          disabled={busy}
          accessibilityLabel={t('settings.rules.toggle', { label: rule.label })}
          testID={`rule-toggle-${rule.id}`}
        />
      </View>
      <View style={styles.actions}>
        <IconButton
          icon="send"
          variant="plain"
          size={36}
          iconSize={18}
          color={canMoveUp ? c.inkSecondary : c.inkDisabled}
          disabled={!canMoveUp || busy}
          accessibilityLabel={t('settings.rules.moveUp')}
          onPress={() => onMove(rule, -1)}
          testID={`rule-up-${rule.id}`}
        />
        <IconButton
          icon="send"
          variant="plain"
          size={36}
          iconSize={18}
          color={canMoveDown ? c.inkSecondary : c.inkDisabled}
          disabled={!canMoveDown || busy}
          accessibilityLabel={t('settings.rules.moveDown')}
          onPress={() => onMove(rule, 1)}
          style={styles.flip}
          testID={`rule-down-${rule.id}`}
        />
        <View style={styles.spacer} />
        <IconButton
          icon="edit"
          variant="plain"
          size={36}
          iconSize={18}
          color={c.inkSecondary}
          disabled={busy}
          accessibilityLabel={t('settings.rules.edit')}
          onPress={() => onEdit(rule)}
          testID={`rule-edit-${rule.id}`}
        />
        <IconButton
          icon="delete"
          variant="plain"
          size={36}
          iconSize={18}
          color={c.criticalText}
          disabled={busy}
          accessibilityLabel={t('common.delete')}
          onPress={() => onDelete(rule)}
          testID={`rule-delete-${rule.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, marginLeft: 44 },
  spacer: { flex: 1 },
  flip: { transform: [{ rotate: '180deg' }] },
});
