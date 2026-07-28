import { Link, useFocusEffect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text } from 'react-native';

import { InstanceCard } from '@/components/instance-card';
import { SettingsButton } from '@/components/settings-button';
import { Box, Callout, Icon, ROW_ICON_LANE, Rule, Screen } from '@/components/ui';
import { useHost } from '@/lib/host-context';
import type { Instance } from '@/lib/session/events';
import { sessionAPIFor } from '@/lib/session/instance';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

/** Dev/demo-only: an in-memory session with no reachable engine required.
 *  Read once at module scope — like `DAEMON_BASE_URL`, this is a build-time
 *  choice, not something that changes while the app is running. */
const MOCK = process.env.EXPO_PUBLIC_SESSION_MOCK === '1';

/**
 * Opens the new-instance sheet. Present on both this screen's states (the
 * list and the "can't reach the engine" error) — the same reasoning as
 * `SettingsButton` living in both: a button missing from one branch renders
 * exactly like a screen with no button, which is how Settings went missing
 * once already.
 */
function NewInstanceButton() {
  return (
    <Link href="/(tabs)/(instances)/new" asChild>
      <Pressable hitSlop={8} accessibilityLabel="New instance">
        <Icon name="plus" size={20} color="icAccent" />
      </Pressable>
    </Link>
  );
}

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

  // Refetch whenever this tab regains focus (e.g. returning from a session
  // that appended a new turn, or from the new-instance sheet) — not just on
  // mount and pull-to-refresh. `useFocusEffect`'s callback also fires on the
  // very first focus, which coincides with this component's own mount — and
  // `useLoader`'s own mount effect already triggered the first fetch, so
  // firing `refresh()` there too would be a redundant second request on every
  // cold visit. The ref (not state — this must not itself trigger a
  // re-render) skips exactly that first call and refreshes on every one after.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      void refresh();
    }, [refresh]),
  );

  if (state.status === 'error') {
    return (
      <Screen p="lg">
        <Stack.Screen
          options={{ headerLeft: () => <SettingsButton />, headerRight: () => <NewInstanceButton /> }}
        />
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
      </Screen>
    );
  }

  const instances = state.status === 'ok' ? state.data : [];

  return (
    <Screen edges={[]}>
      {/* Settings is reachable from both tabs, because it holds the host
          switcher — and which machine is serving is as load-bearing here as it
          is in Explorer. */}
      <Stack.Screen
        options={{ headerLeft: () => <SettingsButton />, headerRight: () => <NewInstanceButton /> }}
      />

      {/* Once this was a permanent "not live yet" banner. The live engine has
          arrived — the honest banner now only exists when the mock is
          deliberately selected (dev/demo); an unreachable real engine is named
          by the error state above, not faked here. */}
      {MOCK ? (
        <Box p="lg">
          <Callout title="Mock session data">
            EXPO_PUBLIC_SESSION_MOCK=1 — not the live engine.
          </Callout>
        </Box>
      ) : null}

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          testID="instances-list"
          data={instances}
          keyExtractor={(instance) => instance.id}
          // No horizontal padding on the container: rows are full-bleed like
          // TreeList's (each `ListRow` carries its own inset), so a pressed
          // row paints edge to edge instead of leaving an unpainted margin.
          contentContainerStyle={{ paddingBottom: theme.space.xxxl }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item, index }) => (
            <>
              <InstanceCard instance={item} />
              {index < instances.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
            </>
          )}
        />
      )}
    </Screen>
  );
}
