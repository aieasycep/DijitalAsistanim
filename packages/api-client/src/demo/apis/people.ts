import type { Contact, PersonIntelligence, VipPerson } from '@da/domain';
import { vipUpsertSchema } from '@da/validation';
import type { PeopleApi } from '../../datasource';
import type { DemoContext } from '../context';
import { reinforcePreference } from '../core/learning';
import { eventsForContact, getContact, threadsForContact, threadSource } from '../core/lookup';
import type { DemoState } from '../state';
import { fold } from '../text';
import { notFound, validate } from '../validate';

function addVipCore(
  ctx: DemoContext,
  s: DemoState,
  input: {
    contactId?: string | null;
    displayName: string;
    email?: string | null;
    relation?: string | null;
    notifyAlways?: boolean;
  },
): VipPerson {
  const now = ctx.nowIso();
  let contact = input.contactId
    ? s.contacts.find((c) => c.id === input.contactId && !c.deletedAt)
    : undefined;
  if (!contact && input.email)
    contact = s.contacts.find((c) =>
      c.emails.some((e) => e.toLowerCase() === input.email?.toLowerCase()),
    );
  if (!contact) {
    contact = {
      id: ctx.nextId(),
      userId: ctx.userId,
      displayName: input.displayName,
      emails: input.email ? [input.email] : [],
      phones: [],
      company: null,
      title: null,
      avatarUrl: null,
      lastContactAt: null,
      interactionCount: 0,
      isVip: true,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    s.contacts.push(contact);
  }
  const existing = s.vips.find((v) => v.contactId === contact?.id);
  if (existing) {
    existing.relation = input.relation ?? existing.relation;
    existing.notifyAlways = input.notifyAlways ?? existing.notifyAlways;
    existing.updatedAt = now;
    contact.isVip = true;
    return existing;
  }
  const vip: VipPerson = {
    id: ctx.nextId(),
    userId: ctx.userId,
    contactId: contact.id,
    displayName: input.displayName || contact.displayName,
    email: input.email ?? contact.emails[0] ?? null,
    relation: input.relation ?? null,
    notifyAlways: input.notifyAlways ?? true,
    createdAt: now,
    updatedAt: now,
  };
  s.vips.push(vip);
  contact.isVip = true;
  contact.updatedAt = now;
  reinforcePreference(ctx, s, {
    kind: 'person_priority',
    subjectKey: `contact:${contact.id}`,
    statement: `${contact.displayName} yüksek öncelikli.`,
    weight: 0.8,
  });
  return vip;
}

function removeVipCore(s: DemoState, predicate: (v: VipPerson) => boolean, nowIso: string): void {
  const removed = s.vips.filter(predicate);
  s.vips = s.vips.filter((v) => !predicate(v));
  for (const v of removed) {
    const contact = s.contacts.find((c) => c.id === v.contactId);
    if (contact) {
      contact.isVip = false;
      contact.updatedAt = nowIso;
    }
  }
}

function buildPerson(ctx: DemoContext, s: DemoState, contact: Contact): PersonIntelligence {
  const threads = threadsForContact(s, contact);
  const latest = threads[0];
  const now = ctx.clock.now().getTime();
  const upcoming = eventsForContact(s, contact).filter((e) => Date.parse(e.endAt) >= now);
  const commitments = s.commitments.filter(
    (c) => !c.deletedAt && c.counterpartContactId === contact.id,
  );
  const openCommitments = commitments.filter(
    (c) => c.status === 'open' || c.status === 'postponed' || c.status === 'proposed',
  );
  const openFollowUps = s.followUps.filter(
    (f) =>
      f.contactId === contact.id &&
      (f.status === 'watching' || f.status === 'nudge_due' || f.status === 'snoozed'),
  );
  const waiting = threads.filter(
    (t) =>
      (t.category === 'waiting_for_user' || t.category === 'action_required') && !t.userMarkedDone,
  );
  const chunks = s.memory
    .filter((m) => m.contactId === contact.id)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const recentTopics = [
    ...chunks.map((m) => ({
      topic: m.topic ?? m.content.slice(0, 60),
      at: m.occurredAt,
      source: { ...m.source },
    })),
    ...threads
      .filter((t) => !chunks.some((m) => m.sourceId === t.id))
      .map((t) => ({ topic: t.subject, at: t.lastMessageAt, source: threadSource(t) })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);
  return {
    contact,
    lastContact: latest
      ? {
          at: latest.lastMessageAt,
          channel: 'gmail',
          summary: latest.analysis?.summary ?? latest.snippet,
          source: threadSource(latest),
        }
      : chunks[0]
        ? {
            at: chunks[0].occurredAt,
            channel: chunks[0].sourceType,
            summary: chunks[0].content,
            source: { ...chunks[0].source },
          }
        : null,
    upcomingMeetings: upcoming,
    openLoops: openCommitments.length + openFollowUps.length + waiting.length,
    recentTopics,
    userOwes: commitments.filter(
      (c) => c.direction === 'user_owes' && c.status !== 'completed' && c.status !== 'cancelled',
    ),
    theyOwe: commitments.filter(
      (c) => c.direction === 'other_owes' && c.status !== 'completed' && c.status !== 'cancelled',
    ),
    relatedMessages: threads.slice(0, 10),
    relatedCommitments: commitments,
  };
}

export function createPeopleApi(ctx: DemoContext): PeopleApi {
  return {
    listContacts: (input) =>
      ctx.run(() => {
        const q = input?.query ? fold(input.query) : '';
        return ctx.store.state.contacts
          .filter(
            (c) =>
              !c.deletedAt &&
              (!q ||
                fold(c.displayName).includes(q) ||
                c.emails.some((e) => fold(e).includes(q)) ||
                fold(c.company ?? '').includes(q)),
          )
          .sort((a, b) => b.interactionCount - a.interactionCount)
          .slice(0, input?.limit ?? 50)
          .map((c) => ({ ...c }));
      }),
    getPerson: (contactId) =>
      ctx.run(() => buildPerson(ctx, ctx.store.state, getContact(ctx.store.state, contactId))),
    listVips: () => ctx.run(() => ctx.store.state.vips.map((v) => ({ ...v }))),
    addVip: (input) =>
      ctx.run(() => {
        const clean = validate(vipUpsertSchema, input);
        return ctx.store.mutate((s) => ({ ...addVipCore(ctx, s, clean) }));
      }),
    removeVip: (vipId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          if (!s.vips.some((v) => v.id === vipId)) throw notFound('VIP', vipId);
          removeVipCore(s, (v) => v.id === vipId, ctx.nowIso());
        });
      }),
    setVip: (contactId, isVip) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const contact = getContact(s, contactId);
          if (isVip)
            addVipCore(ctx, s, {
              contactId,
              displayName: contact.displayName,
              email: contact.emails[0] ?? null,
              relation: contact.company ? 'Müşteri' : null,
              notifyAlways: true,
            });
          else removeVipCore(s, (v) => v.contactId === contactId, ctx.nowIso());
        });
      }),
  };
}
