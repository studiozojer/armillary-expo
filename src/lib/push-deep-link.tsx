import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useHost } from './host-context';
import { KNOWN_HOSTS } from './hosts';

/**
 * Tapping a push opens the file it is about.
 *
 * A bell that produces an artifact — the augur's daily field, a report written
 * into the workspace — can carry `host` and `path` in its notification data
 * (bellhouse's `data_template`). Without this, a tap did nothing but foreground
 * the app on whatever host happened to be selected, which for a file written on
 * one machine and read on another is the wrong one about half the time.
 *
 * Two things make this less trivial than a `router.push`:
 *
 * **The host has to change first, and it is not free.** `path` is meaningless
 * without the machine it lives on — the explorer resolves every path against
 * the selected host's daemon. So this sets the host and only then navigates.
 * `setHost` bumps a generation that screens re-fetch on, so ordering matters:
 * navigating first would mount the screen against the old host and fetch a
 * 404 before the switch landed.
 *
 * **A cold start is not an event.** If the app was closed, the tap that opened
 * it already happened and no listener will ever fire for it.
 * `useLastNotificationResponse` covers both cases — it returns the response
 * that launched the app as well as ones arriving while it runs — which is why
 * it is used instead of `addNotificationResponseReceivedListener`.
 */

/** What a bell must put in `data` for a tap to land somewhere. */
type DeepLink = { host?: string; path: string };

export function readDeepLink(data: unknown): DeepLink | null {
  if (!data || typeof data !== 'object') return null;
  const { host, path } = data as Record<string, unknown>;
  if (typeof path !== 'string' || !path) return null;
  return { host: typeof host === 'string' ? host : undefined, path };
}

/**
 * Resolve a host *name* to a known host. Bells name machines the way people do
 * ("stjerneborg"), not by tailnet IP, and a name this build has never heard of
 * resolves to nothing rather than to the first host in the list — opening a
 * path against an arbitrary machine is worse than opening nothing.
 */
export function hostByName(name: string | undefined) {
  if (!name) return undefined;
  return KNOWN_HOSTS.find((h) => h.id === name || h.label === name);
}

export function PushDeepLinkHandler() {
  const { host, setHost } = useHost();
  const response = Notifications.useLastNotificationResponse();
  // A response object is stable, but the hook re-delivers the launch response
  // on every mount. Without this, going back to a screen re-navigates.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !response) return;

    const id = response.notification.request.identifier;
    if (handled.current === id) return;

    const link = readDeepLink(response.notification.request.content.data);
    if (!link) return;
    handled.current = id;

    const target = hostByName(link.host);
    if (target && target.id !== host.id) setHost(target);

    // Leading slashes would produce `//browse/...`; the explorer's catch-all
    // takes the workspace-relative path exactly as `tree-list` passes it.
    const path = link.path.replace(/^\/+/, '');
    router.push(`/browse/${path}`);
  }, [response, host.id, setHost]);

  return null;
}
