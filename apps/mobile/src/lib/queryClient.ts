import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { ClientApiError } from '@da/api-client';

/** Reads stay fresh for 60 s, kept for offline use for 24 h; writes never retry automatically. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: (count, error) => {
        const e = ClientApiError.from(error);
        if (e.code === 'unauthorized' || e.code === 'forbidden' || e.code === 'validation' || e.code === 'quota_exceeded' || e.code === 'not_found') return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: { retry: 0, networkMode: 'online' },
  },
});

/** Wire React Query online/focus state to React Native. Call once at app start. */
export function setupQueryClientListeners(): () => void {
  const unsubNet = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
  });
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => {
    unsubNet();
    sub.remove();
  };
}
