import { deviceMayAct } from '@/lib/repo-state-card';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ModuleList } from '@/components/module-list';
import { Box, Button, Inline, Screen, Text } from '@/components/ui';
import { daemonClientFor } from '@/lib/daemon/client';
import { bumpGitEpoch } from '@/lib/daemon/git-epoch';
import { getCachedRepos, invalidateReposCache } from '@/lib/daemon/repos-cache';
import { DaemonError, type Composition, type ReposResponse } from '@/lib/daemon/types';
import { useAuth } from '@/lib/auth/auth-context';
import { deviceRefusalOf, REFUSAL_REASON } from '@/lib/auth/refusal';
import { useGitEpochFocusRefresh } from '@/lib/use-git-epoch-focus';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function CompositionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { host, generation, ready } = useHost();
  const { enrollment, noteRefusal } = useAuth();

  const load = useCallback(
    (signal: AbortSignal) => daemonClientFor(host.id, host.daemonUrl).getComposition(signal),
    [host.daemonUrl, host.id],
  );

  // `ready` gates the first fetch until the stored host has hydrated, so a cold
  // launch does not fire at the default host and then race its own correction.
  const { state, refreshing, refresh, retry, revalidate } = useLoader<Composition>(
    `${host.id}:${generation}`,
    load,
    ready,
  );

  const [repos, setRepos] = useState<ReposResponse | undefined>(undefined);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);
  // Bumped on every host change. `useLoader` carries the same counter and its
  // doc explains why abort alone is not enough: an aborted request still
  // rejects, and the rejection can land after the NEW host's read has already
  // resolved and rendered. The epoch is what makes a superseded write a no-op.
  const reposEpoch = useRef(0);

  // Loaded independently of the composition: the list must render without
  // waiting on a route that, pre-per-repo-git, spawned two dozen subprocesses
  // (it is one per repo now, but the independence still matters — a host
  // with no /repos at all, an older engine, simply leaves this undefined).
  // Shared by the mount effect below and pull-to-refresh, so there's one read
  // path rather than the epoch/abort dance duplicated in two places.
  //
  // Goes through `getCachedRepos` (`repos-cache.ts`) rather than calling
  // `DaemonClient.getRepos` directly — this screen is one of TWO readers of
  // the same host-scoped cache, the repo page being the other. See that
  // module's doc for why a cache exists here at all (the sweep this screen
  // needs is exactly the request the repo page used to re-pay for two
  // booleans) and why it carries a TTL rather than none.
  // `keepOnError` mirrors `useLoader`'s own revalidate mode (design D7): a
  // focus-triggered forced sweep nobody asked for out loud must not blank
  // the statuses already on screen just because the fresh read failed. The
  // pull-to-refresh and mount call sites below deliberately omit it — a
  // pull IS the user asking out loud, so a failure there stays loud too.
  // The returned boolean is "landed": true only when THIS call's response
  // both succeeded and was still current when it arrived — the same
  // landed-iff-not-superseded contract `useLoader.revalidate` upholds, so a
  // caller composing this with `revalidate()` can just `&&` the two.
  const loadRepos = useCallback(
    (signal?: AbortSignal, force = false, options: { keepOnError?: boolean } = {}): Promise<boolean> => {
      const epoch = ++reposEpoch.current;
      return getCachedRepos(daemonClientFor(host.id, host.daemonUrl), host.id, generation, {
        signal,
        force,
      })
        .then((response) => {
          if (epoch !== reposEpoch.current) return false;
          setRepos(response);
          return true;
        })
        .catch(() => {
          if (epoch === reposEpoch.current && !options.keepOnError) setRepos(undefined);
          return false;
        });
    },
    [host.daemonUrl, host.id, generation],
  );

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void loadRepos(controller.signal);
    return () => controller.abort();
  }, [host.daemonUrl, generation, ready, loadRepos]);

  // Focus half of the action-epoch design: revalidate BOTH reads — the
  // composition silently, and the sweep with force, because the bump site
  // already invalidated the cache and a lazy read must not resurrect a TTL
  // hit under an older key.
  const revalidateAll = useCallback(async (): Promise<boolean> => {
    const [compositionOk, sweepOk] = await Promise.all([
      revalidate(),
      loadRepos(undefined, true, { keepOnError: true }),
    ]);
    return compositionOk && sweepOk;
  }, [revalidate, loadRepos]);
  const { markFresh } = useGitEpochFocusRefresh(host.id, revalidateAll);

  // Pull-to-refresh used to drive `useLoader`'s composition reload only, so a
  // report from one successful sweep kept reading stale statuses forever.
  // This re-reads both on one gesture. `force: true` bypasses the cache
  // deliberately — a pull IS the user asking for a fresh read, and serving
  // one still inside the TTL window would make the gesture silently do
  // nothing for up to 30 seconds.
  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), loadRepos(undefined, true)]);
  }, [refresh, loadRepos]);

  // v1's group action is fetch-all, not sync — pull and push stay per-repo,
  // on the page the next task builds (D6/§5: group pull and group push are
  // deliberately out of v1, and are not merely deferred; they need their own
  // decision once the per-repo verbs have proven themselves).
  const fetchAll = useCallback(async () => {
    // Same guard: a sweep is slow, and the host can change while it runs.
    const epoch = reposEpoch.current;
    setFetching(true);
    try {
      const updated = await daemonClientFor(host.id, host.daemonUrl).fetchAll();
      // Success is the bump site (git-ux design D5/D8b) — unconditional for
      // the same reason as the repo screen's: the sweep happened on the host
      // whether or not this screen is still current.
      bumpGitEpoch(host.id);
      invalidateReposCache(host.id, generation);
      if (epoch === reposEpoch.current) {
        // The sweep response is the new `repos` array; `enabled`/`push_enabled`/
        // `not_composed` don't change out from under a fetch, so carry them
        // forward from the last `GET /repos` rather than re-reading them.
        setRepos((prev) => (prev ? { ...prev, repos: updated } : prev));
        setFetchError(undefined);
        markFresh();
      }
    } catch (error) {
      // The previous statuses stay on screen — the last true reading beats
      // no reading — but the tap still needs to say it did nothing, and a
      // 403 specifically means the host hasn't granted the gate at all.
      if (epoch === reposEpoch.current) {
        // A DEVICE refusal is checked before the manifest reading, the same
        // order the engine uses. Without this, `principal_not_granted` fell
        // into the 403 branch below and reported "this host has not granted
        // fetch" — the manifest's remedy for a problem the manifest does not
        // have, sending someone to edit a file that is already correct. The
        // repo screen was fixed for exactly this and this sibling was missed.
        const refusal = error instanceof DaemonError ? deviceRefusalOf(error.message) : null;
        if (refusal) noteRefusal(refusal);
        setFetchError(
          refusal
            ? REFUSAL_REASON[refusal]
            : error instanceof DaemonError
              ? error.status === 403
                ? 'This host has not granted fetch.'
                : error.message || 'Fetch failed.'
              : 'Fetch failed.',
        );
      }
    } finally {
      setFetching(false);
    }
  }, [host.daemonUrl, host.id, generation, noteRefusal, markFresh]);

  if (state.status === 'error') {
    return (
      <Screen p="lg">
        <Text variant="heading">Can&apos;t reach the engine</Text>
        {/* Named specifically, because the app is usually where a tailnet or a
            bind problem first becomes visible, and "something went wrong" would
            send you looking in the wrong place. */}
        <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xs }}>
          {host.daemonUrl}
        </Text>
        <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.sm }}>
          {state.error instanceof Error ? state.error.message : String(state.error)}
        </Text>

        <Box style={{ paddingTop: theme.space.lg }}>
          <Inline gap="sm">
            <Button label="Try again" onPress={retry} />
            {/* The switcher belongs here above all: an unreachable host is
                exactly when you want to try another one. */}
            <Button
              label="Change host"
              variant="secondary"
              onPress={() => router.push('/settings')}
            />
          </Inline>
        </Box>
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {/* No Capture button here any more: this screen used to be the Explorer
          index and carried it, and main split the two apart — the workspace
          listing is the index now and owns that header, so a second Capture
          entry point one push deeper would just be a duplicate. */}
      <Stack.Screen options={{ title: 'Composition' }} />
      {/* `reposEnabled` below carries BOTH halves, because the engine requires
          both: it authenticates before it reads the ceiling, so a
          manifest-only check would offer a sweep every tap of which is a 401.
          Hiding rather than disabling is this screen's existing choice for the
          manifest gate. */}
      <ModuleList
        composition={state.data}
        hostLabel={host.label}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        repos={repos?.repos}
        // `push_enabled` is deliberately not read here — it gates Push on the
        // repo page, and this screen only ever offers Fetch all.
        reposEnabled={deviceMayAct(enrollment, repos?.enabled ? 'granted' : 'refused')}
        notComposed={repos?.not_composed}
        fetching={fetching}
        onFetchAll={fetchAll}
        fetchError={fetchError}
      />
    </Screen>
  );
}
