import type { SearchResult } from '@da/domain';
import { routeForResult } from '../routeForResult';
import { groupResults } from '../useSearch';

function result(kind: SearchResult['kind'], id: string, score: number): SearchResult {
  return {
    id,
    kind,
    title: id,
    summary: '',
    date: '2026-09-05T06:00:00Z',
    score,
    entityId: id,
    source: { type: 'gmail', id, label: 'Gmail', timestamp: '2026-09-05T06:00:00Z' },
  };
}

describe('search grouping', () => {
  it('keeps the top-ranked result first by ordering groups by first appearance', () => {
    const groups = groupResults([
      result('life_event', 'thy', 0.9),
      result('email', 'e1', 0.8),
      result('life_event', 'trendyol', 0.7),
      result('email', 'e2', 0.6),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['life_event', 'email']);
    expect(groups[0]?.results.map((r) => r.id)).toEqual(['thy', 'trendyol']);
    expect(groups.flatMap((g) => g.results)[0]?.id).toBe('thy');
  });

  it('routes each kind to its detail screen and memory chunks to their source', () => {
    expect(routeForResult(result('email', 'e1', 1))).toEqual({
      pathname: '/email/[id]',
      params: { id: 'e1' },
    });
    expect(routeForResult(result('life_event', 'l1', 1))).toEqual({
      pathname: '/life/[id]',
      params: { id: 'l1' },
    });
    expect(routeForResult(result('person', 'p1', 1))).toEqual({
      pathname: '/person/[id]',
      params: { id: 'p1' },
    });
    expect(routeForResult(result('memory', 'm1', 1))).toBeNull();
  });
});
