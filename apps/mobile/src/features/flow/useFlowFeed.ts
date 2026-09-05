import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import { FLOW_FILTERS, type FlowFilter, type FlowResponse, type Insight } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

const PAGE_SIZE = 20;

export function isFlowFilter(value: unknown): value is FlowFilter {
  return typeof value === 'string' && (FLOW_FILTERS as readonly string[]).includes(value);
}

/** Cursor-paged feed for one filter. Pages are flattened into a stable `items` array. */
export function useFlowFeed(filter: FlowFilter) {
  const ds = useDataSource();
  const query = useInfiniteQuery<
    FlowResponse,
    Error,
    { pages: FlowResponse[] },
    ReturnType<typeof qk.flow>,
    string | undefined
  >({
    queryKey: qk.flow(filter),
    queryFn: ({ pageParam }) => ds.feed.getFlow({ filter, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo<Insight[]>(() => {
    const seen = new Set<string>();
    const out: Insight[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [query.data]);
  return { ...query, items };
}
