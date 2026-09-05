/**
 * Turkish clause analysis for commitments: which verb form anchors the clause (first-person future /
 * aorist, second-person request, "… bekliyorum" expectation), what the object phrase is and which
 * counterpart is named in the clause. Negated, conditional, optative and question forms are rejected.
 */
import { extractDates, lowercasePreservingIndices, turkishDative, type ExtractedDate } from '../dates';
import {
  ET_COMPOUNDS,
  NOUN_TO_VERB,
  RE_EXPECTATION,
  RE_FIRST_PERSON_FORMS,
  RE_GENERIC_FUTURE,
  RE_PLEASED,
  RE_POLITE,
  RE_REQUEST_CONDITIONAL,
  RE_REQUEST_IMPERATIVE,
  RE_REQUEST_NEED,
  RE_REQUEST_QUESTION,
  RE_REQUEST_VERBAL_NOUN,
  VERBS,
  counterpartCaseFor,
  futureThird,
  imperativeFromStem,
  isOptativeForm,
  lookupFirstPerson,
  lookupImperative,
  lookupRequestStem,
  lookupVerbalNoun,
  type CounterpartCase,
} from './verbs';
import { NAME_STOPLIST, isNameToken, type ClauseAnalysis, type ClauseName, type AnalyzeOptions } from './shared';

const FILLERS = new Set(
  [
    'ben', 'biz', 'de', 'da', 'sana', 'size', 'bana', 'bize', 'seninle', 'sizinle', 'senden', 'sizden', 'ayrıca', 'mutlaka', 'kesinlikle', 'hemen', 'tekrar',
    'yine', 'inşallah', 'söz', 'tabii', 'tabi', 'tamam', 'peki', 'evet', 'olur', 'artık', 'şimdi', 'birazdan', 'sonra', 'önce', 'ilk', 'en', 'kısa', 'sürede',
    'zamanda', 'geç', 'bir', 'an', 'bu', 'arada', 'o', 'zaman', 've', 'ama', 'fakat', 'ancak', 'lütfen', 'ise', 'bile', 'zaten', 'elbette', 'kesin',
    'muhakkak', 'mümkünse', 'olursa', 'olabilirse', 'belki', 'gerekirse', 'acaba', 'rica', 'kadar', 'dek', 'değin', 'içinde', 'içerisinde', 'itibaren',
    'itibariyle', 'saat', 'sabah', 'öğlen', 'akşam', 'gece', 'sabaha', 'akşama', 'öğlene', 'günü', 'gününe', 'günün', 'tarafıma', 'tarafımıza', 'tarafınıza',
    'tarafına', 'mümkün', 'en geç', 'bugünden', 'yarından', 'da', 'de', 'ki', 'hâlâ', 'hala', 'kendim', 'kendimiz', 'bizzat', 'şahsen', 'ekte', 'ekli',
    'sizinle', 'seninle', 'ilgili', 'için', 'sizler', 'sizlere', 'sizlerle', 'siz', 'sen', 'ilgilenip', 'olarak', 'garanti',
  ].map((w) => w.replace(/ı/g, 'i')),
);

const RE_CLOSING = /^(?:saygılar(?:ımla|ımızla|ımızı sunarız|ımı sunarım)?|sevgiler(?:imle|imizle)?|iyi çalışmalar|iyi günler|iyi akşamlar|iyi haftalar|iyi hafta sonları|teşekkürler|teşekkür eder(?:im|iz)|çok teşekkür(?:ler| ederim| ederiz)|rica eder(?:im|iz)|görüşmek üzere|kolay gelsin|hoşça kal(?:ın)?|bilgi(?:leri)?nize (?:sunar(?:ım|ız)|arz eder(?:im|iz))|umarım[^.!?]*|sanırım|görüşürüz|yakında görüşürüz|haber(?:leş|leşi)r(?:iz|im))[.!,]?$/u;
const RE_STRONG = /(?<![\p{L}])(?:söz|kesinlikle|mutlaka|muhakkak|kesin|garanti)(?![\p{L}])/u;
const RE_QUESTION_PARTICLE = /(?<![\p{L}])m[iıuü](?:y[iı]m|y[iı]z|s[iı]n(?:[iı]z)?)?(?![\p{L}])/u;
const RE_IF = /(?<![\p{L}])(?:eğer|şayet)(?![\p{L}])/u;
const RE_COND_AORIST = /(?<![\p{L}])(?!(?:bursa|arsa|kursa|parsa|farsa)(?![\p{L}]))\p{L}{2,}(?:[iıuü]r|[ae]r|bilir)s[ae](?:m|k|n[iı]z|n)?(?![\p{L}'’])/u;
/** Polite hedges that look conditional but do not cancel the commitment ("mümkün olursa yarın göndereceğim"). */
const RE_HEDGES = /(?<![\p{L}])(?:mümkün(?:se)?\s+olursa|olursa|olursam|olmazsa|gerekirse|isterseniz|istersen|isterse|uygunsa|uygun olursa|müsaitseniz|müsaitsen|müsaitse|vakit bulursam|fırsat bulursam|yetişirse|olabilirse)(?![\p{L}])/gu;
const RE_PLAIN_COND = new RegExp(
  `(?<![\\p{L}])(?:${VERBS.map((v) => v.head.replace(/ı/g, '[iı]')).join('|')})(?:y[ae]|s[ae])(?:m|k|n[iı]z|n)?(?![\\p{L}])`,
  'u',
);
const NEUTRAL_FUTURE_STEMS = new Set(['ol', 'kal', 'dur', 'bil', 'san', 'iste', 'istey', 'um', 'bekley', 'bekle', 'de', 'diy']);

/** "Mehmet'e", "Ayşe'ye", "Selin'i", "Mehmet Bey'e", "Mehmet ile", "Ali'yle", "Mehmet'ten". */
const RE_COUNTERPART = /(?<name>\p{Lu}\p{Ll}+(?:\s+(?!(?:Bey|Hanım|Abi|Abla|Hoca|Hocam)(?![\p{Ll}]))\p{Lu}\p{Ll}+)?)(?:\s+(?<hon>Bey|Hanım|Abi|Abla|Hoca|Hocam))?(?:(?<apo>['’])(?<suf>y?[ae]|n?[ıiuü]|yl[ae]|l[ae]|[dt][ae]n|nd[ae]n)|\s+(?<ile>ile))(?![\p{L}])/gu;

function normWord(w: string): string {
  return lowercasePreservingIndices(w)
    .replace(/[^\p{L}\p{N}']/gu, '')
    .replace(/ı/g, 'i');
}

function stripDatesAndFillers(text: string, dates: ExtractedDate[]): string {
  let out = text;
  for (const d of [...dates].sort((a, b) => b.start - a.start)) out = `${out.slice(0, d.start)} ${out.slice(d.end)}`;
  return out
    .replace(/(?<![\p{L}])(?:'?(?:y?[ae]|n?d[ae]n|d[ae]n|t[ae]n)\s+)?(?:kadar|dek|değin)(?![\p{L}])/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])['’](?:y?[ae]|n?d[ae]n|d[ae]n|t[ae]n|d[ae]|t[ae])(?![\p{L}])/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w && !FILLERS.has(normWord(w)))
    .join(' ')
    .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/gu, '')
    .replace(/\s+,/gu, ',')
    .trim();
}

function findClauseNames(clause: string, dates: ExtractedDate[], hintFirstName: string | null): ClauseName[] {
  const out: ClauseName[] = [];
  const hint = hintFirstName?.toLocaleLowerCase('tr-TR') ?? null;
  RE_COUNTERPART.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_COUNTERPART.exec(clause)) !== null) {
    const matched = m.groups?.name ?? '';
    if (!matched) continue;
    let start = m.index;
    const end = m.index + m[0].length;
    let tokens = matched.split(/\s+/u);
    const withIle = Boolean(m.groups?.ile);
    // A greedy two-token match may have swallowed a preceding date word, stoplist word or object noun
    // ("Pazartesi Mehmet'e", "Raporu Mehmet'e"): keep only the token next to the suffix in that case.
    if (tokens.length === 2) {
      const first = tokens[0] ?? '';
      const firstEnd = start + first.length;
      const firstLower = first.toLocaleLowerCase('tr-TR');
      const overlapsDate = dates.some((d) => start < d.end && firstEnd > d.start);
      const isFirstWord = clause.slice(0, start).trim().length === 0;
      const looksLikeObject = isFirstWord && hint !== firstLower && /[ıiuü]$/u.test(firstLower);
      if (overlapsDate || !isNameToken(first) || looksLikeObject) {
        start = start + matched.length - (tokens[1] ?? '').length;
        tokens = tokens.slice(1);
      }
    }
    const name = tokens.join(' ');
    if (dates.some((d) => start < d.end && end > d.start)) continue;
    if (!tokens.every((t) => isNameToken(t))) continue;
    const first = tokens[0] ?? '';
    const isFirstWord = clause.slice(0, start).trim().length === 0;
    // "X ile" at the very start could be a capitalized common noun ("Ekip ile …") unless it matches the hint.
    if (withIle && isFirstWord && hint !== null && first.toLocaleLowerCase('tr-TR') !== hint) continue;
    if (NAME_STOPLIST.has(first.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i'))) continue;
    out.push({ name, phrase: clause.slice(start, end).trim(), start, end, kase: caseOfSuffix(m.groups?.suf, withIle) });
  }
  return out;
}

const RE_INTERJECTION = /^\s*(?:(?:çok\s+)?teşekkürler|(?:çok\s+)?teşekkür ederi[mz]|tamam(?:dır)?|peki|olur|evet|anlaşıldı|not aldım|not ettim|merhaba|selam|tabii(?: ki)?|tabi(?: ki)?|elbette|kesinlikle|harika|süper|ok|okey|memnuniyetle|sorun değil|rica ederim|sağ ol(?:un)?|bilgi(?:niz)? için teşekkürler|söz|mutlaka)\s*[,!.;:]?\s*/iu;
const RE_LEADING_ADVERBIAL = /^.*?(?<![\p{L}])(?:istinaden|ilişkin|dair|binaen|nazaran|itibaren|göre|üzere|için|sonrasında|öncesinde|ardından|sonra|önce)(?![\p{L}])[,\s]*/u;

function stripLeadIns(source: string): string {
  let s = source;
  for (let i = 0; i < 3; i++) {
    const next = s.replace(RE_INTERJECTION, '');
    if (next === s) break;
    s = next;
  }
  const withoutAdverbial = s.replace(RE_LEADING_ADVERBIAL, '');
  return withoutAdverbial.trim() ? withoutAdverbial : s;
}

function caseOfSuffix(suf: string | undefined, ile: boolean): CounterpartCase {
  if (ile) return 'ile';
  if (!suf) return 'none';
  if (/^y?[ae]$/u.test(suf)) return 'dat';
  if (/^n?[ıiuü]$/u.test(suf)) return 'acc';
  if (/^y?l[ae]$/u.test(suf)) return 'ile';
  return 'none';
}

function buildObject(source: string, dates: ExtractedDate[], removeSpan: { start: number; end: number } | null, lemma: string): string {
  let text = source;
  if (removeSpan && removeSpan.end <= source.length) text = `${text.slice(0, removeSpan.start)} ${' '.repeat(removeSpan.end - removeSpan.start - 1)}${text.slice(removeSpan.end)}`;
  const localDates = dates.filter((d) => d.end <= source.length);
  const lead = text.length - stripLeadIns(text).length;
  text = `${' '.repeat(lead)}${text.slice(lead)}`;
  let obj = stripDatesAndFillers(text, localDates);
  const compoundNoun = lemma.includes(' ') ? (lemma.split(' ')[0] ?? '') : null;
  if (compoundNoun) obj = obj.replace(new RegExp(`(?:^|\\s)${compoundNoun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'iu'), '').trim();
  return obj.replace(/^[-–•*]\s*/u, '').replace(/^["“”']+|["“”']+$/gu, '').trim();
}

function lastWord(clause: string): string {
  const words = lowercasePreservingIndices(clause)
    .replace(/[?!.,;:]+\s*$/u, '')
    .trim()
    .split(/\s+/u);
  let w = words[words.length - 1] ?? '';
  if (/^m[iıuü]$/u.test(w) && words.length > 1) w = words[words.length - 2] ?? '';
  return w;
}

const ACC_BUFFER = new Set(['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü']);

/** "teklif" → "teklifi", "rapor" → "raporu", "dosya" → "dosyayı", "sözleşme" → "sözleşmeyi". */
export function turkishAccusative(word: string): string {
  const w = word.trim();
  if (!w) return w;
  const lower = w.toLocaleLowerCase('tr-TR');
  let v = 'i';
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i] ?? '';
    if ('aı'.includes(ch)) {
      v = 'ı';
      break;
    }
    if ('ei'.includes(ch)) {
      v = 'i';
      break;
    }
    if ('ou'.includes(ch)) {
      v = 'u';
      break;
    }
    if ('öü'.includes(ch)) {
      v = 'ü';
      break;
    }
  }
  const buffer = ACC_BUFFER.has(lower.slice(-1)) ? 'y' : '';
  return `${w}${buffer}${v}`;
}

/** Counterpart phrase in the case the verb requires: "Mehmet'e", "Mehmet'i", "Mehmet ile". */
export function counterpartPhrase(name: string, kase: CounterpartCase): string {
  switch (kase) {
    case 'dat':
      return turkishDative(name);
    case 'acc':
      return `${name}'${turkishAccusative(`x${name.toLocaleLowerCase('tr-TR')}`).slice(1 + name.length)}`;
    case 'ile':
      return `${name} ile`;
    case 'none':
      return '';
  }
}

const KNOWN_NOUNS = new Set([
  'teklif', 'rapor', 'dosya', 'dönüş', 'cevap', 'yanıt', 'onay', 'haber', 'bilgi', 'bildirim', 'belge', 'sözleşme', 'fatura', 'ödeme', 'fiyat', 'liste', 'plan',
  'taslak', 'sunum', 'doküman', 'döküman', 'çizim', 'görsel', 'fotoğraf', 'form', 'imza', 'kayıt', 'karar', 'görüş', 'yorum', 'not', 'özet', 'program',
  'takvim', 'adres', 'numara', 'link', 'bağlantı', 'ek', 'dekont', 'makbuz', 'revizyon', 'tarih', 'teyit', 'bilgilendirme', 'açıklama', 'güncelleme',
  'katalog', 'broşür', 'numune', 'ölçü', 'mail', 'mesaj', 'davet', 'referans', 'öneri', 'teklifler', 'belgeler', 'dosyalar', 'raporlar', 'evrak', 'evraklar',
  'ödemeler', 'geri bildirim', 'geri dönüş', 'dönüşler', 'cevaplar', 'yanıtlar', 'sonuç', 'sonuçlar', 'çıktı', 'çıktılar', 'proje', 'çalışma', 'sipariş',
  'ürün', 'ürünler', 'imzalı', 'anket', 'başvuru', 'kontrat', 'protokol', 'tasarım', 'logo', 'video', 'ses', 'kod', 'şifre', 'erişim', 'hesap', 'bütçe',
  'analiz', 'tablo', 'excel', 'pdf', 'sürüm', 'versiyon', 'brief', 'değerlendirme', 'onayı', 'malzeme', 'malzemeler', 'ölçüler', 'fiyatlar', 'konu',
  'durum', 'mesele', 'talep', 'talepler', 'sorun', 'problem', 'istek', 'soru', 'sorular', 'iş', 'işler', 'görev', 'görevler', 'ödev', 'randevu', 'toplantı',
  'fatura', 'faturalar', 'ekstre', 'sözleşmeler', 'kayıtlar', 'notlar', 'çizimler', 'görseller', 'fotoğraflar', 'linkler', 'adresler', 'numaralar', 'form',
  'formlar', 'e-posta', 'eposta', 'mailler', 'mesajlar', 'davetiye', 'bilet', 'biletler', 'rezervasyon', 'onaylar', 'imzalar', 'para', 'ücret', 'tutar',
]);
const POSSESSIVE_SUFFIXES = [
  'ınızı', 'inizi', 'unuzu', 'ünüzü', 'ınıza', 'inize', 'unuza', 'ünüze', 'nızı', 'nizi', 'nuzu', 'nüzü', 'ımızı', 'imizi', 'umuzu', 'ümüzü', 'ları', 'leri', 'ını',
  'ini', 'unu', 'ünü', 'nı', 'ni', 'nu', 'nü', 'yı', 'yi', 'yu', 'yü', 'ınız', 'iniz', 'unuz', 'ünüz', 'ım', 'im', 'um', 'üm', 'ın', 'in', 'un', 'ün', 'sı', 'si',
  'su', 'sü', 'lar', 'ler', 'ya', 'ye', 'ı', 'i', 'u', 'ü', 'a', 'e',
];
const DEVOICE: Record<string, string> = { b: 'p', c: 'ç', d: 't', ğ: 'k' };

/** "cevabınızı" → "cevap", "geri bildiriminizi" → "geri bildirim", "dönüşünüzü" → "dönüş"; unknown words are left untouched. */
export function normalizeNounPhrase(phrase: string): string {
  const words = phrase.trim().split(/\s+/u);
  const last = words[words.length - 1] ?? '';
  const lower = last.toLocaleLowerCase('tr-TR');
  const rest = words.slice(0, -1).map((w) => w.toLocaleLowerCase('tr-TR'));
  const candidate = (stem: string): string | null => {
    if (KNOWN_NOUNS.has(stem)) return stem;
    const final = stem.slice(-1);
    const devoiced = DEVOICE[final];
    if (devoiced && KNOWN_NOUNS.has(`${stem.slice(0, -1)}${devoiced}`)) return `${stem.slice(0, -1)}${devoiced}`;
    return null;
  };
  let noun = candidate(lower);
  if (!noun) {
    for (const suf of POSSESSIVE_SUFFIXES) {
      if (!lower.endsWith(suf) || lower.length - suf.length < 2) continue;
      const stem = lower.slice(0, -suf.length);
      const c = candidate(stem);
      if (c) {
        noun = c;
        break;
      }
    }
  }
  return [...rest, noun ?? lower].join(' ');
}

export function isKnownDeliverable(phrase: string): boolean {
  const normalized = normalizeNounPhrase(phrase);
  const last = normalized.split(/\s+/u).pop() ?? '';
  const twoWords = normalized.split(/\s+/u).slice(-2).join(' ');
  return KNOWN_NOUNS.has(last) || KNOWN_NOUNS.has(twoWords) || /(?:[ıiuü]n[ıi]z[ıi]|n[ıi]z[ıi]|[ıiuü]n[ıi]|[ıiuü]m[ıi]z[ıi])$/u.test(phrase.split(/\s+/u).pop() ?? '');
}

function verbForNoun(noun: string): string {
  const last = noun.split(/\s+/u).pop() ?? noun;
  const two = noun.split(/\s+/u).slice(-2).join(' ');
  return NOUN_TO_VERB[two] ?? NOUN_TO_VERB[last] ?? 'gönder';
}

function baseAnalysis(partial: Omit<ClauseAnalysis, 'language'>): ClauseAnalysis {
  return { language: 'tr', ...partial };
}

export function analyzeTurkishClause(clause: string, opts: AnalyzeOptions): ClauseAnalysis | null {
  const trimmed = clause.trim();
  if (!trimmed) return null;
  const lower = lowercasePreservingIndices(clause);
  if (RE_CLOSING.test(lower.trim())) return null;
  if (isOptativeForm(lastWord(clause))) return null;
  const question = /\?\s*$/u.test(trimmed) || RE_QUESTION_PARTICLE.test(lower);
  const dates = extractDates({ text: clause, now: opts.now, timezone: opts.timezone });
  const names = findClauseNames(clause, dates, opts.hintFirstName ?? null);
  const strong = RE_STRONG.test(lower);
  const unhedged = lower.replace(RE_HEDGES, (h) => ' '.repeat(h.length));
  const conditionalRequest = RE_REQUEST_CONDITIONAL.exec(unhedged);
  const conditional = RE_IF.test(unhedged) || RE_PLAIN_COND.test(unhedged) || (RE_COND_AORIST.test(unhedged) && !(conditionalRequest && RE_PLEASED.test(lower)));

  // 1) first-person forms from the lexicon (last match wins — the main verb closes a Turkish clause)
  RE_FIRST_PERSON_FORMS.lastIndex = 0;
  let best: { start: number; end: number; lemma: string; kind: ReturnType<typeof lookupFirstPerson> } | null = null;
  let m: RegExpExecArray | null;
  while ((m = RE_FIRST_PERSON_FORMS.exec(lower)) !== null) {
    const hit = lookupFirstPerson(m.groups?.form ?? '');
    if (!hit) continue;
    let lemma = hit.verb.lemma;
    if (lemma === 'et') {
      const before = lower.slice(0, m.index).trim().split(/\s+/u).pop() ?? '';
      const key = before.replace(/ı/g, 'i');
      const compound = [...ET_COMPOUNDS].find((c) => c.replace(/ı/g, 'i') === key);
      if (!compound) continue;
      lemma = `${compound} et`;
    }
    best = { start: m.index, end: m.index + m[0].length, lemma, kind: hit };
  }
  if (best && best.kind) {
    if (question || conditional) return null;
    const kind = best.kind.kind;
    const bestStart = best.start;
    const objectSource = clause.slice(0, bestStart);
    const object = buildObject(objectSource, dates, null, best.lemma);
    const clauseName = names.find((n) => n.end <= bestStart) ?? null;
    const objectWithoutName = clauseName ? buildObject(objectSource, dates, clauseName, best.lemma) : object;
    if ((best.lemma === 'görüş' || best.lemma === 'konuş') && kind === 'aorist1pl' && !object) return null;
    if (best.lemma === 'bak' && (kind === 'aorist1' || kind === 'aorist1pl') && !object) return null;
    const hasDate = dates.length > 0;
    const confidence: Record<typeof kind, number> = {
      future1: 0.8,
      future1pl: 0.75,
      aorist1: 0.65,
      aorist1pl: 0.62,
      prog1: hasDate ? 0.62 : 0.4,
      prog1pl: hasDate ? 0.6 : 0.4,
      abil1: 0.55,
      abil1pl: 0.52,
    };
    const form = kind.startsWith('future') ? 'future' : kind.startsWith('aorist') ? 'aorist' : kind.startsWith('prog') ? 'progressive' : 'ability';
    return baseAnalysis({
      lemma: best.lemma,
      person: 'first',
      form,
      formText: clause.slice(best.start, best.end),
      object,
      objectWithoutName,
      clauseName,
      counterpartCase: counterpartCaseFor(best.lemma),
      baseConfidence: confidence[kind],
      strong,
    });
  }

  // 2) unknown verb with the unambiguous future suffix
  RE_GENERIC_FUTURE.lastIndex = 0;
  let generic: RegExpExecArray | null = null;
  let g: RegExpExecArray | null;
  while ((g = RE_GENERIC_FUTURE.exec(lower)) !== null) generic = g;
  if (generic?.groups?.stem && generic.groups.suffix) {
    if (generic.groups.neg || question || conditional) return null;
    const start = generic.index;
    const end = generic.index + generic[0].length;
    const stem = lower.slice(start, start + generic.groups.stem.length);
    if (NEUTRAL_FUTURE_STEMS.has(stem.replace(/ı/g, 'i')) || NEUTRAL_FUTURE_STEMS.has(stem)) return null;
    const lemma = imperativeFromStem(stem);
    const objectSource = clause.slice(0, start);
    const object = buildObject(objectSource, dates, null, lemma);
    const clauseName = names.find((n) => n.end <= start) ?? null;
    return baseAnalysis({
      lemma,
      person: 'first',
      form: 'future',
      formText: clause.slice(start, end),
      object,
      objectWithoutName: clauseName ? buildObject(objectSource, dates, clauseName, lemma) : object,
      clauseName,
      counterpartCase: counterpartCaseFor(lemma),
      baseConfidence: 0.68,
      strong,
    });
  }

  // 3) second-person requests
  const request = detectRequest(clause, lower, conditionalRequest);
  if (request) {
    if (conditional && request.form !== 'request') return null;
    const objectSource = clause.slice(0, request.start);
    const object = buildObject(objectSource, dates, null, request.lemma);
    return baseAnalysis({
      lemma: request.lemma,
      person: 'second',
      form: request.form,
      formText: clause.slice(request.start, request.end),
      object,
      objectWithoutName: object,
      clauseName: names.find((n) => n.end <= request.start) ?? null,
      counterpartCase: counterpartCaseFor(request.lemma),
      baseConfidence: request.confidence,
      strong,
    });
  }
  if (question || conditional) return null;

  // 4) "cevabınızı bekliyorum" expectations
  const e = RE_EXPECTATION.exec(lower);
  if (e?.groups?.obj !== undefined) {
    const objRaw = clause.slice(e.index, e.index + e.groups.obj.length);
    const objDates = extractDates({ text: objRaw, now: opts.now, timezone: opts.timezone });
    const objectText = stripDatesAndFillers(objRaw, objDates);
    if (!objectText || /(?<![\p{L}])(?:seni|sizi|beni|bizi|onu|onları|sabırsızlıkla|heyecanla|merakla)(?![\p{L}])/u.test(lowercasePreservingIndices(objectText))) return null;
    if (!isKnownDeliverable(objectText)) return null;
    const noun = normalizeNounPhrase(objectText);
    const lemma = verbForNoun(noun);
    const verbStart = e.index + e[0].length - (e.groups.verb?.length ?? 0);
    return baseAnalysis({
      lemma,
      person: 'second',
      form: 'expectation',
      formText: clause.slice(verbStart, e.index + e[0].length),
      object: noun,
      objectWithoutName: noun,
      clauseName: names.find((n) => n.end <= verbStart) ?? null,
      counterpartCase: counterpartCaseFor(lemma),
      baseConfidence: 0.62,
      strong,
    });
  }
  return null;
}

interface RequestHit {
  lemma: string;
  form: 'request' | 'imperative';
  start: number;
  end: number;
  confidence: number;
}

function lemmaOf(verb: { lemma: string }, lower: string, start: number): string | null {
  if (verb.lemma !== 'et') return verb.lemma;
  const before = lower.slice(0, start).trim().split(/\s+/u).pop() ?? '';
  const key = before.replace(/ı/g, 'i');
  const compound = [...ET_COMPOUNDS].find((c) => c.replace(/ı/g, 'i') === key);
  return compound ? `${compound} et` : null;
}

function detectRequest(clause: string, lower: string, conditionalRequest: RegExpExecArray | null): RequestHit | null {
  const polite = RE_POLITE.test(lower);
  const vn = RE_REQUEST_VERBAL_NOUN.exec(lower);
  if (vn?.groups?.form) {
    const verb = lookupVerbalNoun(vn.groups.form);
    const lemma = verb ? lemmaOf(verb, lower, vn.index) : null;
    if (lemma) return { lemma, form: 'request', start: vn.index, end: vn.index + vn[0].length, confidence: 0.72 };
  }
  const need = RE_REQUEST_NEED.exec(lower);
  if (need?.groups?.form) {
    const verb = lookupVerbalNoun(need.groups.form);
    const lemma = verb ? lemmaOf(verb, lower, need.index) : null;
    if (lemma) return { lemma, form: 'request', start: need.index, end: need.index + need[0].length, confidence: 0.66 };
  }
  const q = RE_REQUEST_QUESTION.exec(lower);
  if (q?.groups?.form) {
    const verb = lookupRequestStem(q.groups.form);
    const lemma = verb ? lemmaOf(verb, lower, q.index) : null;
    if (lemma) return { lemma, form: 'request', start: q.index, end: q.index + q[0].length, confidence: polite ? 0.75 : 0.7 };
  }
  if (conditionalRequest?.groups?.form && RE_PLEASED.test(lower)) {
    const verb = lookupRequestStem(conditionalRequest.groups.form);
    const lemma = verb ? lemmaOf(verb, lower, conditionalRequest.index) : null;
    if (lemma) return { lemma, form: 'request', start: conditionalRequest.index, end: conditionalRequest.index + conditionalRequest[0].length, confidence: 0.62 };
  }
  if (polite) {
    RE_REQUEST_IMPERATIVE.lastIndex = 0;
    let last: RegExpExecArray | null = null;
    let im: RegExpExecArray | null;
    while ((im = RE_REQUEST_IMPERATIVE.exec(lower)) !== null) last = im;
    if (last?.groups?.form) {
      const after = lower.slice(last.index + last[0].length).replace(/[.!,;:\s]+/gu, ' ').trim();
      const isFinal = after === '' || after === 'lütfen';
      const verb = lookupImperative(last.groups.form);
      const lemma = verb && isFinal ? lemmaOf(verb, lower, last.index) : null;
      if (lemma) return { lemma, form: 'imperative', start: last.index, end: last.index + last[0].length, confidence: 0.6 };
    }
  }
  return null;
}

function capitalizeFirst(s: string): string {
  return s ? (s[0] ?? '').toLocaleUpperCase('tr-TR') + s.slice(1) : s;
}

export function cleanTopic(topic: string): string {
  const t = topic
    .replace(/^(?:\s*(?:re|fwd?|fw|ynt|ilt|yan|cevap)\s*:\s*)+/iu, '')
    .replace(/\s+hakkında$/iu, '')
    .trim();
  if (!t || t.split(/\s+/u).length > 4) return '';
  return t.replace(/[.!?]+$/u, '').toLocaleLowerCase('tr-TR');
}

const NO_TOPIC_OBJECT = new Set(['ara', 'dön', 'konuş', 'görüş', 'gel', 'git', 'uğra', 'katıl', 'ulaş', 'geç', 'bak']);

export interface ComposeTurkishInput {
  analysis: ClauseAnalysis;
  direction: 'user_owes' | 'other_owes';
  /** First name of the counterpart when it is known but not named in the clause. */
  counterpartFirstName: string | null;
  /** True when the name found in the clause is the counterpart (so it leaves the object phrase). */
  clauseNameIsCounterpart: boolean;
  topic?: string | null;
}

/** Lowercase a sentence-initial common noun once it no longer starts the text ("Kontrol edip" → "kontrol edip"); proper nouns keep their case. */
function decapitalizeObject(object: string): string {
  const first = object.split(/\s+/u)[0] ?? '';
  if (/['’]/u.test(first) || /\d/u.test(first) || /^\p{Lu}{2,}/u.test(first)) return object;
  return (object[0] ?? '').toLocaleLowerCase('tr-TR') + object.slice(1);
}

/** "[Mehmet'e] [teklif] gönder" for the user's own commitments, "Mehmet teklif gönderecek" for the other party's. */
export function composeTurkish(input: ComposeTurkishInput): string {
  const { analysis: a, direction, counterpartFirstName, clauseNameIsCounterpart } = input;
  const lemma = a.lemma;
  const parts: string[] = [];
  let object = clauseNameIsCounterpart ? a.objectWithoutName : a.object;
  if (a.form === 'expectation') object = a.object;
  if (!object && input.topic && !NO_TOPIC_OBJECT.has(lemma)) {
    const t = cleanTopic(input.topic);
    if (t) object = /\p{L}$/u.test(t) ? turkishAccusative(t) : t;
  }
  if (direction === 'user_owes') {
    if (clauseNameIsCounterpart && a.clauseName) {
      parts.push(a.clauseName.phrase.replace(/\s+(?:Bey|Hanım|Abi|Abla|Hoca|Hocam)(?=['’])/u, ''));
    } else if (counterpartFirstName && a.counterpartCase !== 'none') {
      parts.push(counterpartPhrase(counterpartFirstName, a.counterpartCase));
    }
    if (object) parts.push(parts.length > 0 ? decapitalizeObject(object) : object);
    parts.push(lemma);
  } else {
    parts.push(counterpartFirstName ?? 'Karşı taraf');
    if (object) parts.push(decapitalizeObject(object));
    else if (a.person === 'first') {
      const pronoun: Record<CounterpartCase, string> = { dat: 'size', acc: 'sizi', ile: 'sizinle', none: '' };
      if (pronoun[a.counterpartCase]) parts.push(pronoun[a.counterpartCase]);
    }
    parts.push(futureThird(lemma));
  }
  return capitalizeFirst(parts.join(' ').replace(/\s+/gu, ' ').trim());
}
