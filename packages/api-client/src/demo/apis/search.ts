import type { SearchResponse, SearchResult, SourceRef } from '@da/domain';
import { searchRequestSchema } from '@da/validation';
import type { SearchApi } from '../../datasource';
import type { DemoContext } from '../context';
import { commitmentSource, eventSource, lifeEventSource, threadSource } from '../core/lookup';
import type { DemoState } from '../state';
import { fold, tokenize } from '../text';
import { validate } from '../validate';

const MAX_RECENT = 8;

const SYNONYMS: Record<string, string[]> = {
  ucak: ['ucus', 'bilet', 'thy', 'tk2412', 'antalya'],
  bilet: ['ucus', 'thy', 'e-bilet', 'ebilet'],
  ucus: ['ucak', 'thy'],
  kargo: ['siparis', 'teslimat', 'yurtici', 'trendyol'],
  siparis: ['kargo', 'teslimat'],
  fatura: ['odeme', 'elektrik', 'ck'],
  odeme: ['fatura', 'tl'],
  toplanti: ['gorusme', 'meet'],
  sozlesme: ['madde', 'hukuk', 'taslak'],
  teklif: ['fiyat', 'revize'],
};

interface Doc {
  id: string;
  kind: SearchResult['kind'];
  title: string;
  summary: string;
  person: string;
  date: string;
  source: SourceRef;
  entityId: string;
}

function docs(s: DemoState): Doc[] {
  const out: Doc[] = [];
  for (const t of s.threads) {
    if (t.deletedAt) continue;
    out.push({
      id: `email:${t.id}`,
      kind: 'email',
      title: t.subject,
      summary: `${t.analysis?.summary ?? ''} ${t.snippet} ${(t.analysis?.keyPoints ?? []).join(' ')}`,
      person: t.participants.map((p) => p.name ?? p.email).join(' '),
      date: t.lastMessageAt,
      source: threadSource(t),
      entityId: t.id,
    });
  }
  for (const e of s.events) {
    if (e.deletedAt || e.status === 'cancelled') continue;
    out.push({
      id: `event:${e.id}`,
      kind: 'event',
      title: e.title,
      summary: `${e.description ?? ''} ${e.location ?? ''}`,
      person: e.attendees.map((a) => a.name ?? a.email ?? '').join(' '),
      date: e.startAt,
      source: eventSource(e),
      entityId: e.id,
    });
  }
  for (const c of s.contacts) {
    if (c.deletedAt) continue;
    out.push({
      id: `person:${c.id}`,
      kind: 'person',
      title: c.displayName,
      summary: `${c.company ?? ''} ${c.title ?? ''} ${c.emails.join(' ')}`,
      person: c.displayName,
      date: c.lastContactAt ?? c.updatedAt,
      source: {
        type: 'user',
        id: c.id,
        label: 'Kişi',
        person: c.displayName,
        timestamp: c.lastContactAt ?? c.updatedAt,
      },
      entityId: c.id,
    });
  }
  for (const l of s.lifeEvents) {
    if (l.deletedAt) continue;
    const details = Object.values(l.details)
      .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
      .join(' ');
    out.push({
      id: `life:${l.id}`,
      kind: 'life_event',
      title: l.title,
      summary: `${l.type} ${details}`,
      person: l.source.person ?? '',
      date: l.eventAt ?? l.createdAt,
      source: lifeEventSource(l),
      entityId: l.id,
    });
  }
  for (const c of s.commitments) {
    if (c.deletedAt) continue;
    out.push({
      id: `commitment:${c.id}`,
      kind: 'commitment',
      title: c.text,
      summary: `${c.quote ?? ''} ${c.dueText ?? ''}`,
      person: c.counterpartName ?? '',
      date: c.dueAt ?? c.createdAt,
      source: commitmentSource(c),
      entityId: c.id,
    });
  }
  for (const t of s.tasks) {
    if (t.deletedAt) continue;
    out.push({
      id: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      summary: t.notes ?? '',
      person: '',
      date: t.dueAt ?? t.createdAt,
      source: t.source ?? { type: 'user', id: t.id, label: 'Görev', timestamp: t.createdAt },
      entityId: t.id,
    });
  }
  for (const m of s.memory) {
    out.push({
      id: `memory:${m.id}`,
      kind: 'memory',
      title: m.topic ?? m.content.slice(0, 60),
      summary: m.content,
      person: m.personName ?? '',
      date: m.occurredAt,
      source: { ...m.source },
      entityId: m.sourceId,
    });
  }
  return out;
}

function fieldScore(field: string, token: string): number {
  if (!field) return 0;
  if (field.includes(token)) return 1;
  if (token.length >= 4) {
    const words = field.split(/[^a-z0-9]+/);
    if (words.some((w) => w.startsWith(token) || (w.length >= 4 && token.startsWith(w))))
      return 0.7;
  }
  return 0;
}

export function runSearch(
  s: DemoState,
  query: string,
  limit: number,
  kinds?: SearchResult['kind'][],
): SearchResult[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const results: SearchResult[] = [];
  for (const doc of docs(s)) {
    if (kinds?.length && !kinds.includes(doc.kind)) continue;
    const title = fold(doc.title);
    const summary = fold(doc.summary);
    const person = fold(doc.person);
    let score = 0;
    for (const token of tokens) {
      const direct =
        fieldScore(title, token) * 3 +
        fieldScore(summary, token) * 1 +
        fieldScore(person, token) * 2;
      if (direct > 0) {
        score += direct;
        continue;
      }
      const syn = SYNONYMS[token] ?? [];
      const viaSynonym = Math.max(
        0,
        ...syn.map(
          (alt) =>
            fieldScore(title, alt) * 3 + fieldScore(summary, alt) * 1 + fieldScore(person, alt) * 2,
        ),
      );
      score += viaSynonym * 0.6;
    }
    if (score <= 0) continue;
    const normalized = Math.min(1, score / (6 * tokens.length));
    results.push({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      summary: doc.summary.replace(/\s+/g, ' ').trim().slice(0, 200),
      date: doc.date,
      source: doc.source,
      score: Math.round(normalized * 100) / 100,
      entityId: doc.entityId,
    });
  }
  return results
    .sort((a, b) => b.score - a.score || Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit);
}

export function createSearchApi(ctx: DemoContext): SearchApi {
  return {
    search: (req) =>
      ctx.run((): SearchResponse => {
        const clean = validate(searchRequestSchema, req);
        return {
          results: runSearch(ctx.store.state, clean.query, clean.limit, clean.kinds),
          mode: 'fts',
        };
      }),
    recentQueries: () => ctx.run(() => [...ctx.store.state.recentQueries]),
    rememberQuery: (q) =>
      ctx.run(() => {
        const query = q.trim();
        if (!query) return;
        ctx.store.mutate((s) => {
          s.recentQueries = [
            query,
            ...s.recentQueries.filter((x) => fold(x) !== fold(query)),
          ].slice(0, MAX_RECENT);
        });
      }),
  };
}
