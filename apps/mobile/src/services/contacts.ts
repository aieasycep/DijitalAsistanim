/**
 * Device contacts (expo-contacts) for the VIP picker. Optional feature: the address book is never
 * uploaded — only the contact the user explicitly selects reaches `ds.people.addVip`.
 */
import * as Contacts from 'expo-contacts/legacy';
import { captureError } from '@/lib/monitoring';
import { toPermissionOutcome, type PermissionOutcome } from './permissions';

export interface DeviceContact {
  id: string;
  displayName: string;
  emails: string[];
  phones: string[];
  company: string | null;
}

const PICK_FIELDS = [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Company];

function unique(values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/** Normalizes a native contact into the minimal shape the app needs. */
export function toDeviceContact(contact: Contacts.ExistingContact): DeviceContact {
  const emails = unique((contact.emails ?? []).map((e) => e.email?.toLowerCase()));
  const phones = unique((contact.phoneNumbers ?? []).map((p) => p.digits ?? p.number));
  const name = contact.name?.trim() || [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || emails[0] || phones[0] || '';
  return { id: contact.id, displayName: name, emails, phones, company: contact.company?.trim() || null };
}

export function primaryEmail(contact: DeviceContact): string | null {
  return contact.emails[0] ?? null;
}

export async function getContactsPermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await Contacts.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/** Prompts for contacts access (called from the VIP explainer, never automatically). */
export async function requestContactsPermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await Contacts.requestPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'requestContactsPermission' });
    return 'undetermined';
  }
}

/** Presents the system contact picker (no full address-book access needed on iOS 18+). */
export async function pickDeviceContact(): Promise<DeviceContact | null> {
  try {
    const picked = await Contacts.presentContactPickerAsync();
    return picked ? toDeviceContact(picked) : null;
  } catch (e) {
    captureError(e, { where: 'pickDeviceContact' });
    return null;
  }
}

/** Name search in the device address book (requires granted permission). */
export async function searchDeviceContacts(query: string, limit = 20): Promise<DeviceContact[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if ((await getContactsPermission()) !== 'granted') return [];
  try {
    const response = await Contacts.getContactsAsync({ name: q, fields: PICK_FIELDS, pageSize: limit, pageOffset: 0 });
    return response.data.map(toDeviceContact).filter((c) => c.displayName.length > 0);
  } catch (e) {
    captureError(e, { where: 'searchDeviceContacts' });
    return [];
  }
}
