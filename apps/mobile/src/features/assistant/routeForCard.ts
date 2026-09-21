import type { Href } from 'expo-router';
import type { AssistantRichCard } from '@da/domain';

/** Rich cards in an answer open the entity they describe. */
export function routeForCard(card: AssistantRichCard): Href {
  switch (card.kind) {
    case 'email':
      return { pathname: '/email/[id]', params: { id: card.entityId } };
    case 'event':
      return { pathname: '/meeting/[id]/prep', params: { id: card.entityId } };
    case 'person':
      return { pathname: '/person/[id]', params: { id: card.entityId } };
    case 'commitment':
      return { pathname: '/commitments' };
    case 'life_event':
      return { pathname: '/life/[id]', params: { id: card.entityId } };
    case 'approval':
      return { pathname: '/approvals/[id]', params: { id: card.entityId } };
    case 'plan_block':
      return { pathname: '/(tabs)/plan' };
  }
}
