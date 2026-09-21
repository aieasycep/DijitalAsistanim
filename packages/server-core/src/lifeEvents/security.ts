/** Security alerts: new sign-in / new device, password changes, 2-step verification changes, suspicious activity. */
import { RE_OTP, RE_SECURITY_EVENT_CRITICAL, RE_SECURITY_STRONG } from '../triage/signals';
import { capitalizeFirst, type Ctx } from './common';
import type { ExtractedLifeEvent } from './types';

interface EventPattern {
  re: RegExp;
  /** Canonical Turkish label stored in details.securityEvent. */
  label: string;
  confidence: number;
}

const PATTERNS: EventPattern[] = [
  {
    re: /(?<![\p{L}])(?:şifre(?:niz)? değiştirildi|şifre değişikliği|parola(?:nız)? değiştirildi|şifreniz güncellendi|password (?:was |has been )?changed|password change)(?![\p{L}])/u,
    label: 'Şifre değişikliği',
    confidence: 0.92,
  },
  {
    re: /(?<![\p{L}])(?:şifre(?:niz)? sıfırlandı|parola(?:nız)? sıfırlandı|password (?:was |has been )?reset)(?![\p{L}])/u,
    label: 'Şifre sıfırlandı',
    confidence: 0.9,
  },
  {
    re: /(?<![\p{L}])(?:iki adımlı|2 adımlı|iki faktörlü|2 faktörlü|two-step|two-factor|2-step|2fa)(?![\p{L}])/u,
    label: 'İki adımlı doğrulama',
    confidence: 0.85,
  },
  {
    re: /(?<![\p{L}])(?:şüpheli (?:giriş|etkinlik|hareket|oturum)\p{L}*|suspicious (?:sign-?in|activity|login)|unusual (?:activity|sign-?in)|olağandışı etkinlik)(?![\p{L}])/u,
    label: 'Şüpheli giriş',
    confidence: 0.92,
  },
  {
    re: /(?<![\p{L}])(?:yeni (?:bir )?cihaz\p{L}*|new (?:\p{L}+ )?device)(?![\p{L}])/u,
    label: 'Yeni cihazdan giriş',
    confidence: 0.92,
  },
  {
    re: /(?<![\p{L}])(?:yeni (?:bir )?giriş\p{L}*|new sign-?in|new login|hesabınıza giriş yapıldı|hesabına giriş yapıldı|signed in to your|was used to sign in|oturum açıldı)(?![\p{L}])/u,
    label: 'Yeni giriş',
    confidence: 0.9,
  },
  {
    re: /(?<![\p{L}])(?:kurtarma (?:e-postası|telefonu|bilgi)|recovery (?:email|phone))(?![\p{L}])/u,
    label: 'Kurtarma bilgisi değişti',
    confidence: 0.8,
  },
  {
    re: /(?<![\p{L}])(?:güvenlik uyarısı|security alert|critical security alert|hesabınızın güvenliği|hesap güvenliği|account security)(?![\p{L}])/u,
    label: 'Güvenlik uyarısı',
    confidence: 0.72,
  },
];

const RE_DEVICE =
  /(?<![\p{L}])(?<dev>windows|mac ?os|macbook|imac|mac|iphone|ipad|android|linux|chrome ?os|chromebook|chrome|safari|firefox|edge|opera|samsung|xiaomi|huawei|pixel|ubuntu|smart tv|playstation|xbox)(?:\s(?:pc|bilgisayar|telefon|cihaz|device|phone|computer|\d{1,2}))?(?![\p{L}])/gu;
const DEVICE_LABELS: Record<string, string> = {
  'mac os': 'macOS',
  macos: 'macOS',
  'chrome os': 'Chrome OS',
  chromeos: 'Chrome OS',
  iphone: 'iPhone',
  ipad: 'iPad',
  imac: 'iMac',
  macbook: 'MacBook',
};
const CITIES = [
  'İstanbul',
  'Istanbul',
  'Ankara',
  'İzmir',
  'Izmir',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Kayseri',
  'Eskişehir',
  'Trabzon',
  'Samsun',
  'Mersin',
  'Diyarbakır',
  'Kocaeli',
  'Sakarya',
  'Muğla',
  'Denizli',
  'Manisa',
  'Tekirdağ',
  'Balıkesir',
  'Aydın',
  'Hatay',
  'Malatya',
  'Erzurum',
  'Van',
  'Şanlıurfa',
  'Berlin',
  'London',
  'Londra',
  'Paris',
  'Amsterdam',
  'New York',
  'Dubai',
  'Moscow',
  'Moskova',
  'Frankfurt',
  'Munich',
  'Münih',
  'Vienna',
  'Viyana',
  'Rome',
  'Roma',
  'Madrid',
  'Lisbon',
  'Lizbon',
  'Athens',
  'Atina',
  'Sofia',
  'Bucharest',
  'Bükreş',
  'Kyiv',
  'Kiev',
  'Tbilisi',
  'Baku',
  'Bakü',
  'Tashkent',
  'Taşkent',
  'Cairo',
  'Kahire',
  'Tel Aviv',
  'Doha',
  'Riyadh',
  'Riyad',
  'Singapore',
  'Singapur',
  'Tokyo',
  'Seoul',
  'Seul',
  'Beijing',
  'Pekin',
  'Shanghai',
  'Şanghay',
  'Toronto',
  'Chicago',
  'Los Angeles',
  'San Francisco',
  'Boston',
  'Miami',
  'Sydney',
  'Sidney',
  'Melbourne',
  'Türkiye',
  'Turkey',
  'Germany',
  'Almanya',
  'France',
  'Fransa',
  'Netherlands',
  'Hollanda',
  'United States',
  'ABD',
  'United Kingdom',
  'İngiltere',
  'Italy',
  'İtalya',
  'Spain',
  'İspanya',
  'Russia',
  'Rusya',
  'Ukraine',
  'Ukrayna',
  'Georgia',
  'Gürcistan',
  'Azerbaijan',
  'Azerbaycan',
];
const RE_CITY = new RegExp(
  `(?<![\\p{L}])(?<city>${CITIES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`,
  'u',
);
const RE_LOCATION_LABEL =
  /(?<![\p{L}])(?:konum|location|yer|bölge|yaklaşık konum|approximate location)\s*[:：]\s*(?<loc>[^\n.;]{2,60})/iu;

function detectEvent(ctx: Ctx): { pattern: EventPattern; start: number; end: number } | null {
  // Subject + first lines carry the event; the body may mention several phrases ("şifrenizi değiştirin").
  for (const scope of [ctx.head, ctx.lower]) {
    for (const p of PATTERNS) {
      const m = p.re.exec(scope);
      if (m) return { pattern: p, start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

function detectDevice(ctx: Ctx): { value: string; start: number; end: number } | null {
  RE_DEVICE.lastIndex = 0;
  const found: { value: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE_DEVICE.exec(ctx.lower)) !== null && found.length < 2) {
    const raw = ctx.text
      .slice(m.index, m.index + m[0].length)
      .replace(/\s+(?:pc|bilgisayar|telefon|cihaz|device|phone|computer)$/iu, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = raw.toLowerCase();
    const value = DEVICE_LABELS[key] ?? capitalizeFirst(raw, 'en');
    if (found.some((f) => f.value.toLowerCase() === value.toLowerCase())) continue;
    found.push({ value, start: m.index, end: m.index + m[0].length });
  }
  if (found.length === 0) return null;
  const first = found[0] as { value: string; start: number; end: number };
  const last = found[found.length - 1] as { value: string; start: number; end: number };
  return { value: found.map((f) => f.value).join(' · '), start: first.start, end: last.end };
}

function detectLocation(ctx: Ctx): { value: string; start: number; end: number } | null {
  const labelled = RE_LOCATION_LABEL.exec(ctx.text);
  if (labelled?.groups?.loc) {
    const value = labelled.groups.loc
      .replace(/\s+/g, ' ')
      .replace(/[.,;)]+$/u, '')
      .trim();
    const start = labelled.index + labelled[0].length - labelled.groups.loc.length;
    return { value: value.slice(0, 120), start, end: start + labelled.groups.loc.length };
  }
  const city = RE_CITY.exec(ctx.text);
  if (city?.groups?.city) {
    const start = city.index;
    let value = city.groups.city;
    // "Ankara, Türkiye" → keep the country when it directly follows.
    const tail =
      /^,\s*(?<country>Türkiye|Turkey|Germany|Almanya|France|Fransa|Netherlands|Hollanda|United States|ABD|United Kingdom|İngiltere)(?![\p{L}])/u.exec(
        ctx.text.slice(start + value.length),
      );
    let end = start + value.length;
    if (tail?.groups?.country) {
      value = `${value}, ${tail.groups.country}`;
      end += tail[0].length;
    }
    return { value, start, end };
  }
  return null;
}

export function detectSecurity(ctx: Ctx): ExtractedLifeEvent | null {
  const strongInHead =
    RE_SECURITY_STRONG.test(ctx.head) || RE_SECURITY_EVENT_CRITICAL.test(ctx.head);
  if (!strongInHead) return null;
  const hit = detectEvent(ctx);
  if (!hit) return null;
  // One-time codes are transient, not a life event — unless a real event is reported alongside.
  if (RE_OTP.test(ctx.head) && hit.pattern.label === 'Güvenlik uyarısı') return null;
  // head and lower both start at index 0 of ctx.text, so the hit offsets address the original text.
  ctx.evidence.add(hit.start, hit.end);

  const details: ExtractedLifeEvent['details'] = { securityEvent: hit.pattern.label };
  const device = detectDevice(ctx);
  if (device) {
    details.device = device.value.slice(0, 80);
    ctx.evidence.add(device.start, device.end);
  }
  const location = detectLocation(ctx);
  if (location) {
    details.location = location.value;
    ctx.evidence.add(location.start, location.end);
  }
  let confidence = hit.pattern.confidence;
  if (device || location) confidence += 0.03;
  return {
    type: 'security',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
    occurredAt: ctx.now,
    provider: ctx.senderOrg,
  };
}
