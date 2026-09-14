import { ObserveInteractiveMarker } from 'expo-observe';

import { useAuth } from '@/lib/auth/auth-context';
import { useHost } from '@/lib/host-context';

/** App-shell readiness: navigation and enrollment controls are usable.
 * Remote screen requests can still be loading or offline at this point.
 * Mounted below the font gate and both storage providers in the root layout.
 */
export function ObserveStartup({ splashHidden }: { splashHidden: boolean }) {
  const { ready: hostReady } = useHost();
  const { ready: authReady } = useAuth();

  if (!splashHidden || !hostReady || !authReady) return null;
  return <ObserveInteractiveMarker />;
}
