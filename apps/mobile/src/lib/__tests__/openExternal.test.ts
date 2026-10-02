jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('expo-linking', () => ({
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
  openSettings: jest.fn(async () => undefined),
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { openExternal } from '@/lib/openExternal';

const openBrowser = jest.mocked(WebBrowser.openBrowserAsync);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('openExternal', () => {
  it('opens public web links in the in-app browser', async () => {
    await expect(openExternal(' https://kargo.example.com/takip/123 ')).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(
      'https://kargo.example.com/takip/123',
      expect.objectContaining({ dismissButtonStyle: 'close' }),
    );
  });

  it('hands allow-listed app schemes to the system handler', async () => {
    const canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openExternal('mailto:destek@example.com')).resolves.toBe(true);
    expect(canOpen).toHaveBeenCalledWith('mailto:destek@example.com');
    expect(open).toHaveBeenCalledWith('mailto:destek@example.com');
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('refuses URLs outside the allow-list without touching the browser or the system', async () => {
    const canOpen = jest.spyOn(Linking, 'canOpenURL');
    const open = jest.spyOn(Linking, 'openURL');
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,hi',
      'intent://scan/#Intent;scheme=zxing;end',
      'http://192.168.1.1/admin',
      'https://localhost/admin',
      'https://example.com/a b',
      'not a url',
      '',
    ]) {
      await expect(openExternal(url)).resolves.toBe(false);
    }
    expect(openBrowser).not.toHaveBeenCalled();
    expect(canOpen).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
