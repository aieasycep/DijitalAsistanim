import '@testing-library/react-native/extend-expect';

// Native module shims for unit tests (no native runtime in Jest).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
    isAvailableAsync: jest.fn(async () => true),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => undefined),
  isLoaded: () => true,
}));

jest.mock('react-native-mmkv', () => {
  class MMKV {
    private m = new Map<string, string>();
    getString(k: string) {
      return this.m.get(k);
    }
    set(k: string, v: string) {
      this.m.set(k, v);
    }
    delete(k: string) {
      this.m.delete(k);
    }
    clearAll() {
      this.m.clear();
    }
    contains(k: string) {
      return this.m.has(k);
    }
    getAllKeys() {
      return [...this.m.keys()];
    }
  }
  return { MMKV, createMMKV: () => new MMKV() };
});

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => '/',
    Link: ({ children }: { children: unknown }) => children,
    Redirect: () => null,
  };
});
