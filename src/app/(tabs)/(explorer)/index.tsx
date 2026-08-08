import { Link, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ChromeZone } from '@/components/chrome-zone';
import { TreeList } from '@/components/tree-list';
import { Box, CircleButton, Screen, Text as UIText } from '@/components/ui';
import { daemonClientFor } from '@/lib/daemon/client';
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
      const client = daemonClientFor(host.id, host.daemonUrl);
      const tree = await client.getTree('', signal);
      // The filesystem is the load-bearing half. If /composition fails we still
      // render the workspace, just without subtitles — the old screen could
      // show nothing at all in this case.
      const composition = await client.getComposition(signal).catch(() => null);
      return { tree, composition };
    },
    [host.daemonUrl, host.id],
  );

  // `ready` gates the first fetch until the stored host has hydrated, so a cold
  // launch does not fire at the default host and then race its own correction.
  const { state, refreshing, refresh, retry } = useLoader<{
    tree: TreeResponse;
    composition: Composition | null;
  }>(`${host.id}:${generation}`, load, ready);

  const router = useRouter();

  // Mounted once, above the state switch — never per branch (see ChromeZone's
  // own comment for the scar that rule comes from). This is also where the old
  // header's two only entry points now live: capture as the live mic button,
  // and — for the data state — the stats line below as a `Link`.
  const chrome = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChromeZone
        trailing={
          <>
            <CircleButton testID="search-stub" icon="search" accessibilityLabel="Search" disabled />
            <CircleButton
              testID="capture-button"
              icon="mic"
              accessibilityLabel="Capture"
              onPress={() => router.push('/capture')}
            />
            <CircleButton
              testID="explorer-more-stub"
              icon="more"
              accessibilityLabel="More"
              disabled
            />
          </>
        }
      />
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
        </Box>
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen>
        {chrome}
        <Box flex={1} style={{ justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </Box>
      </Screen>
    );
  }

  const { tree, composition } = state.data;
  const annotations = composition ? annotationsFor(composition) : {};

  return (
    <Screen edges={['top']}>
      {chrome}
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
          <Box style={{ paddingTop: theme.space.md, paddingBottom: theme.space.md }}>
            <UIText variant="display">{host.label}</UIText>
            {/* Where the old three-section view survives: composition summary
                and protocol load-timings, one tap away rather than gone. */}
            <Link href="/composition" asChild>
              <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel="Composition">
                <UIText
                  variant="caption"
                  color="txTertiary"
                  style={{ paddingTop: theme.space.xs }}>
                  {composition
                    ? `${composition.operators.length} operators • ${composition.repos.length} repos • ${composition.commons.length} commons ›`
                    : 'composition unavailable ›'}
                </UIText>
              </Pressable>
            </Link>
          </Box>
        }
      />
    </Screen>
  );
}
