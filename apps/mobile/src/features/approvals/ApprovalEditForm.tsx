/**
 * Inline editor rendered in place of "Ne değişecek?" when the user taps Düzenle. Saving validates with
 * the shared payload schema and hands the edited payload back; approval is still a separate decision.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApprovalActionType } from '@da/domain';
import { Button, TextField } from '@da/ui';
import { DateTimeField } from './DateTimeField';
import {
  EDIT_FIELDS,
  getPath,
  isValidEmailList,
  participantsToText,
  setPath,
  textToParticipants,
  validateEditedPayload,
  type FieldSpec,
} from './editPayload';

type Payload = Record<string, unknown>;

export interface ApprovalEditFormProps {
  type: ApprovalActionType;
  initial: Payload;
  onSave: (payload: Payload) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function ApprovalEditForm({
  type,
  initial,
  onSave,
  onCancel,
  saving,
}: ApprovalEditFormProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Payload>(initial);
  const [emailText, setEmailText] = useState(() => participantsToText(initial.to));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (spec: FieldSpec, value: unknown) => {
    setDraft((d) => setPath(d, spec.name, value));
    if (errors[spec.name])
      setErrors((e) => {
        const next = { ...e };
        delete next[spec.name];
        return next;
      });
  };

  const save = () => {
    let candidate = draft;
    const emailField = EDIT_FIELDS[type].find((s) => s.kind === 'emails');
    if (emailField) {
      if (!isValidEmailList(emailText)) {
        setErrors({ [emailField.name]: t('approvals.editEmailInvalid') });
        return;
      }
      candidate = setPath(candidate, emailField.name, textToParticipants(emailText, initial.to));
    }
    const result = validateEditedPayload(type, candidate, t);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSave(result.payload);
  };

  const field = (spec: FieldSpec) => {
    const label = t(spec.labelKey);
    const error = errors[spec.name] ?? null;
    const testID = `approval-edit-field-${spec.name}`;
    const raw = getPath(draft, spec.name);
    switch (spec.kind) {
      case 'datetime':
        return (
          <DateTimeField
            key={spec.name}
            label={label}
            value={typeof raw === 'string' ? raw : null}
            nullable={spec.nullable}
            onChange={(iso) => update(spec, spec.nullable && iso === null ? null : iso)}
            error={error}
            testID={testID}
          />
        );
      case 'emails':
        return (
          <TextField
            key={spec.name}
            label={label}
            value={emailText}
            onChangeText={(text) => {
              setEmailText(text);
              if (errors[spec.name]) setErrors((e) => ({ ...e, [spec.name]: '' }));
            }}
            error={error || null}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={label}
            testID={testID}
          />
        );
      case 'multiline':
        return (
          <TextField
            key={spec.name}
            label={label}
            value={typeof raw === 'string' ? raw : ''}
            onChangeText={(text) => update(spec, text)}
            multiline
            maxLines={10}
            error={error}
            accessibilityLabel={label}
            testID={testID}
          />
        );
      default:
        return (
          <TextField
            key={spec.name}
            label={label}
            value={typeof raw === 'string' ? raw : ''}
            onChangeText={(text) => update(spec, text)}
            error={error}
            accessibilityLabel={label}
            testID={testID}
          />
        );
    }
  };

  return (
    <View style={styles.form} testID="approval-edit-form">
      {EDIT_FIELDS[type].map(field)}
      <View style={styles.actions}>
        <Button
          label={t('common.save')}
          size="sm"
          onPress={save}
          loading={saving}
          style={styles.save}
          testID="approval-edit-save"
        />
        <Button
          label={t('common.cancel')}
          variant="ghostSecondary"
          size="sm"
          onPress={onCancel}
          disabled={saving}
          testID="approval-edit-cancel"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  save: { flex: 1 },
});
