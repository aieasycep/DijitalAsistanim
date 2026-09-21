/** Audit action / actor codes → i18n keys (dots in action codes would be read as nested keys). */
export function auditActionKey(action: string): string {
  return `settings.privacyScreen.auditActions.${action.replace(/\./g, '_')}`;
}

export function auditActorKey(actor: string): string {
  return `settings.privacyScreen.auditActors.${actor}`;
}
