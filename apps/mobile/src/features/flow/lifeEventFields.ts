/**
 * Evidence-only rendering of a life event: which detail fields each category shows, in which order.
 * Missing values render as "Kaynakta belirtilmemiş" — the UI never invents a carrier, a gate or a due date.
 */
import type { LifeEvent, LifeEventType } from '@da/domain';
import { formatMoney, formatRelativeLabel, type FormatCtx } from '@da/i18n';

export type LifeFieldKey =
  | 'carrier'
  | 'trackingNumber'
  | 'merchant'
  | 'deliveryWindow'
  | 'flightNumber'
  | 'airline'
  | 'route'
  | 'departureAt'
  | 'arrivalAt'
  | 'pnr'
  | 'venue'
  | 'address'
  | 'reservationAt'
  | 'partySize'
  | 'amount'
  | 'dueAt'
  | 'payee'
  | 'serviceName'
  | 'renewsAt'
  | 'securityEvent'
  | 'device'
  | 'location';

export const LIFE_FIELDS: Record<LifeEventType, LifeFieldKey[]> = {
  shipment: ['merchant', 'carrier', 'trackingNumber', 'deliveryWindow'],
  flight: ['flightNumber', 'airline', 'route', 'departureAt', 'arrivalAt', 'pnr'],
  reservation: ['venue', 'reservationAt', 'partySize', 'address'],
  payment: ['payee', 'amount', 'dueAt'],
  subscription: ['serviceName', 'amount', 'renewsAt'],
  security: ['serviceName', 'securityEvent', 'device', 'location'],
};

export type LifeActionKind =
  'track' | 'check_in' | 'open_link' | 'pay' | 'directions' | 'remind' | 'done';

export interface LifeAction {
  kind: LifeActionKind;
  url?: string | null;
}

/** Value for a field, or null when the source did not state it. */
export function lifeFieldValue(event: LifeEvent, key: LifeFieldKey, ctx: FormatCtx): string | null {
  const d = event.details;
  const at = (iso: string | null | undefined) => (iso ? formatRelativeLabel(iso, ctx) : null);
  switch (key) {
    case 'carrier':
      return d.carrier ?? null;
    case 'trackingNumber':
      return d.trackingNumber ?? null;
    case 'merchant':
      return d.merchant ?? null;
    case 'deliveryWindow':
      return d.deliveryWindow?.start || d.deliveryWindow?.end
        ? [at(d.deliveryWindow.start), at(d.deliveryWindow.end)].filter(Boolean).join('–')
        : null;
    case 'flightNumber':
      return d.flightNumber ?? null;
    case 'airline':
      return d.airline ?? null;
    case 'route':
      return d.from || d.to ? `${d.from ?? '?'} → ${d.to ?? '?'}` : null;
    case 'departureAt':
      return at(d.departureAt);
    case 'arrivalAt':
      return at(d.arrivalAt);
    case 'pnr':
      return d.pnr ?? null;
    case 'venue':
      return d.venue ?? null;
    case 'address':
      return d.address ?? null;
    case 'reservationAt':
      return at(d.reservationAt);
    case 'partySize':
      return typeof d.partySize === 'number' ? String(d.partySize) : null;
    case 'amount':
      return typeof d.amount === 'number'
        ? formatMoney(d.amount, d.currency ?? 'TRY', ctx.locale)
        : null;
    case 'dueAt':
      return at(d.dueAt);
    case 'payee':
      return d.payee ?? null;
    case 'serviceName':
      return d.serviceName ?? null;
    case 'renewsAt':
      return at(d.renewsAt);
    case 'securityEvent':
      return d.securityEvent ?? null;
    case 'device':
      return d.device ?? null;
    case 'location':
      return d.location ?? null;
  }
}

/** Hand-off actions available for the event — only when the source carries the link they need. */
export function lifeActionsFor(event: LifeEvent): LifeAction[] {
  const d = event.details;
  const actions: LifeAction[] = [];
  switch (event.type) {
    case 'shipment':
      if (d.trackingUrl) actions.push({ kind: 'track', url: d.trackingUrl });
      actions.push({ kind: 'remind' });
      break;
    case 'flight':
      if (d.checkInUrl) actions.push({ kind: 'check_in', url: d.checkInUrl });
      actions.push({ kind: 'remind' });
      break;
    case 'reservation':
      if (d.address || d.venue) actions.push({ kind: 'directions' });
      actions.push({ kind: 'remind' });
      break;
    case 'payment':
      if (d.paymentUrl) actions.push({ kind: 'pay', url: d.paymentUrl });
      actions.push({ kind: 'remind' });
      break;
    case 'subscription':
      if (event.source.url) actions.push({ kind: 'open_link', url: event.source.url });
      actions.push({ kind: 'remind' });
      break;
    case 'security':
      if (event.source.url) actions.push({ kind: 'open_link', url: event.source.url });
      break;
  }
  if (event.status !== 'done') actions.push({ kind: 'done' });
  return actions;
}

export function lifeEventWhen(event: LifeEvent): string | null {
  const d = event.details;
  switch (event.type) {
    case 'flight':
      return d.departureAt ?? event.eventAt ?? null;
    case 'reservation':
      return d.reservationAt ?? event.eventAt ?? null;
    case 'payment':
      return d.dueAt ?? event.eventAt ?? null;
    case 'subscription':
      return d.renewsAt ?? event.eventAt ?? null;
    default:
      return event.eventAt ?? null;
  }
}
