import { createI18n } from '@da/i18n';
import type { ApprovalAction } from '@da/domain';
import {
  describePayload,
  failureReasonCopy,
  formatRange,
  isDevicePending,
  isOpenStatus,
  splitApprovals,
  statusTone,
} from '../approvalMeta';
import {
  getPath,
  isValidEmailList,
  normalizeEdited,
  participantsToText,
  setPath,
  textToParticipants,
  validateEditedPayload,
} from '../editPayload';

const t = createI18n('tr').t;
const ctx = {
  locale: 'tr' as const,
  timezone: 'Europe/Istanbul',
  now: new Date('2026-09-05T06:41:00Z'),
};

describe('editPayload paths', () => {
  it('reads and writes dotted paths immutably', () => {
    const base = { changes: { startAt: 'a' }, title: 'x' };
    const next = setPath(base, 'changes.endAt', 'b');
    expect(getPath(next, 'changes.endAt')).toBe('b');
    expect(getPath(next, 'changes.startAt')).toBe('a');
    expect(base).toEqual({ changes: { startAt: 'a' }, title: 'x' });
    expect(getPath(setPath(next, 'changes.startAt', undefined), 'changes.startAt')).toBeUndefined();
  });

  it('round-trips participants and keeps known display names', () => {
    const original = [{ name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' }];
    expect(participantsToText(original)).toBe('ahmet@firma.com');
    expect(textToParticipants('AHMET@firma.com, selin@x.com', original)).toEqual([
      { name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' },
      { name: null, email: 'selin@x.com' },
    ]);
    expect(isValidEmailList('a@b.co; c@d.io')).toBe(true);
    expect(isValidEmailList('')).toBe(false);
    expect(isValidEmailList('nope')).toBe(false);
  });

  it('normalises optional text: empty location → null, empty change → removed', () => {
    expect(normalizeEdited('calendar_create', { title: ' Demo ', location: '   ' })).toEqual({
      title: 'Demo',
      location: null,
    });
    expect(normalizeEdited('calendar_update', { changes: { title: '', startAt: 'x' } })).toEqual({
      changes: { startAt: 'x' },
    });
  });

  it('validates with the shared schema and maps issues to fields', () => {
    const invalid = validateEditedPayload(
      'calendar_create',
      {
        accountId: '00000000-0000-4000-8000-0000000000c1',
        title: 'Toplantı',
        startAt: '2026-09-05T14:00:00.000Z',
        endAt: '2026-09-05T13:00:00.000Z',
      },
      t,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.endAt).toBe('Bitiş, başlangıçtan sonra olmalı.');

    const missing = validateEditedPayload('task_create', { title: '' }, t);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.title).toBe('Bu alanı kontrol et.');

    const ok = validateEditedPayload(
      'reminder_create',
      { title: 'Fatura', remindAt: '2026-09-06T06:00:00.000Z', option: 'custom' },
      t,
    );
    expect(ok.ok).toBe(true);
  });
});

describe('approvalMeta', () => {
  it('describes payloads with labelled lines that follow edits', () => {
    const lines = describePayload(
      'calendar_create',
      {
        title: 'Başvuru',
        startAt: '2026-09-05T13:30:00.000Z',
        endAt: '2026-09-05T14:00:00.000Z',
        location: 'Online',
      },
      ctx,
      t,
    );
    expect(lines[0]).toBe('Başlık: Başvuru');
    expect(lines[1]).toBe('Ne zaman: Bugün 16:30–17:00');
    expect(lines[2]).toBe('Yer: Online');
    expect(describePayload('task_create', { title: 'Görev', dueAt: null }, ctx, t)[1]).toBe(
      'Son tarih: Tarih yok',
    );
  });

  it('formats ranges across days', () => {
    expect(formatRange('2026-09-05T20:00:00.000Z', '2026-09-06T06:00:00.000Z', ctx, t)).toBe(
      'Bugün 23:00 – Yarın 09:00',
    );
  });

  it('maps failure reasons to calm copy', () => {
    expect(failureReasonCopy('connection_expired', t)).toBe('Hesap bağlantısının süresi dolmuş.');
    expect(failureReasonCopy('Sağlayıcı geçici olarak yanıt vermedi.', t)).toBe(
      'Sağlayıcı geçici olarak yanıt vermedi.',
    );
    expect(failureReasonCopy('weird_code', t)).toBe('Beklenmeyen bir hata oluştu.');
    expect(failureReasonCopy(null, t)).toBe('Beklenmeyen bir hata oluştu.');
  });

  it('classifies statuses', () => {
    expect(isOpenStatus('executing')).toBe(true);
    expect(isOpenStatus('failed')).toBe(false);
    expect(statusTone('executed')).toBe('success');
    expect(statusTone('failed')).toBe('critical');
    expect(isDevicePending({ status: 'executing', executionResult: { handler: 'device' } })).toBe(
      true,
    );
    expect(isDevicePending({ status: 'executed', executionResult: { handler: 'device' } })).toBe(
      false,
    );
  });

  it('splits pending from history and sorts newest first', () => {
    const base = {
      createdAt: '2026-09-05T05:00:00.000Z',
      updatedAt: '2026-09-05T05:00:00.000Z',
    } as ApprovalAction;
    const list: ApprovalAction[] = [
      { ...base, id: 'a', status: 'pending' },
      { ...base, id: 'b', status: 'executed', updatedAt: '2026-09-05T07:00:00.000Z' },
      { ...base, id: 'c', status: 'executing', createdAt: '2026-09-05T06:00:00.000Z' },
      { ...base, id: 'd', status: 'rejected', updatedAt: '2026-09-05T06:30:00.000Z' },
    ];
    const { pending, history } = splitApprovals(list);
    expect(pending.map((a) => a.id)).toEqual(['c', 'a']);
    expect(history.map((a) => a.id)).toEqual(['b', 'd']);
  });
});
