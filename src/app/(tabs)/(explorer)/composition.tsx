import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ModuleList } from '@/components/module-list';
import { Box, Button, Inline, Screen, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import { DaemonError, type Composition, type ReposResponse } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function CompositionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { host, generation, ready } = useHost();

  const load = useCallback(
    (signal: AbortSignal) => new DaemonClient(host.daemonUrl).getComposition(signal),
    [host.daemonUrl],
  );

  // `ready` gates the first fetch until the stored host has hydrated, so a cold
  // launch does not fire at the default host and then race its own correction.
  const { state, refreshing, refresh, retry } = useLoader<Composition>(
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
  const loadRepos = useCallback(
    (signal?: AbortSignal) => {
      const epoch = ++reposEpoch.current;
      return new DaemonClient(host.daemonUrl)
        .getRepos(signal)
        .then((response) => {
          if (epoch === reposEpoch.current) setRepos(response);
        })
        .catch(() => {
          if (epoch === reposEpoch.current) setRepos(undefined);
        });
    },
    [host.daemonUrl],
  );

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void loadRepos(controller.signal);
    return () => controller.abort();
  }, [host.daemonUrl, generation, ready, loadRepos]);

  // Pull-to-refresh used to drive `useLoader`'s composition reload only, so a
  // report from one successful sweep kept reading stale statuses forever.
  // This re-reads both on one gesture.
  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), loadRepos()]);
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
      const updated = await new DaemonClient(host.daemonUrl).fetchAll();
      if (epoch === reposEpoch.current) {
        // The sweep response is the new `repos` array; `enabled`/`push_enabled`/
        // `not_composed` don't change out from under a fetch, so carry them
        // forward from the last `GET /repos` rather than re-reading them.
        setRepos((prev) => (prev ? { ...prev, repos: updated } : prev));
        setFetchError(undefined);
      }
    } catch (error) {
      // The previous statuses stay on screen — the last true reading beats
      // no reading — but the tap still needs to say it did nothing, and a
      // 403 specifically means the host hasn't granted the gate at all.
      if (epoch === reposEpoch.current) {
        setFetchError(
          error instanceof DaemonError
            ? error.status === 403
              ? 'This host has not granted fetch.'
              : error.message || 'Fetch failed.'
            : 'Fetch failed.',
        );
      }
    } finally {
      setFetching(false);
    }
  }, [host.daemonUrl]);

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
      <ModuleList
        composition={state.data}
        hostLabel={host.label}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        repos={repos?.repos}
        // `push_enabled` is deliberately not read here — it gates Push on the
        // repo page, and this screen only ever offers Fetch all.
        reposEnabled={repos?.enabled ?? false}
        notComposed={repos?.not_composed}
        fetching={fetching}
        onFetchAll={fetchAll}
        fetchError={fetchError}
      />
    </Screen>
  );
}
