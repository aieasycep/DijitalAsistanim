import { Redirect } from 'expo-router';
import { useSessionStore } from '@/store/session';

/** Entry: the root layout redirects based on session state; this is the safe default target. */
export default function Index() {
  const status = useSessionStore((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/(tabs)/today" />;
  return <Redirect href="/(marketing)/welcome" />;
}
