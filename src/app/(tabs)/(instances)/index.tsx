import { Stack } from 'expo-router/stack';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InstanceCard } from '@/components/instance-card';
import { SettingsButton } from '@/components/settings-button';
import { useHost } from '@/lib/host-context';
import type { Instance } from '@/lib/session/events';
import { sessionAPIFor } from '@/lib/session/instance';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

/** Dev/demo-only: an in-memory session with no reachable engine required.
 *  Read once at module scope — like `DAEMON_BASE_URL`, this is a build-time
 *  choice, not something that changes while the app is running. */
const MOCK = process.env.EXPO_PUBLIC_SESSION_MOCK === '1';

export default function Instances() {
  const theme = useTheme();
  const { host, generation, ready } = useHost();
  // Deliberately keyed on `host.id` + `generation`, not `host` itself: the
  // context value is a fresh object every render, and `sessionAPIFor` already
  // memoizes by id/url — re-running this on every render would just re-hit
  // that memo, but the `host` dependency would make the lint rule (correctly,
  // for a naive object) think this recomputes when nothing meaningful changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(() => sessionAPIFor(host), [host.id, generation]);

  const load = useCallback(async () => api.list(), [api]);
  // `ready` gates the first fetch until the stored host has hydrated, so a
  // cold launch does not fire at the default host and then race its own
  // correction (same guard as Explorer's).
  const { state, refreshing, refresh, retry } = useLoader<Instance[]>(
    `${host.id}:${generation}`,
    load,
    ready,
  );

  if (state.status === 'error') {
    return (
      <SafeAreaView style={{ flex: 1, padding: theme.space.lg }}>
        <Stack.Screen options={{ headerLeft: () => <SettingsButton /> }} />
        {/* Named specifically — an unreachable engine is exactly what a
            stubbed-looking banner used to paper over. */}
        <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
          Can&apos;t reach the engine
        </Text>
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
        <Pressable
          onPress={retry}
          style={{
            marginTop: theme.space.lg,
            alignSelf: 'flex-start',
            paddingVertical: theme.space.sm,
            paddingHorizontal: theme.space.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bgAccent,
          }}>
          <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      {/* Settings is reachable from both tabs, because it holds the host
          switcher — and which machine is serving is as load-bearing here as it
          is in Explorer. */}
      <Stack.Screen options={{ headerLeft: () => <SettingsButton /> }} />

      {/* Once this was a permanent "not live yet" banner. The live engine has
          arrived — the honest banner now only exists when the mock is
          deliberately selected (dev/demo); an unreachable real engine is named
          by the error state above, not faked here. */}
      {MOCK ? (
        <View
          style={{
            margin: theme.space.lg,
            padding: theme.space.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bgWarning,
            borderWidth: theme.border.thin,
            borderColor: theme.color.bdSecondary,
          }}>
          <Text style={{ ...theme.type.label, color: theme.color.txWarning }}>Mock session data</Text>
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txSecondary,
              paddingTop: theme.space.xxs,
            }}>
            EXPO_PUBLIC_SESSION_MOCK=1 — not the live engine.
          </Text>
        </View>
      ) : null}

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          data={state.status === 'ok' ? state.data : []}
          keyExtractor={(instance) => instance.id}
          contentContainerStyle={{ paddingHorizontal: theme.space.lg }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => <InstanceCard instance={item} />}
        />
      )}
    </SafeAreaView>
  );
}
