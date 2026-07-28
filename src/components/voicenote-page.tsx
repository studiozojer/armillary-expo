import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { VoicenoteEntry } from '@/lib/daemon/types';
import { useTheme } from '@/theme';

// The engine polices which extensions land in the voicenote index at all —
// this set must match it exactly, or the client and the engine would disagree
// about what counts as a memo.
const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.m4b', '.aac'];

export function isAudioPath(path: string): boolean {
  const lower = path.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoicenotePage({ path, entry }: { path: string; entry: VoicenoteEntry }) {
  const theme = useTheme();
  const name = path.split('/').pop() ?? path;

  return (
    <View style={{ flex: 1, padding: theme.space.lg }}>
      <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>{name}</Text>
      {/* No fallback string for a missing `bytes` here: that case is exactly
          `state === 'audio_absent'`, and the dedicated view below already
          says so in a full sentence — repeating it here would just be the
          same fact twice in two sizes of text. */}
      <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
        {entry.bytes !== undefined ? megabytes(entry.bytes) : ''}
        {entry.transcript?.recorded ? ` · recorded ${entry.transcript.recorded}` : ''}
      </Text>

      {/* The stub. Visibly disabled and labelled, because an inert play button
          that looks live reads as a bug rather than as unfinished work. */}
      <View
        style={{
          marginTop: theme.space.lg,
          padding: theme.space.lg,
          borderRadius: theme.radius.md,
          borderWidth: theme.border.thin,
          borderColor: theme.color.bdPrimary,
          opacity: 0.5,
          alignItems: 'center',
        }}>
        <Text style={{ ...theme.type.heading, color: theme.color.txTertiary }}>▶︎</Text>
        <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
          Playback not built yet
        </Text>
      </View>

      <View style={{ height: theme.space.xl }} />

      {entry.state === 'transcribed' && entry.transcript ? (
        <Link href={`/browse/${entry.transcript.path}`} asChild>
          <Pressable>
            <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>TRANSCRIPT</Text>
            <Text style={{ ...theme.type.body, color: theme.color.txAccent }}>
              {entry.transcript.title ?? entry.transcript.path}
            </Text>
            <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
              {[entry.transcript.transcribed_by, entry.transcript.model]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        </Link>
      ) : entry.state === 'transcribed' ? (
        // `state` says transcribed but `transcript` is missing — data the
        // engine itself is inconsistent about. The old `else` here printed
        // "Not transcribed yet." for this case, which is a second, different
        // false statement layered on the first: not only wrong, but wrong in
        // a way that tells the reader to go run a command that has already
        // been run. Naming the inconsistency is the honest thing to render.
        <View>
          <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>
            Marked transcribed, but no transcript is on record.
          </Text>
          <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
            The engine's index disagrees with itself here — this is not something to fix by
            transcribing again.
          </Text>
        </View>
      ) : entry.state === 'audio_absent' ? (
        <View>
          <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>
            Transcribed, but the audio is not on this machine.
          </Text>
          <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
            The inbox is machine-local and untracked; the transcript travels.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>
            Not transcribed yet.
          </Text>
          <Text
            selectable
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.sm,
            }}>
            {`python zojercommons/practices/voicenotes/transcribe.py "${path}" \\\n  zojercommons/voicenotes/<date>-<slug>.md --transcribed-by @tycho`}
          </Text>
        </View>
      )}
    </View>
  );
}
