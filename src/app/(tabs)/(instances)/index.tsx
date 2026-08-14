import { useFocusEffect, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, Text } from 'react-native';

import { ChromeZone } from '@/components/chrome-zone';
import { InstanceCard } from '@/components/instance-card';
// Resolves to `instance-filter.ios.tsx` / `.android.tsx` — the extension is
// deliberately absent. The split exists because `@expo/ui/swift-ui` is an
// iOS-only import; see either file's own comment.
import { InstanceFilter } from '@/components/instance-filter';
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
import type { Filter } from '@/lib/instance-filter';
import type { Instance } from '@/lib/session/events';
import { sessionAPIFor } from '@/lib/session/instance';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

/** Dev/demo-only: an in-memory session with no reachable engine required.
 *  Read once at module scope — like `DAEMON_BASE_URL`, this is a build-time
 *  choice, not something that changes while the app is running. */
const MOCK = process.env.EXPO_PUBLIC_SESSION_MOCK === '1';

/**
 * Newest first, by `startedAt`.
 *
 * The screen sorts rather than reversing what arrived: `SessionAPI.list()` is a
 * raw passthrough of the engine's `/instances`, so its order is the log's, and
 * a reversal would silently become wrong the day the engine sorts differently.
 *
 * An unparseable `startedAt` sinks to the bottom rather than throwing or
 * scattering — the wire JSON is cast without validation, so this is a shape the
 * app can actually receive. Ties (and two unparseable dates) break on `id`, so
 * the order is total and the list does not reshuffle between identical loads.
 */
function newestFirst(a: Instance, b: Instance): number {
  const at = Date.parse(a.startedAt);
  const bt = Date.parse(b.startedAt);
  if (Number.isNaN(at) && Number.isNaN(bt)) return a.id.localeCompare(b.id);
  if (Number.isNaN(at)) return 1;
  if (Number.isNaN(bt)) return -1;
  return bt - at || a.id.localeCompare(b.id);
}

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

  // The instant is stamped HERE, with the data, rather than read inside a row.
  // `Date.now()` in a component body is an impure render (`react-hooks/purity`
  // rejects it), and one instant per load also means no two rows can disagree
  // about what "now" is — a list rendered across a scroll would otherwise
  // measure its rows from slightly different places.
  const load = useCallback(
    async () => ({ instances: await api.list(), at: Date.now() }),
    [api],
  );
  // `ready` gates the first fetch until the stored host has hydrated, so a
  // cold launch does not fire at the default host and then race its own
  // correction (same guard as Explorer's).
  const { state, refreshing, refresh, retry, revalidate } = useLoader<{
    instances: Instance[];
    at: number;
  }>(
    `${host.id}:${generation}`,
    load,
    ready,
  );

  // Refetch whenever this tab regains focus (e.g. returning from a session
  // that appended a new turn, or from the new-instance sheet) — not just on
  // mount and pull-to-refresh. `useFocusEffect`'s callback also fires on the
  // very first focus, which coincides with this component's own mount — and
  // `useLoader`'s own mount effect already triggered the first fetch, so
  // firing here too would be a redundant second request on every cold visit.
  // The ref (not state — this must not itself trigger a re-render) skips
  // exactly that first call and re-reads on every one after.
  //
  // `revalidate`, not `refresh` (design D7, the same call Explorer makes): a
  // re-read nobody asked for out loud must be silent. `refresh` sets the
  // loader's `refreshing` flag, which is wired to the list's RefreshControl —
  // so returning from an instance used to animate the spinner open and slide
  // every row down, performing a gesture the user had not made. `revalidate`
  // also keeps good content on an error, so a blip on the way back no longer
  // replaces the list with "Can't reach the engine". `refresh` stays wired to
  // `onRefresh` alone, where the spinner belongs to a pull that actually
  // happened.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      void revalidate();
    }, [revalidate]),
  );

  const [filter, setFilter] = useState<Filter>('active');

  // D4: no confirm — the sheet's verb acts immediately; the Archived filter is
  // the undo path. D5: unarchive is explicit, only offered where archived rows
  // show. Errors surface verbatim (SessionError carries the engine's machine
  // code) — the same never-swallow posture as the chat screen's mutations.
  const onLongPressInstance = useCallback(
    (instance: Instance) => {
      const verb = instance.archived ? 'Unarchive' : 'Archive';
      const act = () => {
        void (instance.archived ? api.unarchive(instance.id) : api.archive(instance.id))
          .then(() => refresh())
          .catch((e: unknown) => {
            Alert.alert(`${verb} failed`, e instanceof Error ? e.message : String(e));
          });
      };
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: [verb, 'Cancel'], cancelButtonIndex: 1 },
          (index) => {
            if (index === 0) act();
          },
        );
      } else {
        // Android: Alert as the sheet, same shape as the chat screen's message
        // menu — tap-outside/back dismisses.
        Alert.alert(instance.operator ?? 'dispatcher', undefined, [{ text: verb, onPress: act }], {
          cancelable: true,
        });
      }
    },
    [api, refresh],
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
      <Screen>
        {chrome}
        {/* ChromeZone already carries its own px="lg"; this box owns only the
            error copy's inset, so the chrome above it stays full-bleed and
            lands at the same spot as every other state (the scar rule). */}
        <Box p="lg">
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
        </Box>
      </Screen>
    );
  }

  const { instances, at } = state.status === 'ok' ? state.data : { instances: [], at: 0 };
  // `Instance.archived` is a compile-time claim only — `live.ts` casts the
  // wire JSON without validation, so against an older engine that never
  // wrote the key, `i.archived` arrives `undefined`. Boolean(...) reads that
  // as not-archived rather than letting `false === undefined` fail closed
  // and blank the default Active view.
  // `.filter` already returns a fresh array, so sorting it in place does not
  // mutate the loader's cached data.
  const shown = instances
    .filter((i) => (filter === 'archived') === Boolean(i.archived))
    .sort(newestFirst);

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

      <SectionHeader
        trailing={
          <InstanceFilter value={filter} onSelect={setFilter} />
        }>
        Instances
      </SectionHeader>

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          testID="instances-list"
          data={shown}
          keyExtractor={(instance) => instance.id}
          // iOS 26's tab bar is a floating capsule that content scrolls UNDER,
          // and its height is the platform's number, not ours. There is no
          // `useBottomTabBarHeight()` to ask for it under NativeTabs — the
          // chat screen hit that same wall and dodged it by living above the
          // bar (see `instance/[instanceId].tsx`); this screen cannot dodge.
          //
          // `automatic` makes UIKit hand this scroll view the tab controller's
          // own bottom inset, so the last row clears the capsule without a
          // constant here to drift. It was a flat 32pt before, which is less
          // than capsule + home indicator, which is why the final rows sat
          // under the bar.
          //
          // Only the BOTTOM edge is affected despite the name: this list's
          // frame starts below `ChromeZone` and `SectionHeader`, so its own top
          // safe-area inset is already zero and there is nothing there to
          // double-count against `Screen`'s `edges={['top']}`.
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingHorizontal: theme.space.lg,
            // Breathing room ON TOP OF the platform inset above — not a
            // substitute for it.
            paddingBottom: theme.space.md,
            gap: theme.space.sm,
          }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <InstanceCard instance={item} now={at} onLongPress={onLongPressInstance} />
          )}
        />
      )}
    </Screen>
  );
}
