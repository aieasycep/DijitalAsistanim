import { describe, expect, it } from 'vitest';
import type { SourceRef } from '@da/domain';
import {
  commitmentDedupeKey,
  detectVocativeName,
  extractCommitments,
  normalizeCommitmentText,
  normalizeNounPhrase,
  stripMailSignature,
  toCommitmentDraft,
  turkishAccusative,
  type CommitmentCandidate,
  type ExtractCommitmentsInput,
} from './index';

// Friday 4 September 2026, 08:42 in Istanbul (UTC+3)
const now = '2026-09-04T05:42:00.000Z';
const tz = 'Europe/Istanbul';

function run(text: string, partial: Partial<ExtractCommitmentsInput> & { authorIsUser: boolean; name?: string | null }): CommitmentCandidate[] {
  const { name, ...rest } = partial;
  return extractCommitments({ text, now, timezone: tz, counterpartHint: name ? { name } : null, ...rest });
}

function only(text: string, partial: Partial<ExtractCommitmentsInput> & { authorIsUser: boolean; name?: string | null }): CommitmentCandidate {
  const r = run(text, partial);
  expect(r, `expected exactly one commitment in "${text}"`).toHaveLength(1);
  return r[0] as CommitmentCandidate;
}

const SEED_AHMET_MAIL =
  "Merhaba Yunus,\n\nDünkü görüşmemize istinaden revize fiyat teklifini bugün saat 17:00'ye kadar PDF formatında iletebilir misin? Yönetim toplantısında sunacağım.\n\nTeşekkürler,\nAhmet Yılmaz\nSatın Alma Müdürü · Firma A.Ş.";
const SEED_SENT_MAIL = 'Merhaba Mehmet Bey,\n\nGüncellenmiş teklifimizi (v2) ekte iletiyorum. Geri bildiriminizi bekliyorum.\n\nSaygılarımla,\nYunus';

describe('commitments · the user promises (Turkish)', () => {
  it('future 1sg with a dative counterpart and a relative due date', () => {
    const c = only("Mehmet'e yarın teklif göndereceğim.", { authorIsUser: true, name: 'Mehmet Yılmaz' });
    expect(c.text).toBe("Mehmet'e teklif gönder");
    expect(c.direction).toBe('user_owes');
    expect(c.counterpartName).toBe('Mehmet Yılmaz');
    expect(c.due?.iso).toBe('2026-09-05T15:00:00.000Z'); // "yarın" → end of working day (18:00 local)
    expect(c.due?.hasTime).toBe(false);
    expect(c.dueText).toBe('yarın');
    expect(c.quote).toBe("Mehmet'e yarın teklif göndereceğim.");
    expect(c.evidence).toContain('göndereceğim');
    expect(c.verb).toBe('gönder');
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
    expect(c.confidence).toBeLessThanOrEqual(0.95);
  });
  it('aorist forms over several sentences: "Selin\'i yarın ararım. Dosyayı Cuma paylaşırım."', () => {
    const r = run("Selin'i yarın ararım. Dosyayı Cuma paylaşırım.", { authorIsUser: true });
    expect(r.map((c) => c.text)).toEqual(["Selin'i ara", 'Dosyayı paylaş']);
    expect(r[0]?.counterpartName).toBe('Selin');
    expect(r[0]?.due?.localDate).toBe('2026-09-05');
    expect(r[1]?.counterpartName).toBeNull();
    expect(r[1]?.due?.iso).toBe('2026-09-04T15:00:00.000Z');
    expect(r[1]?.dueText).toBe('Cuma');
    expect(r.every((c) => c.direction === 'user_owes' && c.form === 'aorist')).toBe(true);
  });
  it('deadline cue "10 Eylül\'e kadar" and the hint counterpart in the verb\'s case', () => {
    const c = only("Kontrol edip 10 Eylül'e kadar size döneceğim.", { authorIsUser: true, name: 'Ahmet' });
    expect(c.text).toBe("Ahmet'e kontrol edip dön");
    expect(c.due?.iso).toBe('2026-09-10T15:00:00.000Z');
    expect(c.dueText).toBe("10 Eylül'e");
    expect(c.due?.evidence).toContain("10 Eylül'e kadar");
  });
  it('splits "ve" clauses when both carry a verb form; "bu akşam" keeps its clock time', () => {
    const r = run("Bu akşam sözleşmeyi imzalayacağım ve Pazartesi Mehmet'e ileteceğim.", { authorIsUser: true });
    expect(r.map((c) => c.text)).toEqual(['Sözleşmeyi imzala', "Mehmet'e ilet"]);
    expect(r[0]?.due?.iso).toBe('2026-09-04T16:00:00.000Z');
    expect(r[0]?.due?.hasTime).toBe(true);
    expect(r[1]?.counterpartName).toBe('Mehmet');
    expect(r[1]?.due?.localDate).toBe('2026-09-07');
  });
  it('uses the vocative, the topic and the hint\'s full name; the sign-off is ignored', () => {
    const c = only('Merhaba Mehmet Bey,\n\nTamam, yarın göndereceğim.\n\nSaygılarımla,\nYunus', { authorIsUser: true, name: 'Mehmet Yılmaz', topic: 'Teklif v2' });
    expect(c.text).toBe("Mehmet'e teklif v2 gönder");
    expect(c.counterpartName).toBe('Mehmet Yılmaz');
    expect(c.quote).toBe('Tamam, yarın göndereceğim.');
  });
  it('"Raporu Mehmet\'e göndereceğim": the object is not mistaken for a two-word name', () => {
    const c = only("Raporu Mehmet'e göndereceğim.", { authorIsUser: true });
    expect(c.text).toBe("Mehmet'e raporu gönder");
    expect(c.counterpartName).toBe('Mehmet');
  });
  it('polite hedges do not cancel a commitment; intensifiers raise confidence', () => {
    const hedged = only('Mümkün olursa yarın göndereceğim.', { authorIsUser: true, name: 'Ahmet' });
    expect(hedged.text).toBe("Ahmet'e gönder");
    const plain = only('Yarına kadar göndereceğim.', { authorIsUser: true, name: 'Ahmet' });
    const strong = only('Kesinlikle yarına kadar göndereceğim, söz.', { authorIsUser: true, name: 'Ahmet' });
    expect(strong.confidence).toBeGreaterThan(plain.confidence);
  });
  it('the seed sent mail: "ekte iletiyorum" is not a promise, "geri bildiriminizi bekliyorum" is an expectation', () => {
    const r = run(SEED_SENT_MAIL, { authorIsUser: true, name: 'Mehmet Yılmaz' });
    expect(r).toHaveLength(1);
    expect(r[0]?.direction).toBe('other_owes');
    expect(r[0]?.text).toBe('Mehmet geri bildirim verecek');
    expect(r[0]?.counterpartName).toBe('Mehmet Yılmaz');
    expect(r[0]?.form).toBe('expectation');
    expect(r[0]?.due).toBeNull();
  });
});

describe('commitments · the other party promises or asks', () => {
  it('seed reply "hafta içinde dönüş yapacağım" → other_owes due this Friday', () => {
    const c = only('Teşekkürler, hafta içinde dönüş yapacağım.', { authorIsUser: false, name: 'Mehmet Yılmaz' });
    expect(c.text).toBe('Mehmet dönüş yapacak');
    expect(c.direction).toBe('other_owes');
    expect(c.counterpartName).toBe('Mehmet Yılmaz');
    expect(c.due?.iso).toBe('2026-09-04T15:00:00.000Z');
    expect(c.dueText).toBe('hafta içinde');
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
  });
  it('seed request mail from Ahmet → user_owes with today 17:00; his own "sunacağım" is not a promise to the user', () => {
    const c = only(SEED_AHMET_MAIL, { authorIsUser: false, name: 'Ahmet Yılmaz' });
    expect(c.direction).toBe('user_owes');
    expect(c.text).toBe("Ahmet'e revize fiyat teklifini PDF formatında ilet");
    expect(c.counterpartName).toBe('Ahmet Yılmaz');
    expect(c.due?.iso).toBe('2026-09-04T14:00:00.000Z');
    expect(c.due?.hasTime).toBe(true);
    expect(c.dueText).toBe("bugün saat 17:00'ye");
    expect(c.form).toBe('request');
    expect(c.quote).toContain('iletebilir misin');
  });
  it('falls back to the sign-off name when no hint is given', () => {
    const c = only(SEED_AHMET_MAIL, { authorIsUser: false });
    expect(c.counterpartName).toBe('Ahmet Yılmaz');
  });
  it('request forms: rica ederim / -rseniz sevinirim / lütfen + imperative', () => {
    expect(only('Göndermenizi rica ederim.', { authorIsUser: false, name: 'Ahmet Yılmaz' }).text).toBe("Ahmet'e gönder");
    const cond = only('Belgeleri gönderirseniz sevinirim.', { authorIsUser: false, name: 'Ahmet Yılmaz' });
    expect(cond.text).toBe("Ahmet'e belgeleri gönder");
    expect(cond.direction).toBe('user_owes');
    const imp = only('Lütfen belgeleri bana gönderin.', { authorIsUser: true, name: 'Ahmet' });
    expect(imp.text).toBe('Ahmet belgeleri gönderecek');
    expect(imp.direction).toBe('other_owes');
    expect(imp.form).toBe('imperative');
  });
  it('"cevabınızı bekliyorum" from the counterpart → the user owes a reply', () => {
    const c = only('Cevabınızı en kısa sürede bekliyorum.', { authorIsUser: false, name: 'Ahmet Yılmaz' });
    expect(c.text).toBe("Ahmet'e cevap ver");
    expect(c.direction).toBe('user_owes');
    expect(c.form).toBe('expectation');
  });
  it('the counterpart\'s plans count only when directed at the user, dated or about a deliverable', () => {
    expect(run('Yönetim toplantısında sunacağım.', { authorIsUser: false, name: 'Ahmet Yılmaz' })).toHaveLength(0);
    expect(only('Sizi arayacağım.', { authorIsUser: false, name: 'Ahmet Yılmaz' }).text).toBe('Ahmet sizi arayacak');
    expect(only('Toplantıdan sonra size döneceğim.', { authorIsUser: false, name: 'Mehmet Yılmaz' }).text).toBe('Mehmet size dönecek');
    expect(only('Konuya bakacağım.', { authorIsUser: false, name: 'Ahmet Yılmaz' }).text).toBe('Ahmet konuya bakacak');
  });
});

describe('commitments · false positives', () => {
  it('negations', () => {
    expect(run('Raporu göndermeyeceğim.', { authorIsUser: true })).toHaveLength(0);
    expect(run('Maalesef yarın gelemeyeceğim.', { authorIsUser: true })).toHaveLength(0);
    expect(run("I won't be able to send it.", { authorIsUser: true })).toHaveLength(0);
    expect(run('I will not send the file.', { authorIsUser: true })).toHaveLength(0);
  });
  it('conditionals', () => {
    expect(run('Gönderirsem haber veririm.', { authorIsUser: true })).toHaveLength(0);
    expect(run('Eğer onaylarsanız yarın başlarım.', { authorIsUser: true })).toHaveLength(0);
    expect(run('If you send the invoice, I will pay it tomorrow.', { authorIsUser: true })).toHaveLength(0);
  });
  it('questions and optatives', () => {
    expect(run('Göndereyim mi?', { authorIsUser: true })).toHaveLength(0);
    expect(run('Yarın gelecek misin?', { authorIsUser: true, name: 'Ali' })).toHaveLength(0);
    expect(run('Did you send the file?', { authorIsUser: true, name: 'Selin' })).toHaveLength(0);
    expect(run('Raporu yarın gönderelim.', { authorIsUser: true })).toHaveLength(0);
  });
  it('closings, generic statements and transactional text', () => {
    for (const text of ['Görüşürüz.', 'Yarın görüşürüz.', 'Teşekkür ederim, iyi çalışmalar dilerim.', 'Bakarız.', 'Siparişiniz kargoya verildi.', 'Saygılarımı sunarım.', 'Please find attached the report.', "I'll be there at 10.", 'Toplam 1.842,50 TL ödendi.']) {
      expect(run(text, { authorIsUser: true }), text).toHaveLength(0);
    }
  });
  it('quoted history and signatures are ignored', () => {
    const r = run('Tamam, yarın göndereceğim.\n\nOn Fri, Sep 4 Ahmet wrote:\n> Raporu yarın gönderir misin?\n> Teşekkürler', { authorIsUser: true, name: 'Ahmet' });
    expect(r).toHaveLength(1);
    expect(r[0]?.direction).toBe('user_owes');
    const tr = run('Olur, Cuma iletirim.\n\n4 Eyl 2026 tarihinde Ahmet şunu yazdı:\n> Belgeleri iletebilir misin?', { authorIsUser: true, name: 'Ahmet' });
    expect(tr).toHaveLength(1);
    expect(tr[0]?.text).toBe("Ahmet'e ilet");
  });
  it('empty text, invalid reference instant and bounded output', () => {
    expect(run('', { authorIsUser: true })).toHaveLength(0);
    expect(extractCommitments({ text: 'Yarın göndereceğim.', authorIsUser: true, now: 'not-a-date', timezone: tz })).toHaveLength(0);
    const names = ['Ali', 'Veli', 'Ayşe', 'Fatma', 'Can', 'Deniz', 'Ece', 'Efe', 'Gül', 'Hakan', 'Işıl', 'Kaan'];
    const many = names.map((n) => `${n}'e yarın teklif göndereceğim.`).join(' ');
    expect(run(many, { authorIsUser: true }).length).toBeLessThanOrEqual(8);
  });
});

describe('commitments · English', () => {
  it('"I\'ll send you the proposal tomorrow" binds "you" to the hint', () => {
    const c = only("I'll send you the proposal tomorrow.", { authorIsUser: true, name: 'Mehmet Yılmaz', locale: 'en' });
    expect(c.text).toBe('Send the proposal to Mehmet');
    expect(c.counterpartName).toBe('Mehmet Yılmaz');
    expect(c.due?.localDate).toBe('2026-09-05');
    expect(c.dueText).toBe('tomorrow');
    expect(c.language).toBe('en');
  });
  it('a promise and a request in one mail, EOD deadline, vocative + sign-off', () => {
    const r = run("Hi Selin,\n\nI'll get back to you on Monday with the numbers. Could you please send me the signed contract by EOD?\n\nBest,\nYunus", {
      authorIsUser: true,
      name: 'Selin Kaya',
      locale: 'en',
    });
    expect(r.map((c) => [c.text, c.direction])).toEqual([
      ['Get back to Selin', 'user_owes'],
      ['Selin will send the signed contract', 'other_owes'],
    ]);
    expect(r[0]?.due?.localDate).toBe('2026-09-07');
    expect(r[1]?.due?.iso).toBe('2026-09-04T15:00:00.000Z');
    expect(r[1]?.dueText).toBe('EOD');
    expect(r[1]?.counterpartName).toBe('Selin Kaya');
  });
  it('"and" clauses inherit the subject: "We\'ll review the draft and let you know by Friday."', () => {
    const r = run("We'll review the draft and let you know by Friday.", { authorIsUser: false, name: 'John Smith', locale: 'en' });
    expect(r.map((c) => c.text)).toEqual(['John will review the draft', 'John will let you know']);
    expect(r[1]?.due?.localDate).toBe('2026-09-04');
    expect(r.every((c) => c.direction === 'other_owes')).toBe(true);
  });
  it('a named counterpart inside the clause and a clock time', () => {
    const c = only('I will call Mehmet tomorrow morning.', { authorIsUser: true, locale: 'en' });
    expect(c.text).toBe('Call Mehmet');
    expect(c.counterpartName).toBe('Mehmet');
    expect(c.due?.iso).toBe('2026-09-05T06:00:00.000Z');
    expect(c.due?.hasTime).toBe(true);
  });
  it('"waiting for your reply" and "can you share …" requests', () => {
    const wait = only('I am waiting for your reply.', { authorIsUser: false, name: 'John', locale: 'en' });
    expect(wait.text).toBe('Reply to John');
    expect(wait.direction).toBe('user_owes');
    const share = only('Can you share the file by Friday?', { authorIsUser: true, name: 'Selin', locale: 'en' });
    expect(share.text).toBe('Selin will share the file');
    expect(share.direction).toBe('other_owes');
    expect(share.dueText).toBe('Friday');
  });
});

describe('commitments · helpers', () => {
  it('normalizeCommitmentText composes the imperative from a verbatim quote', () => {
    expect(normalizeCommitmentText('yarın göndereceğim', 'Mehmet Yılmaz', 'tr', { topic: 'Teklif v2' })).toBe("Mehmet'e teklif v2 gönder");
    expect(normalizeCommitmentText('hafta içinde dönüş yapacağım', 'Mehmet Yılmaz', 'tr', { direction: 'other_owes' })).toBe('Mehmet dönüş yapacak');
    expect(normalizeCommitmentText("Selin'i yarın ararım.", null, 'tr')).toBe("Selin'i ara");
    expect(normalizeCommitmentText("I'll send it tomorrow", 'Mehmet Yılmaz', 'en')).toBe('Send it to Mehmet');
    expect(normalizeCommitmentText('bilmem ne', 'Mehmet Yılmaz', 'tr')).toBe('Bilmem ne');
    expect(normalizeCommitmentText('', null)).toBe('');
  });
  it('commitmentDedupeKey is stable and distinguishes direction and due date', () => {
    const c = only("Mehmet'e yarın teklif göndereceğim.", { authorIsUser: true, name: 'Mehmet Yılmaz' });
    const key = commitmentDedupeKey(c, 'msg-1');
    expect(key).toMatch(/^commit:msg-1:user_owes:[0-9a-f]{8}$/);
    expect(commitmentDedupeKey(c, 'msg-1')).toBe(key);
    expect(commitmentDedupeKey({ ...c, text: "MEHMET'E TEKLİF GÖNDER" }, 'msg-1')).toBe(key);
    expect(commitmentDedupeKey({ ...c, direction: 'other_owes' }, 'msg-1')).not.toBe(key);
    expect(commitmentDedupeKey({ ...c, due: null }, 'msg-1')).not.toBe(key);
    expect(commitmentDedupeKey(c, 'msg-2')).not.toBe(key);
  });
  it('toCommitmentDraft maps the candidate onto the Commitment row shape', () => {
    const c = only("Mehmet'e yarın teklif göndereceğim.", { authorIsUser: true, name: 'Mehmet Yılmaz' });
    const source: SourceRef = { type: 'meeting_note', id: 'n1', label: 'Toplantı notu', person: 'Mehmet Yılmaz', timestamp: now };
    const draft = toCommitmentDraft(c, source);
    expect(draft).toMatchObject({
      text: "Mehmet'e teklif gönder",
      quote: "Mehmet'e yarın teklif göndereceğim.",
      direction: 'user_owes',
      counterpartName: 'Mehmet Yılmaz',
      counterpartContactId: null,
      dueAt: '2026-09-05T15:00:00.000Z',
      dueText: 'yarın',
      status: 'open',
      source,
      completedAt: null,
      postponedUntil: null,
      relatedEventId: null,
    });
    const weak = only('Belgeleri gönderirseniz sevinirim.', { authorIsUser: false, name: 'Ahmet Yılmaz' });
    expect(toCommitmentDraft(weak, source).status).toBe('proposed');
  });
  it('Turkish morphology helpers', () => {
    expect(turkishAccusative('teklif')).toBe('teklifi');
    expect(turkishAccusative('dosya')).toBe('dosyayı');
    expect(turkishAccusative('rapor')).toBe('raporu');
    expect(turkishAccusative('sözleşme')).toBe('sözleşmeyi');
    expect(normalizeNounPhrase('cevabınızı')).toBe('cevap');
    expect(normalizeNounPhrase('Geri bildiriminizi')).toBe('geri bildirim');
    expect(normalizeNounPhrase('dönüşünüzü')).toBe('dönüş');
    expect(normalizeNounPhrase('kalite')).toBe('kalite');
  });
  it('signature stripping and vocative detection', () => {
    const s = stripMailSignature('Yarın göndereceğim.\n\nSaygılarımla,\nAhmet Yılmaz\nSatın Alma Müdürü');
    expect(s.body).toBe('Yarın göndereceğim.');
    expect(s.signatureName).toBe('Ahmet Yılmaz');
    expect(stripMailSignature('Olur.\n--\nYunus Emre').body).toBe('Olur.');
    expect(stripMailSignature('Tamam.\n\nSent from my iPhone').body).toBe('Tamam.');
    expect(detectVocativeName('Merhaba Mehmet Bey,\n\nTamam.')).toBe('Mehmet');
    expect(detectVocativeName('Yunus merhaba,\nolur.')).toBe('Yunus');
    expect(detectVocativeName('Sayın Selin Kaya,')).toBe('Selin Kaya');
    expect(detectVocativeName('Hi Selin,')).toBe('Selin');
    expect(detectVocativeName('Merhaba,\n\nTamam.')).toBeNull();
    expect(detectVocativeName('Yarın göndereceğim.')).toBeNull();
  });
});
