/**
 * Shared permission outcome vocabulary for native capability wrappers (notifications, calendar, contacts).
 * The app never auto-prompts: screens call `request*Permission()` explicitly from an explainer.
 */
export type PermissionOutcome = 'granted' | 'denied' | 'undetermined';

export interface PermissionLike {
  status: string;
  granted?: boolean;
  canAskAgain?: boolean;
}

/** Maps an Expo `PermissionResponse` (or any `{status}` shape) to the app's outcome vocabulary. */
export function toPermissionOutcome(response: PermissionLike | null | undefined): PermissionOutcome {
  if (!response) return 'undetermined';
  if (response.granted || response.status === 'granted' || response.status === 'limited') return 'granted';
  if (response.status === 'undetermined') return 'undetermined';
  return 'denied';
}
