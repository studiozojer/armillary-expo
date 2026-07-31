import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ModuleList } from '@/components/module-list';
import { Box, Button, Inline, Screen, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition, SyncReport } from '@/lib/daemon/types';
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

  const [sync, setSync] = useState<SyncReport | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);

  // Loaded independently of the composition: the list must render without
  // waiting on a route that spawns two dozen subprocesses. A host that has no
  // /sync at all (an older engine) simply leaves this undefined.
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    new DaemonClient(host.daemonUrl)
      .getSyncStatus(controller.signal)
      .then(setSync)
      .catch(() => setSync(undefined));
    return () => controller.abort();
  }, [host.daemonUrl, generation, ready]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      setSync(await new DaemonClient(host.daemonUrl).runSync());
    } catch {
      // A failed sweep leaves the previous statuses in place rather than
      // blanking them: the last true reading beats no reading.
    } finally {
      setSyncing(false);
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
        onRefresh={refresh}
        sync={sync}
        syncing={syncing}
        onSync={runSync}
      />
    </Screen>
  );
}
