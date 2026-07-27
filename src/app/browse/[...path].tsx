import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownView } from '@/components/markdown-view';
import { TreeList } from '@/components/tree-list';
import { DaemonClient } from '@/lib/daemon/client';
import { useHost } from '@/lib/host-context';
import { DaemonError, type FileResponse, type TreeResponse } from '@/lib/daemon/types';
import { markedThemeFor, useTheme } from '@/theme';

type Screen =
  | { kind: 'loading' }
  | { kind: 'dir'; tree: TreeResponse }
  | { kind: 'file'; file: FileResponse }
  | { kind: 'error'; status?: number };

/** Each refusal gets its own sentence. A 415 on a .png means something specific
 *  and saying so is more useful than a generic failure the reader must guess at. */
function titleFor(status?: number): string {
  switch (status) {
    case 403:
      return 'Outside the workspace';
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

function detailFor(status?: number): string | null {
  switch (status) {
    case 403:
      return 'The engine refuses paths that leave the workspace root, and never serves credentials.';
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
  const { host } = useHost();
  const params = useLocalSearchParams<{ path?: string | string[] }>();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');

  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const client = new DaemonClient(host.daemonUrl);
    try {
      // Ask for a directory first; the engine already distinguishes a directory
      // from a file, so falling back on rejection is cheaper than adding a stat
      // route just to decide which call to make.
      setScreen({ kind: 'dir', tree: await client.getTree(path) });
      return;
    } catch {
      // fall through to the file attempt
    }
    try {
      setScreen({ kind: 'file', file: await client.getFile(path) });
    } catch (e) {
      setScreen({ kind: 'error', status: e instanceof DaemonError ? e.status : undefined });
    }
  }, [path, host]);

  useEffect(() => {
    setScreen({ kind: 'loading' });
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const title = path.split('/').pop() || 'Browse';

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title }} />

      {screen.kind === 'loading' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : screen.kind === 'error' ? (
        <View style={{ flex: 1, padding: theme.space.lg }}>
          <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
            {titleFor(screen.status)}
          </Text>
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.xs,
            }}>
            {path}
          </Text>
          {detailFor(screen.status) ? (
            <Text
              style={{
                ...theme.type.caption,
                color: theme.color.txTertiary,
                paddingTop: theme.space.sm,
              }}>
              {detailFor(screen.status)}
            </Text>
          ) : null}
        </View>
      ) : screen.kind === 'dir' ? (
        <TreeList
          base={path}
          entries={screen.tree.entries}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      ) : (
        <MarkdownView source={screen.file.text} theme={markedThemeFor(theme)} />
      )}
    </SafeAreaView>
  );
}
