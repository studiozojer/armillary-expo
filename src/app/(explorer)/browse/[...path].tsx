import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownView } from '@/components/markdown-view';
import { TreeList } from '@/components/tree-list';
import { Box, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import { DaemonError, type FileResponse, type TreeResponse } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useLoader } from '@/lib/use-loader';
import { markedThemeFor, useTheme } from '@/theme';

type Node = { kind: 'dir'; tree: TreeResponse } | { kind: 'file'; file: FileResponse };

/** Each refusal gets its own sentence. A 415 on a .png means something specific,
 *  and saying so is more useful than a generic failure the reader must guess at. */
function titleFor(error: unknown): string {
  if (!(error instanceof DaemonError)) return "Couldn't reach the engine";
  switch (error.status) {
    case 403:
      return 'Not served';
    case 404:
      return 'Not found';
    case 413:
      return 'Too large to open';
    case 415:
      return "Can't open this file type";
    default:
      return "Couldn't open this";
  }
}

function detailFor(error: unknown): string | null {
  if (!(error instanceof DaemonError)) {
    // Preserve the thrown message. Discarding it is what turned an App
    // Transport Security refusal into an unexplained blank screen once already.
    return error instanceof Error ? error.message : String(error);
  }
  switch (error.status) {
    case 403:
      return 'The engine refuses paths outside the workspace, and never serves credentials or build output.';
    case 413:
      return 'Files over 1 MB are listed but not served.';
    case 415:
      return 'Images and audio are listed but not served in this version.';
    default:
      return null;
  }
}

export default function Browse() {
  const theme = useTheme();
  const { host, ready } = useHost();
  const params = useLocalSearchParams<{ path?: string | string[] }>();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');

  const load = useCallback(
    async (signal: AbortSignal): Promise<Node> => {
      const client = new DaemonClient(host.daemonUrl);
      try {
        return { kind: 'dir', tree: await client.getTree(path, signal) };
      } catch (e) {
        // Only fall through when the engine specifically said "not a directory".
        // The bare `catch {}` this replaces treated a dropped tailnet, a 403 and
        // a 500 all as "must be a file" — so a network failure surfaced as
        // "Not found" for a directory that exists, with the real message thrown
        // away.
        const isNotADirectory = e instanceof DaemonError && e.status === 400;
        if (!isNotADirectory) throw e;
      }
      return { kind: 'file', file: await client.getFile(path, signal) };
    },
    [host.daemonUrl, path],
  );

  const { state, refreshing, refresh } = useLoader<Node>(`${host.id}:${path}`, load, ready);

  const title = path.split('/').pop() || 'Browse';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }}
      edges={['bottom']}>
      <Stack.Screen options={{ title }} />

      {state.status === 'loading' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : state.status === 'error' ? (
        <Box p="lg" style={{ flex: 1 }}>
          <Text variant="heading">{titleFor(state.error)}</Text>
          <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xs }}>
            {path}
          </Text>
          {detailFor(state.error) ? (
            <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.sm }}>
              {detailFor(state.error)}
            </Text>
          ) : null}
        </Box>
      ) : state.data.kind === 'dir' ? (
        <TreeList
          base={path}
          entries={state.data.tree.entries}
          total={state.data.tree.total}
          truncated={state.data.tree.truncated}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      ) : (
        // A rendered file gets pull-to-refresh too. It was the one surface
        // without it, which made "is the board current?" answerable everywhere
        // except on the document you were actually reading.
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          contentContainerStyle={{ flexGrow: 1 }}>
          <MarkdownView source={state.data.file.text} theme={markedThemeFor(theme)} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
