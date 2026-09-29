/**
 * "Düzenle" contract per approval type: which payload fields are editable, how they are read / written
 * (dotted paths for `calendar_update.changes.*`) and how an edited payload is normalised and validated
 * against the shared zod schemas before it is sent as `editedPayload`.
 */
import type { ApprovalActionType, EmailParticipant } from '@da/domain';
import { approvalPayloadSchemas } from '@da/validation';
import type { TFunction } from 'i18next';

export type FieldKind = 'text' | 'multiline' | 'emails' | 'datetime';

export interface FieldSpec {
  /** Payload path (`title`, `changes.startAt`). Also the `approval-edit-field-<name>` testID suffix. */
  name: string;
  kind: FieldKind;
  labelKey: string;
  /** Empty input clears the value (null / removed) instead of failing validation. */
  nullable?: boolean;
}

const f = (name: string, kind: FieldKind, labelKey: string, nullable = false): FieldSpec => ({
  name,
  kind,
  labelKey: `approvals.fields.${labelKey}`,
  nullable,
});

export const EDIT_FIELDS: Record<ApprovalActionType, FieldSpec[]> = {
  email_send: [
    f('subject', 'text', 'subject'),
    f('bodyText', 'multiline', 'bodyText'),
    f('to', 'emails', 'to'),
  ],
  calendar_create: [
    f('title', 'text', 'title'),
    f('startAt', 'datetime', 'startAt'),
    f('endAt', 'datetime', 'endAt'),
    f('location', 'text', 'location', true),
  ],
  calendar_update: [
    f('changes.startAt', 'datetime', 'startAt', true),
    f('changes.endAt', 'datetime', 'endAt', true),
    f('changes.title', 'text', 'title', true),
  ],
  task_create: [f('title', 'text', 'title'), f('dueAt', 'datetime', 'dueAt', true)],
  reminder_create: [f('title', 'text', 'title'), f('remindAt', 'datetime', 'remindAt')],
  commitment_create: [f('text', 'text', 'text'), f('dueText', 'text', 'dueText', true)],
};

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function getPath(obj: Obj, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Immutable set; `undefined` removes the key (used for optional `changes.*` entries). */
export function setPath(obj: Obj, path: string, value: unknown): Obj {
  const [head, ...rest] = path.split('.');
  if (head === undefined) return obj;
  const next: Obj = { ...obj };
  if (rest.length === 0) {
    if (value === undefined) delete next[head];
    else next[head] = value;
    return next;
  }
  const child = isObj(next[head]) ? (next[head] as Obj) : {};
  next[head] = setPath(child, rest.join('.'), value);
  return next;
}

export function participantsToText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((p) => (isObj(p) && typeof p.email === 'string' ? p.email : ''))
    .filter(Boolean)
    .join(', ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses "a@x.com, b@y.com" keeping the display names of addresses that were already in the list. */
export function textToParticipants(text: string, original: unknown): EmailParticipant[] {
  const known = new Map<string, EmailParticipant>();
  if (Array.isArray(original))
    for (const p of original)
      if (isObj(p) && typeof p.email === 'string')
        known.set(p.email.toLowerCase(), {
          email: p.email,
          name: typeof p.name === 'string' ? p.name : null,
        });
  const out: EmailParticipant[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const email = raw.trim();
    if (!email) continue;
    out.push(known.get(email.toLowerCase()) ?? { email, name: null });
  }
  return out;
}

export function isValidEmailList(text: string): boolean {
  const parts = text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => EMAIL_RE.test(p));
}

/** Trims text fields; empty optional fields become null (or disappear from `changes`). */
export function normalizeEdited(type: ApprovalActionType, payload: Obj): Obj {
  let out = payload;
  for (const spec of EDIT_FIELDS[type]) {
    if (spec.kind === 'emails') continue;
    const value = getPath(out, spec.name);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) out = setPath(out, spec.name, trimmed);
      else if (spec.nullable)
        out = setPath(out, spec.name, spec.name.startsWith('changes.') ? undefined : null);
      else out = setPath(out, spec.name, '');
    } else if (value === null && spec.name.startsWith('changes.')) {
      out = setPath(out, spec.name, undefined);
    }
  }
  return out;
}

export type EditValidation =
  { ok: true; payload: Obj } | { ok: false; errors: Record<string, string> };

/** Field-level errors derived from the shared payload schema (same rules the server applies). */
export function validateEditedPayload(
  type: ApprovalActionType,
  payload: Obj,
  t: TFunction,
): EditValidation {
  const normalized = normalizeEdited(type, payload);
  const result = approvalPayloadSchemas[type].safeParse(normalized);
  if (result.success) return { ok: true, payload: result.data as unknown as Obj };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.');
    if (path === '' || path === 'endAt' || path === 'changes.endAt') {
      const key =
        path === ''
          ? type === 'calendar_create'
            ? 'endAt'
            : (EDIT_FIELDS[type][0]?.name ?? 'title')
          : path;
      errors[key] = t('approvals.editEndBeforeStart');
    } else if (path === 'to' || path.startsWith('to.')) {
      errors.to = t('approvals.editEmailInvalid');
    } else if (path === 'changes') {
      errors['changes.title'] = t('approvals.editInvalid');
    } else if (!errors[path]) {
      errors[path] = t('approvals.editInvalid');
    }
  }
  return { ok: false, errors };
}
