/**
 * Fixed identifiers of the demo dataset. They mirror supabase/seed/seed.sql 1:1 so the demo adapter and a
 * seeded local Supabase produce the same ids (deep links, tests and screenshots stay interchangeable).
 * Every id is a syntactically valid UUID v4 (hex only, version nibble 4, variant nibble 8).
 */
const BASE = '00000000-0000-4000-8000-';

/** Builds a seed id from a short hex suffix (`seedId('b1')` → `…-0000000000b1`). */
export function seedId(suffix: string): string {
  return `${BASE}${suffix.padStart(12, '0')}`;
}

const id = seedId;

export const USER_ID = id('1');
export const SUBSCRIPTION_ID = id('a1');

export const ACCOUNT_GMAIL = id('c1');
export const ACCOUNT_DEVICE = id('c2');

export const CONTACT_AHMET = id('2201');
export const CONTACT_MEHMET = id('2202');
export const CONTACT_SELIN = id('2203');
export const CONTACT_GIRISIM = id('2204');

export const VIP_MEHMET = id('2301');
export const RULE_PROMOTIONS = id('2401');
export const RULE_DOMAIN = id('2402');
export const LEARNED_MEHMET = id('2501');
export const LEARNED_PROMOTIONS = id('2502');
export const LEARNED_REMINDER_LEAD = id('2503');

export const THREAD_AHMET_REVIZE = id('e1');
export const THREAD_SELIN_SOZLESME = id('e2');
export const THREAD_GIRISIM_BASVURU = id('e3');
export const THREAD_MEHMET_TEKLIF_V2 = id('e4');
export const THREAD_TRENDYOL = id('e5');
export const THREAD_THY = id('e6');
export const THREAD_CK_FATURA = id('e7');
export const THREAD_NETFLIX = id('e8');
export const THREAD_GOOGLE_SECURITY = id('e9');
export const THREAD_PROMO = id('ea');
export const THREAD_MEHMET_TOPLANTI = id('eb');
export const THREAD_HUKUK_SOZLESME = id('ec');

export const MESSAGE_AHMET_1 = id('2101');
export const MESSAGE_SELIN_1 = id('2102');
export const MESSAGE_GIRISIM_1 = id('2103');
export const MESSAGE_MEHMET_SENT_1 = id('2104');
export const MESSAGE_MEHMET_TOPLANTI_1 = id('2105');
export const MESSAGE_HUKUK_SENT_1 = id('2106');

export const EVENT_MEHMET_MEETING = id('d1');
export const EVENT_URUN_GOZDEN = id('d2');
export const EVENT_AKSAM_YEMEGI = id('d3');
export const EVENT_HAFTALIK_EKIP = id('d4');
export const EVENT_DOKTOR = id('d5');
export const EVENT_DEMIR_MUSTERI = id('d6');
export const CONFLICT_DOKTOR_DEMIR = id('3201');

export const TASK_TEKLIF_HAZIRLAMA = id('2601');
export const COMMITMENT_MEHMET_TEKLIF = id('2701');
export const COMMITMENT_SELIN_YORUM = id('2702');
export const COMMITMENT_MEHMET_FEEDBACK = id('2703');
export const FOLLOWUP_MEHMET_TEKLIF = id('2801');
export const FOLLOWUP_HUKUK_SOZLESME = id('2802');
export const REMINDER_AHMET_TEKLIF = id('2901');

export const LIFE_TRENDYOL = id('3001');
export const LIFE_THY = id('3002');
export const LIFE_CK_FATURA = id('3003');
export const LIFE_NETFLIX = id('3004');
export const LIFE_GOOGLE_SECURITY = id('3005');

export const INSIGHT_AHMET_REVIZE = id('3101');
export const INSIGHT_MEHMET_MEETING = id('3102');
export const INSIGHT_GIRISIM_DEADLINE = id('3103');
export const INSIGHT_MEHMET_FOLLOWUP = id('3104');
export const INSIGHT_TRENDYOL = id('3105');
export const INSIGHT_SELIN_WAITING = id('3106');
export const INSIGHT_MEHMET_COMMITMENT = id('3107');
export const INSIGHT_THY = id('3108');
export const INSIGHT_GOOGLE_SECURITY = id('3109');
export const INSIGHT_CK_FATURA = id('310a');
export const INSIGHT_PLAN_SUGGESTION = id('310b');
export const INSIGHT_CONFLICT = id('310c');
export const INSIGHT_MEHMET_RESCHEDULE = id('310d');

export const BRIEFING_MORNING = id('b1');
export const BRIEFING_MIDDAY = id('b2');
export const BRIEFING_EVENING = id('b3');
export const BRIEFING_WEEKLY = id('b4');

export const APPROVAL_AHMET_REPLY = id('3301');
export const APPROVAL_BASVURU_CALENDAR = id('3302');

export const ASSISTANT_THREAD_FOCUS = id('3401');
export const ASSISTANT_THREAD_FLIGHT = id('3402');
export const ASSISTANT_MSG_FOCUS_USER = id('3501');
export const ASSISTANT_MSG_FOCUS_ANSWER = id('3502');
export const ASSISTANT_MSG_FLIGHT_USER = id('3503');
export const ASSISTANT_MSG_FLIGHT_ANSWER = id('3504');

export const MEMORY_AHMET_REVIZE = id('3601');
export const MEMORY_MEHMET_TEKLIF = id('3602');
export const MEMORY_THY = id('3603');
export const MEMORY_CK_FATURA = id('3604');
export const MEMORY_MEHMET_MEETING = id('3605');

export const REFERRAL_ID = id('3701');
export const PUSH_TOKEN_ID = id('3801');
export const POST_MEETING_NOTE_MEHMET = id('3901');

/** Runtime ids are allocated from a persisted counter so a demo session stays reproducible. */
export const RUNTIME_ID_START = 0x100000;

export function runtimeId(seq: number): string {
  return `${BASE}${seq.toString(16).padStart(12, '0')}`;
}
