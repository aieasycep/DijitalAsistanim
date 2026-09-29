/**
 * lifeEvents — deterministic extraction of personal life events from transactional mail:
 * shipments, flights, reservations, bills/payments, subscription renewals and security alerts.
 *
 * Every date, amount, tracking number, flight number or PNR is backed by a verbatim evidence
 * snippet from the source; fields the source does not state are simply absent. The result satisfies
 * `lifeEventExtractionSchema` (@da/validation) and is ready to become a LifeEvent row.
 */
import type { Locale } from '@da/domain';
import { EvidenceCollector, buildContext, type Ctx } from './common.ts';
import { detectFlight } from './flight.ts';
import { detectPayment } from './payment.ts';
import { detectReservation } from './reservation.ts';
import { detectSecurity } from './security.ts';
import { detectShipment } from './shipment.ts';
import { detectSubscription, hasRenewalCue } from './subscription.ts';
import { lifeEventTitle } from './titles.ts';
import type { ExtractLifeEventInput, ExtractedLifeEvent } from './types.ts';

export type {
  BillKind,
  ExtractLifeEventInput,
  ExtractedLifeEvent,
  LifeEventStatusValue,
  LifeEventTitleOptions,
} from './types.ts';
export {
  lifeEventActions,
  lifeEventDedupeKey,
  lifeEventEventAt,
  lifeEventStatus,
  lifeEventTitle,
  type LifeEventLike,
} from './titles.ts';
export {
  findAmounts as findLifeEventAmounts,
  formatAmount as formatLifeEventAmount,
  parseAmountNumber,
  senderOrgName,
} from './common.ts';

const MIN_CONFIDENCE = 0.5;

type Detector = (ctx: Ctx) => ExtractedLifeEvent | null;

/** Fixed precedence: security beats everything, transport beats commerce, renewals beat generic bills. */
const DETECTORS: Detector[] = [
  detectSecurity,
  detectFlight,
  detectShipment,
  (ctx) => (hasRenewalCue(ctx) ? detectSubscription(ctx) : null),
  detectPayment,
  detectReservation,
  detectSubscription,
];

/** The single most likely life event in an e-mail, or null when nothing evidenced is found. */
export function extractLifeEvent(input: ExtractLifeEventInput): ExtractedLifeEvent | null {
  if (!input.now || Number.isNaN(Date.parse(input.now))) return null;
  const base = buildContext(input);
  if (!base.text.trim()) return null;
  const locale: Locale = input.locale ?? 'tr';
  for (const detect of DETECTORS) {
    const ctx: Ctx = { ...base, evidence: new EvidenceCollector(base.text) };
    const found = detect(ctx);
    if (!found || found.confidence < MIN_CONFIDENCE) continue;
    found.title = lifeEventTitle(found, locale, { now: input.now, timezone: input.timezone });
    return found;
  }
  return null;
}
