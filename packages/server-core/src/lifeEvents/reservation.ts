/** Restaurant / hotel / event reservations: venue, address, date-time, party size — only what the source states. */
import { dateNear, labelledValue, type Ctx } from './common';
import type { ExtractedLifeEvent } from './types';

const RE_RESERVATION =
  /(?<![\p{L}])(?:rezervasyon(?:unuz|un|u|)|reservation|booking|masa(?:nız|n)?|check-?in tarihi|giriş tarihi|konaklama(?:nız)?|otel|hotel|randevu(?:nuz)?|bilet(?:iniz|leriniz)?|tickets?|etkinlik|event|konser|concert|table for|your table)(?![\p{L}])/u;
const RE_CONFIRMED =
  /(?<![\p{L}])(?:onaylandı|onaylanmıştır|confirmed|confirmation|oluşturuldu|alındı|is booked|has been booked|booked|rezerve edildi|ayrıldı)(?![\p{L}])/u;
const RE_VENUE =
  /(?<venue>\p{Lu}[\p{L}&'’.-]+(?:\s+\p{Lu}[\p{L}&'’.-]+){0,3}\s+(?:Restaurant|Restoran|Restorant|Otel|Oteli|Hotel|Resort|Cafe|Café|Kafe|Bistro|Lokanta|Lokantası|Meyhane|Meyhanesi|Steakhouse|Brasserie|Balık|Ocakbaşı|Kebap|Pizzeria|Bar|Lounge|Club|Kulübü|Sahne|Arena|Stadyum|Stadı|Salonu|Tiyatrosu|Theatre|Theater|Hall|Merkezi|Center|Centre|Spa|Kliniği|Clinic|Hastanesi|Hospital))(?![\p{L}])/u;
const RE_PARTY =
  /(?<![\d])(?<n>\d{1,3})\s*(?:kişilik|kişi|guests?|people|persons?|pax|misafir|yetişkin|adults?)(?![\p{L}])/iu;
const RE_DATE_LABEL =
  /(?<![\p{L}])(?:tarih|date|check-?in|giriş|saat|time|rezervasyon|reservation|booking|masa|table|randevu|etkinlik|event|konser|başlangıç|start)(?![\p{L}])/u;

export function detectReservation(ctx: Ctx): ExtractedLifeEvent | null {
  if (!RE_RESERVATION.test(ctx.head)) return null;
  const details: ExtractedLifeEvent['details'] = {};
  let confidence = 0.5;

  const venueLabel = labelledValue(
    ctx.text,
    /mekan|mekân|venue|otel|hotel|restoran|restaurant|yer|konum|location|place/,
  );
  const venueMatch = RE_VENUE.exec(ctx.text);
  const venue = venueLabel?.value ?? venueMatch?.groups?.venue ?? null;
  if (venue) {
    details.venue = venue.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (venueLabel) ctx.evidence.add(venueLabel.start, venueLabel.end);
    else if (venueMatch)
      ctx.evidence.add(venueMatch.index, venueMatch.index + venueMatch[0].length);
    confidence += 0.1;
  } else if (
    ctx.senderOrg &&
    !/(?<![\p{L}])(?:booking\.com|airbnb|obilet|biletix|passo|opentable|resy|thefork|zomato|yemeksepeti|getir)(?![\p{L}])/iu.test(
      ctx.senderOrg,
    )
  ) {
    details.venue = ctx.senderOrg.slice(0, 120);
    confidence += 0.05;
  }

  const address = labelledValue(ctx.text, /adres|address|konum|location/);
  if (address && !/^https?:/iu.test(address.value)) {
    details.address = address.value.slice(0, 240);
    ctx.evidence.add(address.start, address.end);
  }

  const when =
    dateNear(ctx, RE_DATE_LABEL, (d) => d.kind !== 'time' && d.hasTime) ??
    dateNear(ctx, RE_DATE_LABEL, (d) => d.kind !== 'time') ??
    ctx.dates.find((d) => d.kind !== 'time') ??
    null;
  if (when) {
    details.reservationAt = when.iso;
    ctx.evidence.add(when.start, when.end);
    confidence += when.hasTime ? 0.2 : 0.12;
  }

  const party = RE_PARTY.exec(ctx.text);
  if (party?.groups?.n) {
    const n = Number(party.groups.n);
    if (n >= 1 && n <= 200) {
      details.partySize = n;
      ctx.evidence.add(party.index, party.index + party[0].length);
      confidence += 0.05;
    }
  }
  if (RE_CONFIRMED.test(ctx.head)) confidence += 0.05;
  if (details.reservationAt === undefined && details.venue === undefined) return null;
  return {
    type: 'reservation',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.9, Math.round(confidence * 100) / 100),
    occurredAt: null,
    provider: ctx.senderOrg,
  };
}
