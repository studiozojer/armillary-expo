import { Link, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModuleList } from '@/components/module-list';
import { Box, Button, Inline, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function Explorer() {
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

  if (state.status === 'error') {
    return (
      <SafeAreaView
        style={{ flex: 1, padding: theme.space.lg, backgroundColor: theme.color.bgSolidBase }}>
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
      </SafeAreaView>
    );
  }

  if (state.status === 'loading') {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: theme.color.bgSolidBase,
        }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }} edges={[]}>
      <Stack.Screen
        options={{
          // In the header, not floating: an absolutely-positioned button in a
          // screen that owns no chrome ends up underneath the native tab bar.
          headerRight: () => (
            <Link href="/capture" asChild>
              <Pressable hitSlop={8}>
                <Text variant="label" color="txAccent">
                  Capture
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ModuleList
        composition={state.data}
        hostLabel={host.label}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </SafeAreaView>
  );
}
