import { Link } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsButton } from '@/components/settings-button';
import { TreeList } from '@/components/tree-list';
import { DaemonClient } from '@/lib/daemon/client';
import { annotationsFor } from '@/lib/annotations';
import type { Composition, TreeResponse } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { visibleEntries, useShowDotfiles } from '@/lib/preferences';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

export default function Explorer() {
  const theme = useTheme();
  const { host, generation, ready } = useHost();
  const { showDotfiles } = useShowDotfiles();

  const load = useCallback(
    async (signal: AbortSignal) => {
      const client = new DaemonClient(host.daemonUrl);
      const tree = await client.getTree('', signal);
      // The filesystem is the load-bearing half. If /composition fails we still
      // render the workspace, just without subtitles — the old screen could
      // show nothing at all in this case.
      const composition = await client.getComposition(signal).catch(() => null);
      return { tree, composition };
    },
    [host.daemonUrl],
  );

  // `ready` gates the first fetch until the stored host has hydrated, so a cold
  // launch does not fire at the default host and then race its own correction.
  const { state, refreshing, refresh, retry } = useLoader<{
    tree: TreeResponse;
    composition: Composition | null;
  }>(`${host.id}:${generation}`, load, ready);

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

  const { tree, composition } = state.data;
  const annotations = composition ? annotationsFor(composition) : {};

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <Stack.Screen
        options={{
          // Settings had no entry point at all between the old three-section
          // screen (which reached it by tapping the host label) and here — the
          // rewrite replaced that header and took the only link with it. Nothing
          // caught it, because a missing link renders exactly like a screen that
          // simply has no button.
          headerLeft: () => <SettingsButton />,
          // In the header, not floating: an absolutely-positioned button in a
          // screen that owns no chrome ends up underneath the native tab bar.
          headerRight: () => (
            <Link href="/capture" asChild>
              <Pressable hitSlop={8}>
                <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Capture</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <TreeList
        base=""
        entries={visibleEntries(tree.entries, showDotfiles)}
        total={tree.total}
        truncated={tree.truncated}
        returned={tree.entries.length}
        subtitleFor={(name) => annotations[name]}
        refreshing={refreshing}
        onRefresh={refresh}
        header={
          <View style={{ paddingTop: theme.space.lg }}>
            <Text style={{ ...theme.type.title, color: theme.color.txPrimary }}>
              {host.label}
            </Text>
            {/* Where the old three-section view survives: composition summary
                and protocol load-timings, one tap away rather than gone. */}
            <Link href="/composition" asChild>
              <Text style={{ ...theme.type.caption, color: theme.color.txAccent }}>
                {composition
                  ? `${composition.operators.length} operators · ${composition.commons.length} commons · ${composition.repos.length} repos ›`
                  : 'composition unavailable ›'}
              </Text>
            </Link>
          </View>
        }
      />
    </SafeAreaView>
  );
}
