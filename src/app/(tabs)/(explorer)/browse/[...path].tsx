import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownView } from '@/components/markdown-view';
import { TreeList } from '@/components/tree-list';
import { isAudioPath, VoicenotePage } from '@/components/voicenote-page';
import { DaemonClient } from '@/lib/daemon/client';
import {
  DaemonError,
  type FileResponse,
  type TreeResponse,
  type VoicenoteEntry,
  type VoicenoteIndex,
  type VoicenoteState,
} from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { visibleEntries, useShowDotfiles } from '@/lib/preferences';
import { useLoader } from '@/lib/use-loader';
import { markedThemeFor, useTheme } from '@/theme';

type Node =
  | { kind: 'dir'; tree: TreeResponse; voicenoteStates?: Map<string, VoicenoteState> }
  | { kind: 'file'; file: FileResponse }
  | { kind: 'audio'; entry: VoicenoteEntry };

/**
 * A workspace that composes no voicenotes protocol 404s here — an absence of
 * the feature, not a network problem, so it resolves to `null` rather than
 * throwing. Everything else propagates, including an aborted fetch: silently
 * resolving on an abort would let a stale-key load finish successfully after
 * the screen requesting it is gone, the exact pattern already flagged for
 * `getComposition(...).catch(() => null)` in `index.tsx` — this must not
 * repeat it.
 */
async function tryGetVoicenotes(
  client: DaemonClient,
  signal: AbortSignal,
): Promise<VoicenoteIndex | null> {
  try {
    return await client.getVoicenotes(signal);
  } catch (e) {
    if (e instanceof DaemonError && e.status === 404) return null;
    throw e;
  }
}

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
  const { showDotfiles } = useShowDotfiles();
  const params = useLocalSearchParams<{ path?: string | string[] }>();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');

  const load = useCallback(
    async (signal: AbortSignal): Promise<Node> => {
      const client = new DaemonClient(host.daemonUrl);
      let tree: TreeResponse | undefined;
      try {
        tree = await client.getTree(path, signal);
      } catch (e) {
        // Only fall through when the engine specifically said "not a directory".
        // The bare `catch {}` this replaces treated a dropped tailnet, a 403 and
        // a 500 all as "must be a file" — so a network failure surfaced as
        // "Not found" for a directory that exists, with the real message thrown
        // away.
        const isNotADirectory = e instanceof DaemonError && e.status === 400;
        if (!isNotADirectory) throw e;
      }

      if (tree) {
        // The voicenotes fetch sits outside the `getTree` try/catch above on
        // purpose. It is a decoration — a state dot next to a filename — not a
        // diagnosis of the path being browsed, so its failure must never be
        // able to make a real directory (this one, plainly listed a moment
        // ago) read as "not a directory". A composed-but-misconfigured
        // `audio_root` answering 400, or a 500, or a tailnet blip, all fail
        // soft here. An abort is different: that is this request itself being
        // cancelled, and must still propagate so `useLoader` can ignore the
        // stale write.
        const hasAudioEntry = tree.entries.some(
          (entry) => !entry.dir && isAudioPath(entry.name),
        );
        if (hasAudioEntry) {
          try {
            const index = await tryGetVoicenotes(client, signal);
            if (index && index.audio_root === path) {
              // Keyed on the full path, not the basename: the index can in
              // principle span subdirectories of `audio_root`, and two files
              // both named `memo.m4a` collapsing to one map entry would let
              // the inbox dot on one file's row silently show another file's
              // state.
              const states = new Map(index.entries.map((entry) => [entry.audio, entry.state]));
              return { kind: 'dir', tree, voicenoteStates: states };
            }
          } catch (e) {
            if (signal.aborted) throw e;
          }
        }
        return { kind: 'dir', tree };
      }

      try {
        return { kind: 'file', file: await client.getFile(path, signal) };
      } catch (e) {
        // A 415 on an audio path is not the end of the story any more: the file
        // has a page even though its bytes are not served. Neither is a 404 —
        // the audio index is consulted on both now, because an entry whose
        // audio never left the machine that recorded it is not on this
        // machine's disk either, so `/file` answers 404 for it just as it
        // would for a genuine typo. Only a matching index entry turns that
        // into the audio page; anything else still rethrows and still reads
        // "Not found".
        if (
          e instanceof DaemonError &&
          (e.status === 415 || e.status === 404) &&
          isAudioPath(path)
        ) {
          const index = await tryGetVoicenotes(client, signal);
          const entry = index?.entries.find((candidate) => candidate.audio === path);
          if (entry) return { kind: 'audio', entry };
        }
        throw e;
      }
    },
    [host.daemonUrl, path],
  );

  const { state, refreshing, refresh } = useLoader<Node>(`${host.id}:${path}`, load, ready);

  const title = path.split('/').pop() || 'Browse';

  // Captured as a plain `Map | undefined` rather than read through
  // `state.data` inside the render closure below: TS narrowing on a
  // discriminated union doesn't survive into a nested function body, so this
  // is what lets `trailingFor` stay typed without re-deriving the union tag.
  const voicenoteStates =
    state.status === 'ok' && state.data.kind === 'dir' ? state.data.voicenoteStates : undefined;
  const trailingFor = voicenoteStates
    ? (entryPath: string) => {
        // `entryPath` is the full path TreeList computes (`base` + name), not
        // a bare filename — matching how `voicenoteStates` above is now keyed,
        // so two identically-named files in different subdirectories cannot
        // collide onto the same dot.
        const voicenoteState = voicenoteStates.get(entryPath);
        return voicenoteState === 'transcribed' ? '●' : voicenoteState === 'untranscribed' ? '○' : undefined;
      }
    : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }} edges={['bottom']}>
      <Stack.Screen options={{ title }} />

      {state.status === 'loading' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : state.status === 'error' ? (
        <View style={{ flex: 1, padding: theme.space.lg }}>
          <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
            {titleFor(state.error)}
          </Text>
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.xs,
            }}>
            {path}
          </Text>
          {detailFor(state.error) ? (
            <Text
              style={{
                ...theme.type.caption,
                color: theme.color.txTertiary,
                paddingTop: theme.space.sm,
              }}>
              {detailFor(state.error)}
            </Text>
          ) : null}
        </View>
      ) : state.data.kind === 'dir' ? (
        <TreeList
          base={path}
          entries={visibleEntries(state.data.tree.entries, showDotfiles)}
          total={state.data.tree.total}
          truncated={state.data.tree.truncated}
          returned={state.data.tree.entries.length}
          trailingFor={trailingFor}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      ) : state.data.kind === 'audio' ? (
        <VoicenotePage path={path} entry={state.data.entry} />
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
