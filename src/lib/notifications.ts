import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * The push doorbell, app side.
 *
 * The route is the Expo push service: the app holds an `ExponentPushToken[…]`,
 * and anything that can POST to `https://exp.host/--/api/v2/push/send` can
 * ring it — no server work on any host. Delivery needs the APNs key uploaded
 * to the EAS project this token is minted against; the token itself is not a
 * secret in the credential sense (it authorizes ringing this phone, nothing
 * else), which is why showing it in Settings with a copy button is the whole
 * distribution mechanism, mirroring device enrollment's philosophy: the app
 * displays the string, the human places it where the other side reads it.
 */

/** Every shape the doorbell setup can be in — the UI renders these honestly. */
export type PushTokenState =
  | { state: 'unsupported' }
  | { state: 'no-project' }
  | { state: 'undetermined' }
  | { state: 'denied' }
  | { state: 'loading' }
  | { state: 'ready'; token: string }
  | { state: 'error'; reason: string };

/**
 * `getExpoPushTokenAsync` resolves its projectId from this exact path when not
 * passed one; read it explicitly so "not configured" is a nameable state on
 * screen instead of a rejection with a library-shaped message.
 */
export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

/**
 * Foreground display. Without a handler iOS silently swallows a push that
 * arrives while the app is open — precisely the moment a doorbell test rings
 * it. Called once at root-layout module scope; a no-op on web, where this
 * build has no push at all.
 */
export function installForegroundHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function fetchToken(projectId: string): Promise<PushTokenState> {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { state: 'ready', token: data };
  } catch (e) {
    return { state: 'error', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The device's push token, driven from the current permission state.
 *
 * `enable` exists because iOS permission is a one-shot prompt: it may only be
 * requested from a user gesture worth spending it on, so the hook never
 * requests on mount — it reads the existing state and lets the Settings row
 * own the ask. A denial is terminal on iOS (the system never re-prompts); the
 * UI says so rather than offering a button that cannot work.
 */
export function usePushToken(): { status: PushTokenState; enable: () => void } {
  // Web and a missing projectId are knowable before the first render, so they
  // are initial states, not effect outcomes — nothing async decides them.
  const [status, setStatus] = useState<PushTokenState>(() =>
    Platform.OS === 'web'
      ? { state: 'unsupported' }
      : easProjectId()
        ? { state: 'loading' }
        : { state: 'no-project' },
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const projectId = easProjectId();
    if (!projectId) return;
    let cancelled = false;
    void Notifications.getPermissionsAsync().then(async (perm) => {
      if (cancelled) return;
      if (perm.status === 'granted') {
        const next = await fetchToken(projectId);
        if (!cancelled) setStatus(next);
      } else {
        setStatus({ state: perm.status === 'denied' ? 'denied' : 'undetermined' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(() => {
    const projectId = easProjectId();
    if (!projectId) return;
    setStatus({ state: 'loading' });
    void Notifications.requestPermissionsAsync().then(async (perm) => {
      if (perm.status !== 'granted') {
        setStatus({ state: 'denied' });
        return;
      }
      setStatus(await fetchToken(projectId));
    });
  }, []);

  return { status, enable };
}
