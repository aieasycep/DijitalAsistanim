/**
 * Turkish commitment verb lexicon. Every inflection is generated from the lemma with vowel harmony
 * so the analyser can match first-person commitment forms ("göndereceğim", "gönderirim"),
 * second-person requests ("gönderir misin", "göndermenizi rica ederim") and compose the
 * imperative / third-person forms used in normalized commitment texts.
 *
 * Aorist and progressive forms are ambiguous enough that only listed verbs are trusted; the future
 * 1sg/1pl suffix (-acağım/-eceğim) is unambiguous and is also accepted for unknown verbs.
 */
import { escapeRegex, flexI } from '../dates';

export type CounterpartCase = 'dat' | 'acc' | 'ile' | 'none';
export type FirstPersonKind = 'future1' | 'future1pl' | 'aorist1' | 'aorist1pl' | 'prog1' | 'prog1pl' | 'abil1' | 'abil1pl';
export type RequestKind = 'question' | 'conditional' | 'verbal_noun_request' | 'verbal_noun_need' | 'imperative';

interface VerbSpec {
  lemma: string;
  counterpart: CounterpartCase;
  /** Final "t" softens to "d" before vowel-initial suffixes: et → edeceğim, git → gideceğim. */
  soften?: boolean;
}

const SPECS: VerbSpec[] = [
  { lemma: 'gönder', counterpart: 'dat' },
  { lemma: 'yolla', counterpart: 'dat' },
  { lemma: 'ilet', counterpart: 'dat' },
  { lemma: 'paylaş', counterpart: 'ile' },
  { lemma: 'ara', counterpart: 'acc' },
  { lemma: 'dön', counterpart: 'dat' },
  { lemma: 'yaz', counterpart: 'dat' },
  { lemma: 'hazırla', counterpart: 'none' },
  { lemma: 'bitir', counterpart: 'none' },
  { lemma: 'tamamla', counterpart: 'none' },
  { lemma: 'yap', counterpart: 'none' },
  { lemma: 'hallet', counterpart: 'none', soften: true },
  { lemma: 'bak', counterpart: 'none' },
  { lemma: 'gel', counterpart: 'dat' },
  { lemma: 'git', counterpart: 'dat', soften: true },
  { lemma: 'bildir', counterpart: 'dat' },
  { lemma: 'at', counterpart: 'dat' },
  { lemma: 'ver', counterpart: 'dat' },
  { lemma: 'ulaş', counterpart: 'dat' },
  { lemma: 'ayarla', counterpart: 'none' },
  { lemma: 'öde', counterpart: 'none' },
  { lemma: 'getir', counterpart: 'dat' },
  { lemma: 'sor', counterpart: 'dat' },
  { lemma: 'incele', counterpart: 'none' },
  { lemma: 'düzelt', counterpart: 'none' },
  { lemma: 'güncelle', counterpart: 'none' },
  { lemma: 'söyle', counterpart: 'dat' },
  { lemma: 'konuş', counterpart: 'ile' },
  { lemma: 'görüş', counterpart: 'ile' },
  { lemma: 'al', counterpart: 'none' },
  { lemma: 'çıkar', counterpart: 'none' },
  { lemma: 'öğren', counterpart: 'none' },
  { lemma: 'imzala', counterpart: 'none' },
  { lemma: 'oku', counterpart: 'none' },
  { lemma: 'başla', counterpart: 'none' },
  { lemma: 'uğra', counterpart: 'dat' },
  { lemma: 'katıl', counterpart: 'dat' },
  { lemma: 'ekle', counterpart: 'none' },
  { lemma: 'netleştir', counterpart: 'none' },
  { lemma: 'hatırlat', counterpart: 'dat' },
  { lemma: 'et', counterpart: 'none', soften: true },
  { lemma: 'kaydet', counterpart: 'none', soften: true },
  { lemma: 'onayla', counterpart: 'none' },
  { lemma: 'cevapla', counterpart: 'acc' },
  { lemma: 'yanıtla', counterpart: 'acc' },
  { lemma: 'sun', counterpart: 'dat' },
  { lemma: 'çöz', counterpart: 'none' },
  { lemma: 'değerlendir', counterpart: 'none' },
  { lemma: 'araştır', counterpart: 'none' },
  { lemma: 'doldur', counterpart: 'none' },
  { lemma: 'yükle', counterpart: 'none' },
  { lemma: 'planla', counterpart: 'none' },
  { lemma: 'uzat', counterpart: 'none' },
  { lemma: 'kapat', counterpart: 'none' },
  { lemma: 'aç', counterpart: 'none' },
  { lemma: 'geç', counterpart: 'dat' },
  { lemma: 'geçir', counterpart: 'none' },
  { lemma: 'raporla', counterpart: 'dat' },
  { lemma: 'aktar', counterpart: 'dat' },
  { lemma: 'bul', counterpart: 'none' },
  { lemma: 'ayır', counterpart: 'none' },
  { lemma: 'temizle', counterpart: 'none' },
];

/** Nouns that combine with "et-" into an actionable verb ("kontrol et", "teyit et"). "Teşekkür ederim" is not a commitment. */
export const ET_COMPOUNDS = new Set([
  'kontrol', 'teyit', 'takip', 'organize', 'iptal', 'teslim', 'rapor', 'tamir', 'temin', 'tedarik', 'transfer', 'test', 'analiz', 'revize', 'telefon',
  'ziyaret', 'yardım', 'sevk', 'tahsil', 'iade', 'tespit', 'devam', 'talep', 'tarif', 'sipariş', 'müzakere', 'not', 'koordine', 'ayarlama', 'planlama',
  'finalize', 'onay', 'kabul', 'ikmal', 'ilave', 'imza', 'tanzim', 'tebliğ', 'temas', 'terk', 'ıspat', 'ispat', 'hesap', 'entegre', 'aktif', 'deaktif',
  'çözüm', 'kayıt', 'güncelleme', 'gözden geçirme', 'sunum', 'ödeme', 'hazır', 'ikram', 'davet', 'ilan', 'iletişim', 'inşa', 'monte', 'paylaşım',
]);

/** Nouns that combine with "yap-", "ver-", "al-", "geç-" into an actionable compound; used to name the deliverable in "… bekliyorum" expectations. */
export const NOUN_TO_VERB: Record<string, string> = {
  dönüş: 'yap',
  'geri dönüş': 'yap',
  cevap: 'ver',
  yanıt: 'ver',
  onay: 'ver',
  haber: 'ver',
  bilgi: 'ver',
  'geri bildirim': 'ver',
  'geri bildirimi': 'ver',
  görüş: 'bildir',
  yorum: 'ilet',
  teyit: 'ver',
};

const FRONT = new Set(['e', 'i', 'ö', 'ü']);
const ROUNDED = new Set(['o', 'ö', 'u', 'ü']);
const VOWELS = 'aeıioöuü';
/** Monosyllabic stems whose aorist takes -ir instead of -er. */
const AORIST_IR_MONO = new Set(['al', 'bil', 'bul', 'dur', 'gel', 'gör', 'kal', 'ol', 'öl', 'san', 'var', 'ver', 'vur']);

function lastVowel(w: string): string {
  for (let i = w.length - 1; i >= 0; i--) {
    const ch = w[i] ?? '';
    if (VOWELS.includes(ch)) return ch;
  }
  return 'e';
}

function vowelCount(w: string): number {
  let n = 0;
  for (const ch of w) if (VOWELS.includes(ch)) n += 1;
  return n;
}

function endsWithVowel(w: string): boolean {
  return VOWELS.includes(w.slice(-1));
}

function narrowFor(v: string): string {
  const front = FRONT.has(v);
  const round = ROUNDED.has(v);
  return front ? (round ? 'ü' : 'i') : round ? 'u' : 'ı';
}

function wideFor(v: string): string {
  return FRONT.has(v) ? 'e' : 'a';
}

export interface VerbForms {
  lemma: string;
  /** Last word of a compound lemma ("kontrol et" → "et") — the part that is inflected. */
  head: string;
  counterpart: CounterpartCase;
  future1: string;
  future1pl: string;
  future3: string;
  aorist1: string;
  aorist1pl: string;
  aorist3: string;
  prog1: string;
  prog1pl: string;
  abil1: string;
  abil1pl: string;
  abil3: string;
  optative1: string;
  optative1pl: string;
  verbalNoun: string;
  imperative2pl: string[];
  /** "gönderirse" / "gönderebilirse" — conditional stems that take -m/-k/-n/-niz. */
  conditionalStems: string[];
  passiveFuture3: string;
}

function inflect(head: string, soften: boolean): Omit<VerbForms, 'lemma' | 'counterpart' | 'head'> {
  const lv = lastVowel(head);
  const w = wideFor(lv);
  const n = narrowFor(lv);
  const vowelEnd = endsWithVowel(head);
  const soft = soften && head.endsWith('t') ? `${head.slice(0, -1)}d` : head;
  const base = vowelEnd ? head : soft;
  const buffer = vowelEnd ? 'y' : '';
  const future3 = `${base}${buffer}${w}c${w}k`;
  const futureStem = `${base}${buffer}${w}c${w}ğ`;
  const aorist3 = vowelEnd ? `${head}r` : vowelCount(head) === 1 && !AORIST_IR_MONO.has(head) ? `${soft}${w}r` : `${soft}${n}r`;
  const aoristNarrow = narrowFor(lastVowel(aorist3));
  let prog3: string;
  if (vowelEnd) {
    const dropped = head.slice(0, -1);
    const dv = vowelCount(dropped) > 0 ? lastVowel(dropped) : lv;
    prog3 = `${dropped}${narrowFor(dv)}yor`;
  } else {
    prog3 = `${soft}${n}yor`;
  }
  const abil3 = `${base}${buffer}${w}bilir`;
  const condAorist = `${aorist3}s${wideFor(lastVowel(aorist3))}`;
  const condAbil = `${abil3}se`;
  let passiveStem: string;
  if (vowelEnd) passiveStem = `${head}n`;
  else if (head.endsWith('l')) passiveStem = `${soft}${n}n`;
  else passiveStem = `${soft}${n}l`;
  const pv = lastVowel(passiveStem);
  const pw = wideFor(pv);
  return {
    future1: `${futureStem}${narrowFor(w)}m`,
    future1pl: `${futureStem}${narrowFor(w)}z`,
    future3,
    aorist1: `${aorist3}${aoristNarrow}m`,
    aorist1pl: `${aorist3}${aoristNarrow}z`,
    aorist3,
    prog1: `${prog3}um`,
    prog1pl: `${prog3}uz`,
    abil1: `${abil3}im`,
    abil1pl: `${abil3}iz`,
    abil3,
    optative1: `${base}${buffer}${w}y${narrowFor(w)}m`,
    optative1pl: `${base}${buffer}${w}l${narrowFor(w)}m`,
    verbalNoun: `${head}m${w}`,
    imperative2pl: [`${base}${buffer}${n}n`, `${base}${buffer}${n}n${n}z`],
    conditionalStems: [condAorist, condAbil],
    passiveFuture3: `${passiveStem}${pw}c${pw}k`,
  };
}

export function conjugate(spec: VerbSpec): VerbForms {
  const parts = spec.lemma.split(' ');
  const head = parts[parts.length - 1] ?? spec.lemma;
  return { lemma: spec.lemma, head, counterpart: spec.counterpart, ...inflect(head, spec.soften ?? false) };
}

export const VERBS: VerbForms[] = SPECS.map(conjugate);
const BY_LEMMA = new Map<string, VerbForms>(VERBS.map((v) => [v.lemma, v]));

export function verbByLemma(lemma: string): VerbForms | null {
  return BY_LEMMA.get(lemma) ?? null;
}

function normKey(s: string): string {
  return s.replace(/ı/g, 'i');
}

export interface FirstPersonMatch {
  verb: VerbForms;
  kind: FirstPersonKind;
}

const FIRST_PERSON_INDEX = new Map<string, FirstPersonMatch>();
const REQUEST_STEM_INDEX = new Map<string, VerbForms>();
const VERBAL_NOUN_INDEX = new Map<string, VerbForms>();
const IMPERATIVE_INDEX = new Map<string, VerbForms>();
const OPTATIVE_FORMS = new Set<string>();

for (const v of VERBS) {
  const kinds: [string, FirstPersonKind][] = [
    [v.future1, 'future1'],
    [v.future1pl, 'future1pl'],
    [v.aorist1, 'aorist1'],
    [v.aorist1pl, 'aorist1pl'],
    [v.prog1, 'prog1'],
    [v.prog1pl, 'prog1pl'],
    [v.abil1, 'abil1'],
    [v.abil1pl, 'abil1pl'],
  ];
  for (const [form, kind] of kinds) FIRST_PERSON_INDEX.set(normKey(form), { verb: v, kind });
  REQUEST_STEM_INDEX.set(normKey(v.aorist3), v);
  REQUEST_STEM_INDEX.set(normKey(v.abil3), v);
  for (const c of v.conditionalStems) REQUEST_STEM_INDEX.set(normKey(c), v);
  VERBAL_NOUN_INDEX.set(normKey(v.verbalNoun), v);
  IMPERATIVE_INDEX.set(normKey(v.head), v);
  for (const imp of v.imperative2pl) IMPERATIVE_INDEX.set(normKey(imp), v);
  OPTATIVE_FORMS.add(normKey(v.optative1));
  OPTATIVE_FORMS.add(normKey(v.optative1pl));
}

function alternation(keys: Iterable<string>): string {
  return [...keys]
    .sort((a, b) => b.length - a.length)
    .map((k) => flexI(escapeRegex(k)))
    .join('|');
}

const NB = '(?<![\\p{L}])';
const NE = '(?![\\p{L}])';

/** All first-person commitment forms of the lexicon ("göndereceğim", "gönderirim", "gönderiyoruz" …). */
export const RE_FIRST_PERSON_FORMS = new RegExp(`${NB}(?<form>${alternation(FIRST_PERSON_INDEX.keys())})${NE}`, 'gu');

/** Unknown verbs with the unambiguous future suffix; the optional negation group catches "göndermeyeceğim". */
export const RE_GENERIC_FUTURE = /(?<![\p{L}])(?<stem>\p{L}{2,}?)(?<neg>m[ae]y)?(?<suffix>eceğim|acağım|eceğiz|acağız)(?![\p{L}])/gu;

const REQUEST_STEMS = alternation(REQUEST_STEM_INDEX.keys());
const VERBAL_NOUNS = alternation(VERBAL_NOUN_INDEX.keys());
const IMPERATIVES = alternation(IMPERATIVE_INDEX.keys());

/** "gönderir misin", "iletebilir misiniz", "bakar mısın". */
export const RE_REQUEST_QUESTION = new RegExp(`${NB}(?<form>${REQUEST_STEMS})\\s+m[iıuü]s[iı]n(?:[iı]z)?${NE}`, 'u');
/** "gönderirsen(iz)", "gönderebilirseniz" — a request only when followed by "sevinirim" & co. */
export const RE_REQUEST_CONDITIONAL = new RegExp(`${NB}(?<form>${REQUEST_STEMS})n(?:[iı]z)?${NE}`, 'u');
export const RE_PLEASED = /(?<![\p{L}])(?:sevinir(?:im|iz)|memnun olur(?:um|uz)|(?:çok\s+)?iyi olur|süper olur|harika olur|minnettar (?:olur|kal)(?:um|ız|ırım|ırız)|makbule geçer)(?![\p{L}])/u;
/** "göndermenizi rica ederim", "iletmeni bekliyorum". */
export const RE_REQUEST_VERBAL_NOUN = new RegExp(
  `${NB}(?<form>${VERBAL_NOUNS})n(?:[iı]z)?[iı]\\s+(?:rica ed(?:erim|iyorum|eriz|iyoruz|ecek)|bekliyor(?:um|uz)|istiyor(?:um|uz)|bekler(?:im|iz)|ister(?:im|iz))${NE}`,
  'u',
);
/** "göndermen gerekiyor", "iletmeniz lazım". */
export const RE_REQUEST_NEED = new RegExp(`${NB}(?<form>${VERBAL_NOUNS})n(?:[iı]z)?\\s+(?:gerek(?:iyor|ir|li|mekte)?|lazım|lâzım|şart)${NE}`, 'u');
/** Bare imperative ("gönder", "gönderin", "gönderiniz") — accepted only with "lütfen"/"rica" in the clause. */
export const RE_REQUEST_IMPERATIVE = new RegExp(`${NB}(?<form>${IMPERATIVES})${NE}`, 'gu');
export const RE_POLITE = /(?<![\p{L}])(?:lütfen|rica)(?![\p{L}])/u;
/** "cevabınızı bekliyorum", "senden dönüş bekliyorum". */
export const RE_EXPECTATION = /^(?<obj>.+?)\s+(?<verb>bekliyorum|bekliyoruz|beklerim|bekleriz|bekliyor olacağım|bekliyor olacağız|bekleyeceğim|bekleyeceğiz)(?![\p{L}])/u;
/** Generic optative ("göndereyim", "yapalım") checked on the clause's last word. */
export const RE_OPTATIVE_WORD = /^\p{L}{2,}(?:[ae]y[iı]m|[ae]l[iı]m)$/u;

export function lookupFirstPerson(form: string): FirstPersonMatch | null {
  return FIRST_PERSON_INDEX.get(normKey(form)) ?? null;
}

export function lookupRequestStem(form: string): VerbForms | null {
  return REQUEST_STEM_INDEX.get(normKey(form)) ?? null;
}

export function lookupVerbalNoun(form: string): VerbForms | null {
  return VERBAL_NOUN_INDEX.get(normKey(form)) ?? null;
}

export function lookupImperative(form: string): VerbForms | null {
  return IMPERATIVE_INDEX.get(normKey(form)) ?? null;
}

export function isOptativeForm(word: string): boolean {
  return OPTATIVE_FORMS.has(normKey(word)) || RE_OPTATIVE_WORD.test(word);
}

/** Best-effort imperative for an unknown future stem: "hazırlay" → "hazırla", "ed" → "et", "gid" → "git". */
export function imperativeFromStem(stem: string): string {
  let s = stem;
  if (/[aeıioöuü]y$/u.test(s)) s = s.slice(0, -1);
  if (s === 'ed') return 'et';
  if (s === 'gid') return 'git';
  if (s === 'd') return 'de';
  if (s === 'y') return 'ye';
  return s;
}

/** "gönder" → "gönderecek"; unknown lemmas are inflected with the same harmony rules. */
export function futureThird(lemma: string): string {
  const known = BY_LEMMA.get(lemma);
  if (known) return known.lemma.includes(' ') ? `${known.lemma.slice(0, -known.head.length)}${known.future3}` : known.future3;
  const parts = lemma.split(' ');
  const head = parts[parts.length - 1] ?? lemma;
  const forms = inflect(head, head === 'et' || head === 'git' || head.endsWith('et'));
  return parts.length > 1 ? `${parts.slice(0, -1).join(' ')} ${forms.future3}` : forms.future3;
}

/** Counterpart case a lemma expects; compound lemmas use their head verb. */
export function counterpartCaseFor(lemma: string): CounterpartCase {
  const known = BY_LEMMA.get(lemma);
  if (known) return known.counterpart;
  const head = lemma.split(' ').pop() ?? lemma;
  return BY_LEMMA.get(head)?.counterpart ?? 'none';
}
