import type { Href } from 'expo-router';
import type { Insight } from '@da/domain';

/** Where a card body tap lands, by the entity behind the insight. */
export function routeForInsight(insight: Insight): Href {
  switch (insight.entityType) {
    case 'email_thread':
      return { pathname: '/email/[id]', params: { id: insight.entityId } };
    case 'calendar_event':
      return { pathname: '/meeting/[id]/prep', params: { id: insight.entityId } };
    case 'follow_up':
      return { pathname: '/followups' };
    case 'commitment':
      return { pathname: '/commitments' };
    case 'life_event':
      return { pathname: '/life/[id]', params: { id: insight.entityId } };
    case 'conflict':
      return { pathname: '/conflict/[id]', params: { id: insight.entityId } };
    case 'task':
    case 'suggestion':
      return { pathname: '/(tabs)/plan' };
  }
}
