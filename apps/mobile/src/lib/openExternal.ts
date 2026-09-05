import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Opens an http(s) link in the in-app browser (falls back to the system handler for other schemes). */
export async function openExternal(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const result = await WebBrowser.openBrowserAsync(trimmed, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: 'close',
      });
      return result.type !== 'cancel' || Platform.OS === 'android';
    }
    const supported = await Linking.canOpenURL(trimmed);
    if (!supported) return false;
    await Linking.openURL(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Opens the platform mail client on a specific message when a web URL is known, else the provider inbox. */
export function providerMailUrl(webUrl: string | null | undefined, provider: 'gmail' | 'outlook'): string {
  if (webUrl) return webUrl;
  return provider === 'gmail' ? 'https://mail.google.com/mail/u/0/#inbox' : 'https://outlook.live.com/mail/0/';
}

/** Deep link into the native maps app for a location string. */
export function mapsUrl(location: string): string {
  const q = encodeURIComponent(location);
  return Platform.OS === 'ios' ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
