import type { Href } from 'expo-router';
import type { IconName } from '@da/design-tokens';
import type { SearchResult } from '@da/domain';

export const RESULT_ICON: Record<SearchResult['kind'], IconName> = {
  email: 'mail',
  event: 'event',
  person: 'person',
  life_event: 'flow',
  commitment: 'commitment',
  task: 'taskAdd',
  memory: 'learning',
};

/** In-app destination for a result; `null` means "open the source" (memory chunks). */
export function routeForResult(result: SearchResult): Href | null {
  switch (result.kind) {
    case 'email':
      return { pathname: '/email/[id]', params: { id: result.entityId } };
    case 'event':
      return { pathname: '/meeting/[id]/prep', params: { id: result.entityId } };
    case 'person':
      return { pathname: '/person/[id]', params: { id: result.entityId } };
    case 'life_event':
      return { pathname: '/life/[id]', params: { id: result.entityId } };
    case 'commitment':
      return { pathname: '/commitments' };
    case 'task':
      return { pathname: '/(tabs)/plan' };
    case 'memory':
      return null;
  }
}
