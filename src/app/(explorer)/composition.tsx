import { Link } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModuleList } from '@/components/module-list';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function CompositionScreen() {
  const theme = useTheme();
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
      <SafeAreaView style={{ flex: 1, padding: theme.space.lg }}>
        <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
          Can&apos;t reach the engine
        </Text>
        {/* Named specifically, because the app is usually where a tailnet or a
            bind problem first becomes visible, and "something went wrong" would
            send you looking in the wrong place. */}
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            paddingTop: theme.space.xs,
          }}>
          {host.daemonUrl}
        </Text>
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            paddingTop: theme.space.sm,
          }}>
          {state.error instanceof Error ? state.error.message : String(state.error)}
        </Text>

        <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.lg }}>
          <Pressable
            onPress={retry}
            style={{
              paddingVertical: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.bgAccent,
            }}>
            <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Try again</Text>
          </Pressable>
          {/* The switcher belongs here above all: an unreachable host is exactly
              when you want to try another one. */}
          <Link href="/settings" asChild>
            <Pressable
              style={{
                paddingVertical: theme.space.sm,
                paddingHorizontal: theme.space.lg,
                borderRadius: theme.radius.md,
                borderWidth: theme.border.thin,
                borderColor: theme.color.bdPrimary,
              }}>
              <Text style={{ ...theme.type.label, color: theme.color.txSecondary }}>
                Change host
              </Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <Stack.Screen options={{ title: 'Composition' }} />
      <ModuleList
        composition={state.data}
        hostLabel={host.label}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </SafeAreaView>
  );
}
