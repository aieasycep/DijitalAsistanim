/**
 * The JS API reports `supported: false` not only off Android / without the native module, but also in
 * builds whose app config left the NotificationListenerService out of the manifest
 * (`ANDROID_NOTIFICATION_LISTENER=0`, sideloadable demo APKs). Otherwise the settings screen would show a
 * toggle that can never bind a service.
 */
import type * as ListenerModule from '..';

type Listener = typeof ListenerModule;

function fakeNative() {
  return {
    isPermissionGranted: () => true,
    isStarted: () => false,
    openPermissionSettings: async () => true,
    getInstalledApps: async () => [],
    setAllowedPackages: async () => undefined,
    setScope: async () => undefined,
    start: async () => true,
    stop: async () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };
}

function load(options: { declared?: boolean; native: boolean }): Listener {
  let mod: Listener | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra:
            options.declared === undefined ? {} : { androidNotificationListener: options.declared },
        },
      },
    }));
    jest.doMock('../src/NotificationListenerModule', () => ({
      NATIVE_MODULE_NAME: 'NotificationListener',
      NotificationListenerNative: options.native ? fakeNative() : null,
    }));
    mod = require('..') as Listener;
  });
  if (!mod) throw new Error('notification-listener did not load');
  return mod;
}

describe('notification-listener availability', () => {
  it('is supported when the native module is linked and the service is declared', () => {
    const listener = load({ declared: true, native: true });
    expect(listener.isSupported()).toBe(true);
    expect(listener.getStatus()).toEqual({
      supported: true,
      permissionGranted: true,
      started: false,
    });
  });

  it('treats a config without the flag as declared', () => {
    expect(load({ native: true }).isSupported()).toBe(true);
  });

  it('reports unsupported in builds without the listener service', async () => {
    const listener = load({ declared: false, native: true });
    expect(listener.isSupported()).toBe(false);
    expect(listener.getStatus()).toEqual({ supported: false });
    expect(listener.isPermissionGranted()).toBe(false);
    expect(await listener.start()).toEqual({ supported: false });
    expect(await listener.getInstalledApps()).toEqual({ supported: false });
    expect(listener.addNotificationListener(() => undefined).remove()).toBeUndefined();
  });

  it('reports unsupported without the native module', () => {
    const listener = load({ declared: true, native: false });
    expect(listener.isSupported()).toBe(false);
    expect(listener.getStatus()).toEqual({ supported: false });
  });
});
