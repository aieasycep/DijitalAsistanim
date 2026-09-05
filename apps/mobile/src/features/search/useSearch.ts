import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { SearchResult } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

export const SEARCH_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export interface ResultGroup {
  kind: SearchResult['kind'];
  results: SearchResult[];
}

/** Groups by kind in order of first appearance so the top-ranked result stays first overall. */
export function groupResults(results: SearchResult[]): ResultGroup[] {
  const groups: ResultGroup[] = [];
  for (const result of results) {
    const group = groups.find((g) => g.kind === result.kind);
    if (group) group.results.push(result);
    else groups.push({ kind: result.kind, results: [result] });
  }
  return groups;
}

/** Debounced semantic/FTS search + recent queries; `remember(q)` stores a submitted query. */
export function useSearch(initialQuery = '') {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialQuery);
  const debounced = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const active = debounced.length > 0;

  const results = useQuery({
    queryKey: qk.search(debounced),
    queryFn: () => ds.search.search({ query: debounced, limit: 30 }),
    enabled: active,
    staleTime: 60_000,
  });
  const recent = useQuery({
    queryKey: qk.recentQueries,
    queryFn: () => ds.search.recentQueries(),
    staleTime: 60_000,
  });
  const remember = useMutation({
    mutationFn: (q: string) => ds.search.rememberQuery(q),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.recentQueries }),
  });

  const groups = useMemo(() => groupResults(results.data?.results ?? []), [results.data]);
  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups]);

  return {
    text,
    setText,
    debounced,
    active,
    results,
    groups,
    flat,
    recent: recent.data ?? [],
    remember: (q: string) => {
      const trimmed = q.trim();
      if (trimmed) remember.mutate(trimmed);
    },
    /** Pending: the user typed but the debounced query has not caught up yet. */
    pending: text.trim() !== debounced,
  };
}
