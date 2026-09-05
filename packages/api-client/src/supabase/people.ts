/** PeopleApi + RulesApi: contacts, vip_people, person function, priority_rules, learned_preferences. */
import type { PeopleApi, RulesApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, toClientError, write, type SupabaseContext } from './client';
import {
  priorityRuleToRow,
  toContact,
  toLearnedPreference,
  toPriorityRule,
  toVipPerson,
  vipToRow,
} from './mappers';
import type { ContactRow, LearnedPreferenceRow, PriorityRuleRow, VipPersonRow } from './rows';

const DEFAULT_CONTACT_LIMIT = 50;

/** Escapes LIKE wildcards so a user query is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createPeopleApi(ctx: SupabaseContext): PeopleApi {
  const contacts = () => ctx.table<ContactRow>('contacts');
  const vips = () => ctx.table<VipPersonRow>('vip_people');

  async function setContactVip(userId: string, contactId: string, isVip: boolean): Promise<void> {
    await exec(contacts().update({ is_vip: isVip }).eq('user_id', userId).eq('id', contactId));
  }

  return {
    listContacts: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        let query = contacts().select('*').eq('user_id', userId).is('deleted_at', null);
        const term = input?.query?.trim();
        if (term) query = query.ilike('display_name', `%${escapeLike(term)}%`);
        const rows = await exec(
          query
            .order('last_contact_at', { ascending: false, nullsFirst: false })
            .order('display_name', { ascending: true })
            .limit(input?.limit ?? DEFAULT_CONTACT_LIMIT),
        );
        return rows.map(toContact);
      }),

    getPerson: (contactId) => ctx.call('person', { contactId }),

    listVips: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          vips().select('*').eq('user_id', userId).order('display_name', { ascending: true }),
        );
        return rows.map(toVipPerson);
      }),

    addVip: (input) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(vips().insert(vipToRow(userId, input)).select('*').single());
        if (row.contact_id) await setContactVip(userId, row.contact_id, true);
        return toVipPerson(row);
      }),

    removeVip: (vipId) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(
          vips().select('*').eq('user_id', userId).eq('id', vipId).maybeSingle(),
        );
        if (!row) return;
        await exec(vips().delete().eq('user_id', userId).eq('id', vipId));
        if (row.contact_id) await setContactVip(userId, row.contact_id, false);
      }),

    /** Keeps vip_people and contacts.is_vip in sync (the server mirrors the same flag during ingestion). */
    setVip: (contactId, isVip) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        if (isVip) {
          const existing = await exec(
            vips().select('id').eq('user_id', userId).eq('contact_id', contactId).maybeSingle(),
          );
          if (!existing) {
            const contact = await exec(
              contacts().select('*').eq('user_id', userId).eq('id', contactId).single(),
            );
            try {
              await exec(
                vips().insert(
                  vipToRow(userId, {
                    contactId,
                    displayName: contact.display_name,
                    email: contact.emails[0] ?? null,
                    notifyAlways: true,
                  }),
                ),
              );
            } catch (e) {
              // A VIP row keyed by the same e-mail already exists (partial unique index) — treat it as present.
              const err = toClientError(e);
              if (err.code !== 'conflict') throw err;
            }
          }
          await setContactVip(userId, contactId, true);
          return;
        }
        await exec(vips().delete().eq('user_id', userId).eq('contact_id', contactId));
        await setContactVip(userId, contactId, false);
      }),
  };
}

export function createRulesApi(ctx: SupabaseContext): RulesApi {
  const rules = () => ctx.table<PriorityRuleRow>('priority_rules');
  const learned = () => ctx.table<LearnedPreferenceRow>('learned_preferences');

  return {
    listRules: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          rules()
            .select('*')
            .eq('user_id', userId)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true }),
        );
        return rows.map(toPriorityRule);
      }),

    /** With an id: upsert on the primary key; without: upsert on (user_id, type, value) so duplicates merge. */
    upsertRule: (rule) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        if (!rule.value.trim())
          throw new ClientApiError({ code: 'validation', message: 'Kural değeri boş olamaz.' });
        const row = priorityRuleToRow(userId, rule);
        const saved = await exec(
          rules()
            .upsert(row, { onConflict: rule.id ? 'id' : 'user_id,type,value' })
            .select('*')
            .single(),
        );
        return toPriorityRule(saved);
      }),

    deleteRule: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(rules().delete().eq('user_id', userId).eq('id', id));
      }),

    reorderRules: (ids) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await Promise.all(
          ids.map((id, position) =>
            exec(rules().update({ position }).eq('user_id', userId).eq('id', id)),
          ),
        );
      }),

    listLearnedPreferences: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          learned()
            .select('*')
            .eq('user_id', userId)
            .order('last_reinforced_at', { ascending: false }),
        );
        return rows.map(toLearnedPreference);
      }),

    setLearnedPreferenceEnabled: (id, enabled) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toLearnedPreference(
          await exec(
            learned().update({ enabled }).eq('user_id', userId).eq('id', id).select('*').single(),
          ),
        );
      }),

    deleteLearnedPreference: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(learned().delete().eq('user_id', userId).eq('id', id));
      }),
  };
}
