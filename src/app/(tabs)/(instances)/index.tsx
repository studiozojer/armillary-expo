import { useFocusEffect, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text } from 'react-native';

import { ChromeZone } from '@/components/chrome-zone';
import { InstanceCard } from '@/components/instance-card';
import {
  Box,
  Callout,
  CircleButton,
  Icon,
  Inline,
  Screen,
  SectionHeader,
  Text as UIText,
} from '@/components/ui';
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
 * list and the "can't reach the engine" error) — the same reasoning as the
 * gear living in both, via `ChromeZone`: a control missing from one branch
 * renders exactly like a screen with no control, which is how Settings went
 * missing once already.
 */
function CreatePill({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      testID="create-pill"
      accessibilityRole="button"
      accessibilityLabel="Create new instance"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : () => router.push('/(tabs)/(instances)/new')}
      style={({ pressed }) => ({
        borderRadius: theme.radius.lg,
        backgroundColor:
          pressed && !disabled ? theme.color.bgSolidCardPressed : theme.color.bgSolidCard,
      })}>
      <Box py="md">
        <Inline gap="sm" justify="center">
          <UIText color={disabled ? 'txDisabled' : 'txPrimary'}>Create new instance</UIText>
          <Icon name="plus" size={18} color={disabled ? 'txDisabled' : 'icPrimary'} />
        </Inline>
      </Box>
    </Pressable>
  );
}

/** The `All ⌄` filter, disabled until filtering is designed (spec § stubs). */
function FilterStub() {
  return (
    <Pressable
      testID="filter-stub"
      disabled
      accessibilityRole="button"
      accessibilityLabel="Filter instances"
      accessibilityState={{ disabled: true }}>
      <Inline gap="xs">
        <UIText variant="label" color="txDisabled">
          All
        </UIText>
        <Icon name="chevronDown" size={14} color="txDisabled" />
      </Inline>
    </Pressable>
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

  // The header used to own the gear and the create control; now `ChromeZone`
  // does, mounted once above the state switch — never per branch (see its
  // own comment for the scar that rule comes from).
  const chrome = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChromeZone
        trailing={<CircleButton testID="more-stub" icon="more" accessibilityLabel="More" disabled />}
      />
      <Box px="lg" style={{ paddingBottom: theme.space.md }}>
        <CreatePill disabled={state.status === 'error'} />
      </Box>
    </>
  );

  if (state.status === 'error') {
    return (
      <Screen p="lg">
        {chrome}
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
    <Screen edges={['top']}>
      {chrome}

      {/* Once this was a permanent "not live yet" banner. The live engine has
          arrived — the honest banner now only exists when the mock is
          deliberately selected (dev/demo); an unreachable real engine is named
          by the error state above, not faked here. */}
      {MOCK ? (
        <Box p="lg">
          <Callout title="Mock instance data">
            EXPO_PUBLIC_SESSION_MOCK=1 — not the live engine.
          </Callout>
        </Box>
      ) : null}

      <SectionHeader trailing={<FilterStub />}>Instances</SectionHeader>

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          testID="instances-list"
          data={instances}
          keyExtractor={(instance) => instance.id}
          contentContainerStyle={{
            paddingHorizontal: theme.space.lg,
            paddingBottom: theme.space.xxxl,
            gap: theme.space.sm,
          }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => <InstanceCard instance={item} />}
        />
      )}
    </Screen>
  );
}
