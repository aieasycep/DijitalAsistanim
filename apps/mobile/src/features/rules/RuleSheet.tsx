/**
 * "Yeni Kural" / "Kuralı Düzenle" sheet: pick one of the 8 rule types, enter the value the type needs
 * (e-mail, domain or keyword), optionally name the rule and choose whether it starts enabled.
 * Creating a rule is a preference, not an action — it never goes through the Approval Centre.
 */
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PriorityRule, PriorityRuleType } from '@da/domain';
import {
  BottomSheet,
  Button,
  ListGroup,
  ListGroupTitle,
  SheetRow,
  Text,
  TextField,
  Toggle,
} from '@da/ui';
import type { RuleInput } from './useRules';
import {
  RULE_TYPES,
  defaultRuleLabel,
  isValidRuleValue,
  normalizeRuleValue,
  ruleSpec,
  ruleValueForDisplay,
} from './ruleTypes';

export interface RuleSheetProps {
  visible: boolean;
  /** Existing rule to edit; null creates a new one. */
  rule: PriorityRule | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: RuleInput) => void;
}

const DEFAULT_TYPE: PriorityRuleType = 'sender_important';

export function RuleSheet({ visible, rule, saving = false, onClose, onSubmit }: RuleSheetProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<PriorityRuleType>(DEFAULT_TYPE);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [touched, setTouched] = useState(false);
  const [session, setSession] = useState<{ visible: boolean; rule: PriorityRule | null }>({
    visible,
    rule,
  });

  // Re-seed the form whenever the sheet opens (possibly for a different rule) — state adjustment during render.
  if (session.visible !== visible || session.rule !== rule) {
    setSession({ visible, rule });
    if (visible) {
      setType(rule?.type ?? DEFAULT_TYPE);
      setValue(rule ? (ruleValueForDisplay(rule) ?? '') : '');
      setLabel(rule?.label ?? '');
      setEnabled(rule?.enabled ?? true);
      setTouched(false);
    }
  }

  const spec = ruleSpec(type);
  const normalized = useMemo(
    () => normalizeRuleValue(spec.valueKind, value),
    [spec.valueKind, value],
  );
  const valid = isValidRuleValue(spec.valueKind, normalized);
  const typeLabel = t(`settings.rules.types.${type}`);
  const outcomeLabel = t(`settings.rules.outcomes.${spec.outcome}`);
  const placeholder =
    spec.valueKind === 'none' ? '' : t(`settings.rules.valuePlaceholder.${spec.valueKind}`);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const cleanLabel =
      label.trim() || defaultRuleLabel(type, normalized, { typeLabel, outcomeLabel });
    onSubmit({
      id: rule?.id,
      type,
      value: normalized,
      label: cleanLabel.slice(0, 120),
      enabled,
      position: rule?.position,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={rule ? t('settings.rules.editTitle') : t('settings.rules.addTitle')}
      subtitle={t('settings.rules.precedenceNote')}
      closeLabel={t('common.close')}
      swipeToClose={false}
      testID="rule-sheet"
      footer={
        <Button
          label={rule ? t('settings.rules.saveChanges') : t('settings.rules.save')}
          variant={rule ? 'dark' : 'primary'}
          size="lg"
          fullWidth
          disabled={!valid}
          loading={saving}
          onPress={submit}
          style={styles.footer}
          testID="rule-save"
        />
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <ListGroupTitle label={t('settings.rules.typeKicker')} />
          <ListGroup padding={{ horizontal: 12, vertical: 2 }}>
            {RULE_TYPES.map((candidate) => {
              const candidateSpec = ruleSpec(candidate);
              return (
                <SheetRow
                  key={candidate}
                  icon={candidateSpec.icon}
                  iconTone={candidate === type ? 'primary' : 'secondary'}
                  label={t(`settings.rules.types.${candidate}`)}
                  value={t(`settings.rules.outcomes.${candidateSpec.outcome}`)}
                  valueTone={candidate === type ? 'primary' : 'tertiary'}
                  selected={candidate === type}
                  onPress={() => {
                    setType(candidate);
                    setTouched(false);
                  }}
                  testID={`rule-type-${candidate}`}
                />
              );
            })}
          </ListGroup>

          {spec.valueKind !== 'none' ? (
            <View style={styles.section}>
              <ListGroupTitle label={t('settings.rules.valueKicker')} />
              <TextField
                label={t('settings.rules.valueLabel')}
                value={value}
                onChangeText={(next) => {
                  setValue(next);
                  if (touched) setTouched(false);
                }}
                placeholder={placeholder}
                error={touched && !valid ? t('settings.rules.valueRequired') : null}
                keyboardType={spec.valueKind === 'email' ? 'email-address' : 'default'}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
                testID="rule-value"
              />
            </View>
          ) : (
            <Text variant="caption" tone="tertiary" style={styles.anyNote}>
              {t('settings.rules.valueAny')}
            </Text>
          )}

          <TextField
            label={t('settings.rules.labelLabel')}
            value={label}
            onChangeText={setLabel}
            placeholder={t('settings.rules.labelPlaceholder')}
            maxLength={120}
            style={styles.section}
            testID="rule-label"
          />

          <View style={styles.toggleRow}>
            <Text variant="bodyMedium" style={styles.toggleLabel}>
              {t('settings.rules.enabled')}
            </Text>
            <Toggle
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={t('settings.rules.enabled')}
              testID="rule-enabled"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 440 },
  section: { marginTop: 14 },
  anyNote: { marginTop: 10, paddingHorizontal: 4 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  toggleLabel: { flex: 1 },
  footer: { marginTop: 12 },
});
