/** Flights: airline, flight number, route, departure/arrival with evidence, labelled PNR, check-in link. */
import { localDateTimeOf, localToUtcIso, parseDateKey, type ExtractedDate } from '../dates';
import { RE_TRAVEL } from '../triage/signals';
import { sentenceAround, type Ctx } from './common';
import type { ExtractedLifeEvent } from './types';

const AIRLINE_BY_CODE: Record<string, string> = {
  TK: 'THY',
  PC: 'Pegasus',
  VF: 'AJet',
  XQ: 'SunExpress',
  LH: 'Lufthansa',
  BA: 'British Airways',
  AF: 'Air France',
  KL: 'KLM',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  W6: 'Wizz Air',
  FR: 'Ryanair',
  U2: 'easyJet',
  EY: 'Etihad',
  SV: 'Saudia',
  AZ: 'ITA Airways',
  IB: 'Iberia',
  OS: 'Austrian',
  LX: 'Swiss',
  SK: 'SAS',
  AY: 'Finnair',
  LO: 'LOT',
  MS: 'EgyptAir',
  RJ: 'Royal Jordanian',
  A3: 'Aegean',
  TP: 'TAP',
  UA: 'United',
  AA: 'American Airlines',
  DL: 'Delta',
  AC: 'Air Canada',
  JL: 'JAL',
  NH: 'ANA',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  KE: 'Korean Air',
  ET: 'Ethiopian',
  MH: 'Malaysia Airlines',
  VS: 'Virgin Atlantic',
  SU: 'Aeroflot',
  PS: 'UIA',
  FZ: 'flydubai',
  G9: 'Air Arabia',
  '6E': 'IndiGo',
  AI: 'Air India',
  OK: 'Czech Airlines',
  RO: 'TAROM',
  JU: 'Air Serbia',
  BT: 'airBaltic',
  TU: 'Tunisair',
  AT: 'Royal Air Maroc',
  LY: 'El Al',
  J2: 'AZAL',
  HY: 'Uzbekistan Airways',
  KC: 'Air Astana',
  WY: 'Oman Air',
  GF: 'Gulf Air',
  KU: 'Kuwait Airways',
  ME: 'MEA',
};
const AIRLINE_NAMES: [RegExp, string][] = [
  [/(?<![\p{L}])(?:thy|türk hava yolları|turkish airlines)(?![\p{L}])/u, 'THY'],
  [/(?<![\p{L}])(?:pegasus|flypgs)(?![\p{L}])/u, 'Pegasus'],
  [/(?<![\p{L}])(?:ajet|anadolujet)(?![\p{L}])/u, 'AJet'],
  [/(?<![\p{L}])sunexpress(?![\p{L}])/u, 'SunExpress'],
  [/(?<![\p{L}])lufthansa(?![\p{L}])/u, 'Lufthansa'],
  [/(?<![\p{L}])(?:british airways)(?![\p{L}])/u, 'British Airways'],
  [/(?<![\p{L}])(?:air france)(?![\p{L}])/u, 'Air France'],
  [/(?<![\p{L}])klm(?![\p{L}])/u, 'KLM'],
  [/(?<![\p{L}])emirates(?![\p{L}])/u, 'Emirates'],
  [/(?<![\p{L}])(?:qatar airways)(?![\p{L}])/u, 'Qatar Airways'],
  [/(?<![\p{L}])(?:wizz air)(?![\p{L}])/u, 'Wizz Air'],
  [/(?<![\p{L}])ryanair(?![\p{L}])/u, 'Ryanair'],
  [/(?<![\p{L}])easyjet(?![\p{L}])/u, 'easyJet'],
];
const KNOWN_CODES = new RegExp(
  `(?<![A-Z0-9])(?<code>${Object.keys(AIRLINE_BY_CODE).join('|')})\\s?(?<num>\\d{2,4})(?![0-9])`,
  'gu',
);
const RE_GENERIC_FLIGHT = /(?<![A-Z0-9])(?<code>[A-Z]{2})\s?(?<num>\d{2,4})(?![0-9])/gu;
const NOT_FLIGHT_CODES = new Set([
  'TR',
  'TL',
  'TC',
  'PNR',
  'NO',
  'ID',
  'KG',
  'CM',
  'MM',
  'GB',
  'MB',
  'TB',
  'HD',
  'TV',
  'PC',
  'US',
  'EU',
  'UK',
  'DE',
  'FR',
  'IT',
  'ES',
  'NL',
  'BE',
  'AT',
  'CH',
  'SE',
  'DK',
  'NO',
  'FI',
  'PL',
  'CZ',
  'HU',
  'RO',
  'BG',
  'GR',
  'PT',
  'IE',
]);
const RE_FLIGHT_WORD =
  /(?<![\p{L}])(?:uçuş|uçuşunuz|sefer|seferi|flight|flights|uçuş no|flight number|flight no)(?![\p{L}])/u;
const AIRPORTS = new Set([
  'IST',
  'SAW',
  'AYT',
  'ESB',
  'ADB',
  'ADA',
  'GZT',
  'TZX',
  'DLM',
  'BJV',
  'ASR',
  'KYA',
  'VAN',
  'DIY',
  'ERZ',
  'SZF',
  'HTY',
  'NAV',
  'MLX',
  'EZS',
  'GNY',
  'KCM',
  'AJI',
  'MZH',
  'OGU',
  'KSY',
  'TJK',
  'DNZ',
  'EDO',
  'YEI',
  'MSR',
  'ISE',
  'BAL',
  'CKZ',
  'USQ',
  'ONQ',
  'SFQ',
  'IGD',
  'NKT',
  'VAS',
  'AOE',
  'LHR',
  'LGW',
  'STN',
  'LTN',
  'CDG',
  'ORY',
  'FRA',
  'MUC',
  'AMS',
  'MAD',
  'BCN',
  'FCO',
  'MXP',
  'VIE',
  'ZRH',
  'BRU',
  'CPH',
  'ARN',
  'OSL',
  'HEL',
  'WAW',
  'PRG',
  'BUD',
  'ATH',
  'DXB',
  'DOH',
  'AUH',
  'JFK',
  'EWR',
  'LAX',
  'ORD',
  'SFO',
  'YYZ',
  'NRT',
  'HND',
  'ICN',
  'SIN',
  'BKK',
  'DEL',
  'BOM',
  'TLV',
  'CAI',
  'JED',
  'RUH',
  'KWI',
  'BAH',
  'TBS',
  'GYD',
  'ALA',
  'TAS',
  'LIS',
  'DUB',
  'MAN',
  'EDI',
  'BER',
  'HAM',
  'DUS',
  'CGN',
  'STR',
  'NCE',
  'LYS',
  'MRS',
  'GVA',
  'BSL',
  'LUX',
  'OTP',
  'SOF',
  'SKP',
  'BEG',
  'ZAG',
  'LJU',
  'SJJ',
  'TIA',
  'PRN',
  'KIV',
  'KBP',
  'MSQ',
  'LED',
  'SVO',
  'VKO',
  'DME',
  'TUN',
  'ALG',
  'CMN',
  'RAK',
  'ADD',
  'NBO',
  'JNB',
  'CPT',
  'LOS',
  'ACC',
  'DKR',
  'HKG',
  'PEK',
  'PVG',
  'CAN',
  'KUL',
  'CGK',
  'MNL',
  'SYD',
  'MEL',
  'AKL',
  'GRU',
  'EZE',
  'MEX',
  'BOG',
  'LIM',
  'SCL',
  'YUL',
  'YVR',
  'MIA',
  'BOS',
  'IAD',
  'DCA',
  'ATL',
  'DFW',
  'IAH',
  'SEA',
  'DEN',
  'LAS',
  'PHX',
  'MSP',
  'DTW',
  'PHL',
  'CLT',
  'BWI',
  'SLC',
  'SAN',
  'TPA',
  'MCO',
  'FLL',
  'HNL',
  'MCT',
  'AMM',
  'BEY',
  'IKA',
  'ISB',
  'KHI',
  'LHE',
  'DAC',
  'CMB',
  'KTM',
  'RGN',
  'SGN',
  'HAN',
  'TPE',
  'MFM',
  'BNE',
  'PER',
  'CHC',
]);
const CITY_NAMES = [
  'İstanbul',
  'Istanbul',
  'Ankara',
  'İzmir',
  'Izmir',
  'Antalya',
  'Adana',
  'Bodrum',
  'Dalaman',
  'Trabzon',
  'Gaziantep',
  'Kayseri',
  'Konya',
  'Samsun',
  'Diyarbakır',
  'Van',
  'Erzurum',
  'Malatya',
  'Hatay',
  'Nevşehir',
  'Kapadokya',
  'Denizli',
  'Bursa',
  'Londra',
  'London',
  'Paris',
  'Berlin',
  'Frankfurt',
  'Münih',
  'Munich',
  'Amsterdam',
  'Roma',
  'Rome',
  'Milano',
  'Milan',
  'Madrid',
  'Barcelona',
  'Barselona',
  'Viyana',
  'Vienna',
  'Zürih',
  'Zurich',
  'Brüksel',
  'Brussels',
  'Kopenhag',
  'Copenhagen',
  'Stockholm',
  'Oslo',
  'Helsinki',
  'Varşova',
  'Warsaw',
  'Prag',
  'Prague',
  'Budapeşte',
  'Budapest',
  'Atina',
  'Athens',
  'Dubai',
  'Doha',
  'Abu Dabi',
  'Abu Dhabi',
  'New York',
  'Los Angeles',
  'Chicago',
  'Toronto',
  'Tokyo',
  'Seul',
  'Seoul',
  'Singapur',
  'Singapore',
  'Bangkok',
  'Delhi',
  'Mumbai',
  'Tel Aviv',
  'Kahire',
  'Cairo',
  'Cidde',
  'Jeddah',
  'Riyad',
  'Riyadh',
  'Tiflis',
  'Tbilisi',
  'Bakü',
  'Baku',
  'Almatı',
  'Almaty',
  'Taşkent',
  'Tashkent',
  'Lizbon',
  'Lisbon',
  'Dublin',
  'Manchester',
  'Hamburg',
  'Düsseldorf',
  'Köln',
  'Cologne',
  'Stuttgart',
  'Nice',
  'Lyon',
  'Marsilya',
  'Marseille',
  'Cenevre',
  'Geneva',
  'Basel',
  'Lüksemburg',
  'Luxembourg',
  'Bükreş',
  'Bucharest',
  'Sofya',
  'Sofia',
  'Üsküp',
  'Skopje',
  'Belgrad',
  'Belgrade',
  'Zagreb',
  'Saraybosna',
  'Sarajevo',
  'Tiran',
  'Tirana',
  'Priştine',
  'Pristina',
  'Kişinev',
  'Kyiv',
  'Kiev',
  'Minsk',
  'Moskova',
  'Moscow',
  'Tunus',
  'Tunis',
  'Cezayir',
  'Kazablanka',
  'Casablanca',
  'Nairobi',
  'Johannesburg',
  'Cape Town',
  'Hong Kong',
  'Pekin',
  'Beijing',
  'Şanghay',
  'Shanghai',
  'Kuala Lumpur',
  'Cakarta',
  'Jakarta',
  'Manila',
  'Sidney',
  'Sydney',
  'Melbourne',
  'Miami',
  'Boston',
  'Washington',
  'Atlanta',
  'Dallas',
  'Houston',
  'Seattle',
  'Denver',
  'Las Vegas',
  'Montreal',
  'Vancouver',
  'Muskat',
  'Muscat',
  'Amman',
  'Beyrut',
  'Beirut',
  'Tahran',
  'Tehran',
  'İslamabad',
  'Islamabad',
  'Karaçi',
  'Karachi',
  'Lahor',
  'Lahore',
  'Sabiha Gökçen',
];
const CITY_ALT = CITY_NAMES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const ARROW = '(?:→|->|—>|–>|>|–|—|-|to|➜|»)';
/** "İstanbul (IST) – 10:30 Antalya (AYT)", "Istanbul (IST) to Antalya (AYT)". */
const RE_ROUTE_PAREN = new RegExp(
  `(?<from>\\p{Lu}[\\p{L}. ]{1,30}?)\\s*\\((?<fc>[A-Z]{3})\\)\\s*${ARROW}\\s*(?:\\d{1,2}[:.]\\d{2}\\s*)?(?<to>\\p{Lu}[\\p{L}. ]{1,30}?)\\s*\\((?<tc>[A-Z]{3})\\)`,
  'u',
);
/** "IST → AYT", "IST-AYT". */
const RE_ROUTE_CODES = new RegExp(
  `(?<![A-Z])(?<fc>[A-Z]{3})\\s*${ARROW}\\s*(?<tc>[A-Z]{3})(?![A-Z])`,
  'u',
);
/** "İstanbul – Antalya" with known city names. */
const RE_ROUTE_CITIES = new RegExp(
  `(?<![\\p{L}])(?<from>${CITY_ALT})\\s*${ARROW}\\s*(?<to>${CITY_ALT})(?![\\p{L}])`,
  'u',
);
const RE_PNR =
  /(?<![\p{L}])(?:pnr|rezervasyon (?:kodu|kodunuz|numarası|numaranız|no|referansı)|booking (?:reference|code|ref|number)|onay kodu|onay kodunuz|confirmation (?:code|number)|reservation (?:code|number)|record locator|e-?bilet (?:no|numarası))\s*(?:no|numarası|number|code)?\s*[:#.]?\s*(?<pnr>[A-Z0-9]{6})(?![A-Z0-9])/iu;
const RE_DEPARTURE =
  /(?<![\p{L}])(?:kalkış|departure|departs|departing|depart|uçuş\p{L}*|sefer\p{L}*|flight|gidiş|outbound)(?![\p{L}])/u;
const RE_ARRIVAL = /(?<![\p{L}])(?:varış|arrival|arrives|arriving|iniş)(?![\p{L}])/u;

interface FlightNumberHit {
  flightNumber: string;
  code: string;
  start: number;
  end: number;
}

function findFlightNumber(ctx: Ctx): FlightNumberHit | null {
  KNOWN_CODES.lastIndex = 0;
  const known = KNOWN_CODES.exec(ctx.text);
  if (known?.groups?.code && known.groups.num) {
    return {
      flightNumber: `${known.groups.code}${known.groups.num}`,
      code: known.groups.code,
      start: known.index,
      end: known.index + known[0].length,
    };
  }
  RE_GENERIC_FLIGHT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_GENERIC_FLIGHT.exec(ctx.text)) !== null) {
    const code = m.groups?.code ?? '';
    const num = m.groups?.num ?? '';
    if (NOT_FLIGHT_CODES.has(code)) continue;
    const before = ctx.lower.slice(Math.max(0, m.index - 30), m.index);
    if (!RE_FLIGHT_WORD.test(before)) continue;
    return { flightNumber: `${code}${num}`, code, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function findAirline(ctx: Ctx, code: string | null): string | null {
  for (const [re, name] of AIRLINE_NAMES) if (re.test(ctx.lower)) return name;
  if (code && AIRLINE_BY_CODE[code]) return AIRLINE_BY_CODE[code] ?? null;
  const org = ctx.senderOrg;
  if (org)
    for (const [re, name] of AIRLINE_NAMES)
      if (re.test(org.toLocaleLowerCase('tr-TR'))) return name;
  return null;
}

interface Route {
  from: string;
  to: string;
  start: number;
  end: number;
}

function cleanCity(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '')
    .trim();
}

function findRoute(ctx: Ctx): Route | null {
  const paren = RE_ROUTE_PAREN.exec(ctx.text);
  if (paren?.groups?.from && paren.groups.to && paren.groups.fc && paren.groups.tc) {
    const from = `${cleanCity(paren.groups.from)} (${paren.groups.fc})`;
    const to = `${cleanCity(paren.groups.to)} (${paren.groups.tc})`;
    return { from, to, start: paren.index, end: paren.index + paren[0].length };
  }
  const codes = RE_ROUTE_CODES.exec(ctx.text);
  if (
    codes?.groups?.fc &&
    codes.groups.tc &&
    AIRPORTS.has(codes.groups.fc) &&
    AIRPORTS.has(codes.groups.tc)
  ) {
    return {
      from: codes.groups.fc,
      to: codes.groups.tc,
      start: codes.index,
      end: codes.index + codes[0].length,
    };
  }
  const cities = RE_ROUTE_CITIES.exec(ctx.text);
  if (cities?.groups?.from && cities.groups.to) {
    return {
      from: cities.groups.from,
      to: cities.groups.to,
      start: cities.index,
      end: cities.index + cities[0].length,
    };
  }
  return null;
}

function isDayish(d: ExtractedDate): boolean {
  return d.kind !== 'time';
}

/** Departure: a dated span near "kalkış/uçuş/sefer/flight", else the first dated span. Arrival: labelled, else the next clock after departure. */
function findTimes(
  ctx: Ctx,
  route: Route | null,
): {
  departure: ExtractedDate | null;
  arrival: { iso: string; start: number; end: number } | null;
} {
  const dated = ctx.dates.filter(isDayish);
  let departure: ExtractedDate | null = null;
  for (const d of dated) {
    const s = sentenceAround(ctx.lower, d.start);
    const sentence = ctx.lower.slice(s.start, s.end);
    if (RE_DEPARTURE.test(sentence) && !RE_ARRIVAL.test(ctx.lower.slice(s.start, d.start))) {
      departure = d;
      break;
    }
  }
  if (!departure) departure = dated.find((d) => d.hasTime) ?? dated[0] ?? null;
  if (!departure) return { departure: null, arrival: null };

  let arrival: { iso: string; start: number; end: number } | null = null;
  const labelledArrival = ctx.dates.find(
    (d) =>
      d.start > departure.end &&
      RE_ARRIVAL.test(ctx.lower.slice(Math.max(0, d.start - 24), d.start)),
  );
  const nextClock = ctx.dates.find(
    (d) =>
      d.start > departure.end &&
      d.kind === 'time' &&
      d.hasTime &&
      (route === null || d.start <= route.end + 4),
  );
  const pick = labelledArrival ?? nextClock ?? null;
  if (pick) {
    if (pick.kind === 'time') {
      // Clock-only arrival: same local day as the departure (next day when it precedes the departure clock).
      const depLocal = localDateTimeOf(departure.iso, ctx.timezone);
      const arrLocal = localDateTimeOf(pick.iso, ctx.timezone);
      let date = parseDateKey(departure.localDate);
      let iso = localToUtcIso(date, arrLocal.hh, arrLocal.mm, ctx.timezone);
      if (
        Date.parse(iso) < Date.parse(departure.iso) ||
        (arrLocal.hh < depLocal.hh && departure.hasTime)
      ) {
        date = { ...date, d: date.d + 1 };
        const rolled = new Date(Date.UTC(date.y, date.m - 1, date.d));
        iso = localToUtcIso(
          { y: rolled.getUTCFullYear(), m: rolled.getUTCMonth() + 1, d: rolled.getUTCDate() },
          arrLocal.hh,
          arrLocal.mm,
          ctx.timezone,
        );
      }
      arrival = { iso, start: pick.start, end: pick.end };
    } else {
      arrival = { iso: pick.iso, start: pick.start, end: pick.end };
    }
  }
  return { departure, arrival };
}

export function detectFlight(ctx: Ctx): ExtractedLifeEvent | null {
  const flight = findFlightNumber(ctx);
  const travelish = RE_TRAVEL.test(ctx.head) || RE_FLIGHT_WORD.test(ctx.lower);
  if (!flight && !travelish) return null;
  const airline = findAirline(ctx, flight?.code ?? null);
  const route = findRoute(ctx);
  if (!flight && !(airline && route)) return null;
  if (
    !flight &&
    !RE_FLIGHT_WORD.test(ctx.lower) &&
    !/(?<![\p{L}])(?:boarding|biniş|check-?in|gate|kapı|e-?bilet|e-?ticket|havalimanı|airport)(?![\p{L}])/u.test(
      ctx.lower,
    )
  )
    return null;

  const details: ExtractedLifeEvent['details'] = {};
  let confidence = 0.55;
  if (flight) {
    details.flightNumber = flight.flightNumber;
    ctx.evidence.add(flight.start, flight.end);
    confidence += 0.2;
  }
  if (airline) details.airline = airline;
  if (route) {
    details.from = route.from;
    details.to = route.to;
    ctx.evidence.add(route.start, route.end);
    confidence += 0.1;
  }
  const { departure, arrival } = findTimes(ctx, route);
  if (departure) {
    details.departureAt = departure.iso;
    ctx.evidence.add(departure.start, departure.end);
    confidence += departure.hasTime ? 0.1 : 0.05;
  }
  if (arrival) {
    details.arrivalAt = arrival.iso;
    ctx.evidence.add(arrival.start, arrival.end);
  }
  const pnr = RE_PNR.exec(ctx.text);
  if (pnr?.groups?.pnr && /[A-Z]/.test(pnr.groups.pnr) && /^[A-Z0-9]{6}$/.test(pnr.groups.pnr)) {
    details.pnr = pnr.groups.pnr;
    const start = pnr.index + pnr[0].length - pnr.groups.pnr.length;
    ctx.evidence.add(start, start + 6);
    confidence += 0.05;
  }
  const checkIn = ctx.urls.find((u) => /check-?in/iu.test(u.url));
  if (checkIn) details.checkInUrl = checkIn.url;
  return {
    type: 'flight',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
    occurredAt: null,
    provider: airline ?? ctx.senderOrg,
  };
}
