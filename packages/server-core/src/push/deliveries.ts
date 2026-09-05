/**
 * Delivery planning around the Expo client: which tokens get a message (dedupe, inactive or
 * malformed tokens skipped) and what to do with each ticket/receipt afterwards.
 */
import type { PushToken } from '@da/domain';
import type { NotificationPayload } from '../notifications';
import {
  classifyExpoOutcome,
  isExpoPushToken,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from './expo';
import { toExpoMessage, type ToExpoMessageOptions } from './messages';

export type DeliverySkipReason =
  'already_sent' | 'inactive' | 'invalid_token' | 'duplicate_token' | 'unsupported_platform';

export interface PlannedDelivery {
  token: PushToken;
  message: ExpoPushMessage;
}

export interface DeliveryPlan {
  dedupeKey: string;
  /** Messages in the same order as `deliveries` (feed straight into `sendExpoPush`). */
  messages: ExpoPushMessage[];
  deliveries: PlannedDelivery[];
  skipped: { tokenId: string; reason: DeliverySkipReason }[];
}

export interface PlanDeliveriesInput {
  tokens: readonly PushToken[];
  payload: NotificationPayload;
  /** Defaults to `payload.dedupeKey`. */
  dedupeKey?: string;
  /** Dedupe keys (or `${dedupeKey}:${tokenId}` pairs) already delivered for this user. */
  alreadySent: ReadonlySet<string>;
  options?: ToExpoMessageOptions;
}

/** Decide which active, valid, not-yet-notified tokens receive the payload. */
export function planDeliveries(input: PlanDeliveriesInput): DeliveryPlan {
  const dedupeKey = input.dedupeKey ?? input.payload.dedupeKey;
  const plan: DeliveryPlan = { dedupeKey, messages: [], deliveries: [], skipped: [] };
  const seenTokens = new Set<string>();
  const sentForUser = input.alreadySent.has(dedupeKey);
  for (const token of input.tokens) {
    const skip = (reason: DeliverySkipReason) => plan.skipped.push({ tokenId: token.id, reason });
    if (sentForUser || input.alreadySent.has(`${dedupeKey}:${token.id}`)) {
      skip('already_sent');
      continue;
    }
    if (!token.isActive) {
      skip('inactive');
      continue;
    }
    if (token.platform !== 'ios' && token.platform !== 'android') {
      skip('unsupported_platform');
      continue;
    }
    if (!isExpoPushToken(token.token)) {
      skip('invalid_token');
      continue;
    }
    if (seenTokens.has(token.token)) {
      skip('duplicate_token');
      continue;
    }
    seenTokens.add(token.token);
    const message = toExpoMessage(token.token, input.payload, input.options);
    plan.messages.push(message);
    plan.deliveries.push({ token, message });
  }
  return plan;
}

export interface TicketSummary {
  /** Token ids whose message was accepted by Expo (receipt pending). */
  delivered: string[];
  /** Token ids to mark inactive (device no longer registered / token malformed). */
  toDisable: string[];
  /** Token ids to try again later (rate limited, transient). */
  retry: string[];
  /** Token ids that failed for a non-retryable reason (payload too big, credentials). */
  failed: { tokenId: string; outcome: string; message: string }[];
  /** Ticket id per delivered token id — needed to poll receipts. */
  ticketIds: Record<string, string>;
}

function emptySummary(): TicketSummary {
  return { delivered: [], toDisable: [], retry: [], failed: [], ticketIds: {} };
}

function applyOutcome(
  summary: TicketSummary,
  tokenId: string,
  result: ExpoPushTicket | ExpoPushReceipt,
  onOk: () => void,
): void {
  const outcome = classifyExpoOutcome(result);
  switch (outcome) {
    case 'ok':
      onOk();
      return;
    case 'device_not_registered':
    case 'invalid_token':
      summary.toDisable.push(tokenId);
      return;
    case 'rate_exceeded':
    case 'unknown_error':
      summary.retry.push(tokenId);
      return;
    case 'message_too_big':
    case 'invalid_credentials':
      summary.failed.push({
        tokenId,
        outcome,
        message: result.status === 'error' ? result.message : '',
      });
      return;
  }
}

/** Interpret send tickets (aligned by index with the planned tokens). */
export function summarizeTickets(
  tickets: readonly ExpoPushTicket[],
  tokens: readonly Pick<PushToken, 'id'>[],
): TicketSummary {
  const summary = emptySummary();
  tokens.forEach((token, index) => {
    const ticket = tickets[index];
    if (!ticket) {
      summary.retry.push(token.id);
      return;
    }
    applyOutcome(summary, token.id, ticket, () => {
      summary.delivered.push(token.id);
      if (ticket.status === 'ok') summary.ticketIds[token.id] = ticket.id;
    });
  });
  return summary;
}

/** Interpret receipts; `ticketTokenIds` maps ticket id → token id (from `summarizeTickets`). */
export function summarizeReceipts(
  receipts: Record<string, ExpoPushReceipt>,
  ticketTokenIds: Record<string, string>,
): TicketSummary {
  const summary = emptySummary();
  for (const [ticketId, tokenId] of Object.entries(ticketTokenIds)) {
    const receipt = receipts[ticketId];
    if (!receipt) continue;
    applyOutcome(summary, tokenId, receipt, () => {
      summary.delivered.push(tokenId);
      summary.ticketIds[tokenId] = ticketId;
    });
  }
  return summary;
}
