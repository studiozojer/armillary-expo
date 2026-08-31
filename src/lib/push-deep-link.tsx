import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
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

/**
 * The whole decision, as a pure function — deliberately not left inside the
 * effect.
 *
 * This repo's jest setup runs mount effects for the FIRST `render()` in a file
 * and for none after it (reduced to a three-line repro on 2026-08-30; React
 * 19.2.3 / RN 0.86 / RTL 14, and explicit `cleanup()` does not restore it). A
 * component test of this logic therefore passes whether the code is right or
 * wrong — which is exactly how the launch crash reached a phone with a green
 * suite. Pulling the decision out gives it a test that cannot go hollow.
 *
 * Returns what to do, or null for "do nothing". `navReady` false must ALWAYS
 * produce null: that is the crash.
 */
export function resolveDeepLink(args: {
  data: unknown;
  navReady: boolean;
  notificationId: string;
  handledId: string | null;
  currentHostId: string;
}): { href: string; switchToHostId?: string; notificationId: string } | null {
  const { data, navReady, notificationId, handledId, currentHostId } = args;
  if (!navReady) return null;
  if (handledId === notificationId) return null;

  const link = readDeepLink(data);
  if (!link) return null;

  const target = hostByName(link.host);
  return {
    href: `/browse/${link.path.replace(/^\/+/, '')}`,
    switchToHostId: target && target.id !== currentHostId ? target.id : undefined,
    notificationId,
  };
}

export function PushDeepLinkHandler() {
  const { host, setHost } = useHost();
  const response = Notifications.useLastNotificationResponse();
  // Undefined until the root navigator has mounted. THIS GUARD IS THE WHOLE
  // REASON THE FIRST BUILD CRASHED ON LAUNCH, so it is not defensive padding:
  //
  // this component renders ABOVE <Stack> in the root layout, so its effect runs
  // before any navigator exists, and expo-router throws on a push made then.
  // `useLastNotificationResponse` returns the last response *persistently* —
  // not only when a tap launched the app — so once any deep-linking push had
  // ever arrived, the effect fired on EVERY launch and the app died before
  // drawing a frame. It was reached by installing a build on a phone that had
  // already received an augur push, which is why the tests and tsc were green.
  const navState = useRootNavigationState();
  // A response object is stable, but the hook re-delivers the launch response
  // on every mount. Without this, going back to a screen re-navigates.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !response) return;

    const action = resolveDeepLink({
      data: response.notification.request.content.data,
      navReady: Boolean(navState?.key),
      notificationId: response.notification.request.identifier,
      handledId: handled.current,
      currentHostId: host.id,
    });
    if (!action) return;

    handled.current = action.notificationId;

    if (action.switchToHostId) {
      const target = hostByName(action.switchToHostId);
      if (target) setHost(target);
    }

    // Nothing above this component can catch a throw — it runs at launch,
    // outside any error boundary — and the failure mode is an app that cannot
    // be opened at all. A deep link that cannot be followed must degrade to a
    // normal cold start, never to a crash.
    try {
      router.push(action.href);
    } catch (e) {
      console.warn('push deep link: could not open', action.href, e);
    }
  }, [response, navState?.key, host.id, setHost]);

  return null;
}
