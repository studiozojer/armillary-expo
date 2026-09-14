import { useFocusEffect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { ChromeZone } from '@/components/chrome-zone';
import { TrayCard } from '@/components/tray-card';
import { Box, Screen, SectionHeader, Text } from '@/components/ui';
import { fetchAllTrays, type Arrivals } from '@/lib/daemon/tray';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

/**
 * The tray: a feed of what has arrived, across every machine this build
 * knows. Pointers, not a store — each card opens the artifact on the machine
 * that wrote it. Design:
 * `zojercommons/projects/harness/specs/2026-09-14-tray-design.md`.
 *
 * Unlike the other two tab roots this screen is not host-scoped, so it has no
 * `HostHeader`: the machine is a fact per card (the chip), not per screen.
 * The loader key therefore ignores the selected host — switching machines to
 * open one arrival must not refetch the whole feed underneath the navigation.
 */
export default function TrayScreen() {
  const theme = useTheme();
  const { hosts, ready } = useHost();

  const load = useCallback((signal: AbortSignal) => fetchAllTrays(hosts, { signal }), [hosts]);
  const { state, refreshing, refresh, revalidate } = useLoader<Arrivals>('tray', load, ready);

  // Re-read on every focus after the first (the mount already fetched) —
  // silently, the same discipline as Instances: a morning ring that landed
  // while another tab was open should be here when this one is.
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

  const chrome = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChromeZone />
      <Box px="lg" style={{ paddingTop: theme.space.md, paddingBottom: theme.space.md }}>
        <Text variant="display">Tray</Text>
      </Box>
    </>
  );

  // A fan-out never fails as a whole: a host that did not answer is a line
  // under the list, not an error screen. Only the pre-hydration moment shows
  // a spinner.
  const arrivals: Arrivals =
    state.status === 'ok' ? state.data : { entries: [], unreachable: [] };
  const unreachable = arrivals.unreachable.map((h) => h.label).join(', ');

  return (
    <Screen edges={['top']}>
      {chrome}
      <SectionHeader>Arrivals</SectionHeader>
      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.xl }} />
      ) : (
        <FlatList
          testID="tray-list"
          data={arrivals.entries}
          keyExtractor={(e) => `${e.hostId}:${e.id}`}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingHorizontal: theme.space.lg,
            paddingBottom: theme.space.md,
            gap: theme.space.sm,
          }}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => <TrayCard entry={item} />}
          ListEmptyComponent={
            <Text variant="caption" color="txTertiary">
              Nothing has arrived.
            </Text>
          }
          ListFooterComponent={
            unreachable ? (
              <Box testID="tray-unreachable" style={{ paddingTop: theme.space.md }}>
                <Text variant="caption" color="txTertiary">
                  Not answering: {unreachable}
                </Text>
              </Box>
            ) : null
          }
        />
      )}
    </Screen>
  );
}
