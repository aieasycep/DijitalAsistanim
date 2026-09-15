/** Types and helpers shared by the Turkish and English clause analysers. */
import type { CounterpartCase } from './verbs';

export type CommitmentLanguage = 'tr' | 'en';
export type CommitmentFormKind =
  'future' | 'aorist' | 'progressive' | 'ability' | 'request' | 'expectation' | 'imperative';

export interface AnalyzeOptions {
  now: string;
  timezone: string;
  /** First name of the known counterpart (recipient / sender) — helps accept "X ile" at clause start. */
  hintFirstName?: string | null;
}

export interface ClauseName {
  /** Bare name without honorific or suffix: "Mehmet", "Mehmet Yılmaz". */
  name: string;
  /** Verbatim phrase with its suffix: "Mehmet'e", "Mehmet ile", "Selin'i". */
  phrase: string;
  start: number;
  end: number;
  kase: CounterpartCase;
}

export interface ClauseAnalysis {
  language: CommitmentLanguage;
  /** Imperative lemma ("gönder", "kontrol et") or English base verb phrase ("send", "get back"). */
  lemma: string;
  person: 'first' | 'second';
  form: CommitmentFormKind;
  /** Verbatim verb form that anchored the match. */
  formText: string;
  /** Object phrase as written (dates, fillers removed); clause names kept. */
  object: string;
  /** Same, with the clause-named counterpart removed. */
  objectWithoutName: string;
  clauseName: ClauseName | null;
  counterpartCase: CounterpartCase;
  baseConfidence: number;
  /** Intensifiers such as "söz", "kesinlikle", "definitely". */
  strong: boolean;
  /** English only: the clause addressed "you" (binds the counterpart to the hint). */
  addressesYou?: boolean;
}

/** Capitalized words that are never a counterpart name (dates, places, tools, greetings, common sentence starters). */
export const NAME_STOPLIST = new Set(
  [
    'pazartesi',
    'salı',
    'çarşamba',
    'perşembe',
    'cuma',
    'cumartesi',
    'pazar',
    'ocak',
    'şubat',
    'mart',
    'nisan',
    'mayıs',
    'haziran',
    'temmuz',
    'ağustos',
    'eylül',
    'ekim',
    'kasım',
    'aralık',
    'yarın',
    'bugün',
    'dün',
    'hafta',
    'haftaya',
    'sabah',
    'akşam',
    'öğlen',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'tomorrow',
    'today',
    'tonight',
    'istanbul',
    'ankara',
    'izmir',
    'bursa',
    'antalya',
    'adana',
    'konya',
    'gaziantep',
    'kayseri',
    'eskişehir',
    'trabzon',
    'samsun',
    'mersin',
    'diyarbakır',
    'kocaeli',
    'sakarya',
    'muğla',
    'bodrum',
    'türkiye',
    'avrupa',
    'almanya',
    'londra',
    'berlin',
    'paris',
    'amsterdam',
    'newyork',
    'dubai',
    'ofis',
    'ofise',
    'şirket',
    'firma',
    'banka',
    'okul',
    'ev',
    'toplantı',
    'ekip',
    'departman',
    'muhasebe',
    'hukuk',
    'satış',
    'pazarlama',
    'yönetim',
    'pdf',
    'excel',
    'word',
    'powerpoint',
    'zoom',
    'teams',
    'drive',
    'slack',
    'whatsapp',
    'gmail',
    'outlook',
    'google',
    'microsoft',
    'apple',
    'notion',
    'trello',
    'jira',
    'github',
    'figma',
    'canva',
    'dropbox',
    'linkedin',
    'instagram',
    'twitter',
    'youtube',
    'meet',
    'skype',
    'telegram',
    'sap',
    'erp',
    'crm',
    'merhaba',
    'selam',
    'sayın',
    'sevgili',
    'değerli',
    'ekte',
    'ekteki',
    'ayrıca',
    'ancak',
    'sonra',
    'önce',
    'lütfen',
    'teşekkürler',
    'saygılarımla',
    'evet',
    'hayır',
    'tamam',
    'peki',
    'ama',
    'fakat',
    'yani',
    'bu',
    'şu',
    'o',
    'biz',
    'ben',
    'siz',
    'sen',
    'hepimiz',
    'herkes',
    'kimse',
    'bir',
    'iki',
    'üç',
    'ilk',
    'son',
    'toplam',
    'genel',
    'yeni',
    'eski',
    'revize',
    'taslak',
    'teklif',
    'rapor',
    'dosya',
    'sözleşme',
    'fatura',
    'proje',
    'sipariş',
    'kargo',
    'ürün',
    'müşteri',
    'tedarikçi',
    'yönetici',
    'müdür',
    'bey',
    'hanım',
    'hocam',
    'abi',
    'abla',
    'hi',
    'hello',
    'hey',
    'dear',
    'thanks',
    'regards',
    'best',
    'please',
    'the',
    'this',
    'that',
    'we',
    'you',
    'they',
    'it',
    'also',
    'and',
    'but',
    'then',
    'ok',
    'okay',
    'yes',
    'no',
    'sure',
    'great',
    'thank',
    'kind',
    'have',
    'will',
    'can',
    'could',
    'would',
    'once',
    'after',
    'before',
    'until',
    'eod',
    'cob',
    'asap',
    'fyi',
    'q1',
    'q2',
    'q3',
    'q4',
    'v1',
    'v2',
    'v3',
    'lorem',
    'ipsum',
  ].map((w) => w.replace(/ı/g, 'i')),
);

/** Title-case word with Turkish letters, at least 2 letters, not all caps, not in the stoplist. */
export function isNameToken(token: string): boolean {
  if (!/^\p{Lu}[\p{Ll}]+$/u.test(token)) return false;
  return !NAME_STOPLIST.has(token.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i'));
}

/** First token of a full name; honorifics stripped ("Mehmet Bey" → "Mehmet", "Mr. Yılmaz" → "Yılmaz"). */
export function firstNameOf(name: string): string {
  const cleaned = stripHonorifics(name);
  return cleaned.split(/\s+/u)[0] ?? cleaned;
}

export function stripHonorifics(name: string): string {
  return name
    .replace(/(?:^|\s)(?:Bey|Hanım|Abi|Abla|Hoca|Hocam|Beyefendi|Hanımefendi)(?=\s|$)/gu, '')
    .replace(/^(?:Sayın|Sn\.?|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|Av\.?)\s+/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Resolve a bare clause/vocative name against the hint's full name ("Mehmet" + hint "Mehmet Yılmaz" → "Mehmet Yılmaz"). */
export function resolveFullName(name: string, hintName: string | null | undefined): string {
  const bare = stripHonorifics(name);
  if (!hintName) return bare;
  const hint = stripHonorifics(hintName);
  const a = firstNameOf(bare).toLocaleLowerCase('tr-TR');
  const b = firstNameOf(hint).toLocaleLowerCase('tr-TR');
  if (a && a === b && hint.length >= bare.length) return hint;
  return bare;
}
