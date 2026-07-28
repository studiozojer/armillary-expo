import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownView } from '@/components/markdown-view';
import { useHost } from '@/lib/host-context';
import type { Host } from '@/lib/hosts';
import { sessionAPIFor } from '@/lib/session/instance';
import type { SessionRow } from '@/lib/session/project';
import { useSession } from '@/lib/session/use-session';
import { markedThemeFor, useTheme } from '@/theme';

type MessageRow = Extract<SessionRow, { kind: 'message' }>;

/** One key per row, by kind — the same identity project.ts's own rows carry,
 *  plus the synthetic gap row this screen (not the reducer) injects. */
function rowKey(row: SessionRow): string {
  switch (row.kind) {
    case 'message':
    case 'system':
      return row.id;
    case 'pending':
      return row.clientKey;
    case 'streaming':
      return row.generation;
    case 'gap':
      return 'gap';
  }
}

export default function SessionScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { host, generation, ready } = useHost();

  // Same guard as the list screen: hold off on the visible session until the
  // stored host has hydrated, so a cold launch doesn't flash a session
  // attached against the default host before correcting.
  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }} edges={[]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // Keyed on `host.id`: a mid-session host switch must not leave the
  // subscription attached to the old host while sends target the new one
  // (useSession's own effect only re-runs on `instanceId`/`enabled`, not on
  // `api` — a fresh `api` object alone doesn't tear down the old
  // subscription). Keying the component that *calls* useSession on the host
  // id forces React to unmount the old instance (running its cleanup —
  // unsubscribe — before the old api is dropped) and mount a fresh one that
  // attaches/subscribes against the new host from scratch.
  return <SessionView key={host.id} instanceId={instanceId} host={host} generation={generation} />;
}

function SessionView({
  instanceId,
  host,
  generation,
}: {
  instanceId: string;
  host: Host;
  generation: number;
}) {
  const theme = useTheme();
  // Same factory, same identity rule as the list screen (Task 5's shared
  // store, now host-aware): whichever instance the list screen created this
  // is, by construction, the same client object. Keyed on `host.id` +
  // `generation` rather than `host` itself for the same reason as the list
  // screen (see its comment) — `sessionAPIFor` already memoizes by id/url.
  const api = useMemo(() => sessionAPIFor(host), [host.id, generation]);
  const { rows, status, gap, sendError, send, interrupt, evict, instance } = useSession(api, instanceId);
  const [draft, setDraft] = useState('');

  const streaming = rows.some((r) => r.kind === 'streaming');

  // Chronological rows (oldest first) plus, when the log has a hole the
  // subscription can't fill, a gap row naming it — `projectSession` never
  // emits one itself (Task 4's design: the reducer is pure over durable
  // events + transients, the gap is a transport-layer signal the hook
  // surfaces separately). Reversed once, for the inverted FlatList below.
  const displayRows = useMemo<SessionRow[]>(() => {
    const withGap: SessionRow[] = gap
      ? [
          {
            kind: 'gap',
            label: `earlier messages (before seq ${gap.earliestAvailable}) are not available`,
          },
          ...rows,
        ]
      : rows;
    return [...withGap].reverse();
  }, [rows, gap]);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text).then((accepted) => {
      if (accepted) return;
      // Restore what was cleared optimistically — but only if the composer
      // is still empty, so a rejection landing after the user has already
      // started a new message doesn't clobber it.
      setDraft((current) => (current === '' ? text : current));
    });
  }, [draft, send]);

  const onLongPressMessage = useCallback(
    (row: MessageRow) => {
      Alert.alert('Remove from context?', row.text, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void evict(row.id) },
      ]);
    },
    [evict],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      {instance ? (
        // Set only once attach() resolves — before that, `_layout.tsx`'s
        // static "Instance" fallback title holds. `@operator`/`dispatcher`
        // names who's actually attached (vocabulary: an operator is a
        // composed identity, not "a session") — matching how the app already
        // names dispatcher-routed instances elsewhere (project.ts's
        // `instance_created` system row).
        <Stack.Screen options={{ title: instance.operator ? `@${instance.operator}` : 'dispatcher' }} />
      ) : null}

      {status !== 'live' ? (
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txWarning,
            textAlign: 'center',
            paddingVertical: theme.space.xs,
          }}>
          {status === 'replaying'
            ? 'Loading…'
            : // 'closed' only ever reaches here from an attach() failure
              // (use-session.ts's onStatus handler converts a dropped live
              // connection's 'closed' into 'reconnecting' before it gets
              // this far) — so unlike 'reconnecting', nothing is retrying,
              // and saying "Reconnecting…" would be dishonest. Name the
              // refusal instead, using the message attach() rejected with.
              status === 'closed'
              ? `Couldn't reach the instance — ${sendError ?? 'unknown error'}`
              : 'Reconnecting…'}
        </Text>
      ) : null}

      {instance ? (
        // Minimal id surface: identifiable without curl-ing the daemon. Not a
        // metadata panel (that's a designed future pass) — just the short id,
        // txTertiary, one line.
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            textAlign: 'center',
            paddingBottom: theme.space.xs,
          }}>
          {instance.id.slice(0, 8)}
        </Text>
      ) : null}

      <FlatList
        inverted
        data={displayRows}
        keyExtractor={rowKey}
        contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'message': {
              if (item.evicted) {
                return (
                  <View style={{ paddingVertical: theme.space.sm }}>
                    <Text style={{ ...theme.type.body, color: theme.color.txDisabled }}>{item.text}</Text>
                    <Text
                      style={{
                        ...theme.type.caption,
                        color: theme.color.txDisabled,
                        paddingTop: theme.space.xxs,
                      }}>
                      removed from context
                    </Text>
                  </View>
                );
              }
              if (item.error) {
                // The failure-shaped assistant_message the engine's fail_turn
                // appends always carries text: "" alongside the error code
                // (see events.ts's AssistantMessageData comment) — rendering
                // the normal text branch below on an empty string is exactly
                // the invisible-row bug this exists to fix, so this checks
                // `error` first and never falls through to it. Named verbatim
                // (house rule): the machine code, not a paraphrase.
                return (
                  <View style={{ paddingVertical: theme.space.sm }}>
                    <Text style={{ ...theme.type.caption, color: theme.color.txWarning }}>
                      {`turn failed: ${item.error}`}
                    </Text>
                  </View>
                );
              }
              return (
                <Pressable onLongPress={() => onLongPressMessage(item)} style={{ paddingVertical: theme.space.sm }}>
                  {item.role === 'operator' ? (
                    <MarkdownView source={item.text} theme={markedThemeFor(theme)} />
                  ) : (
                    <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>{item.text}</Text>
                  )}
                </Pressable>
              );
            }
            case 'pending':
              return (
                <View style={{ paddingVertical: theme.space.sm }}>
                  <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>{item.text}</Text>
                </View>
              );
            case 'streaming':
              return (
                <View style={{ paddingVertical: theme.space.sm }}>
                  <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>{item.text}…</Text>
                </View>
              );
            case 'system':
            case 'gap':
              return (
                <Text
                  style={{
                    ...theme.type.caption,
                    color: theme.color.txTertiary,
                    textAlign: 'center',
                    paddingVertical: theme.space.sm,
                  }}>
                  {item.label}
                </Text>
              );
          }
        }}
      />

      {sendError && status !== 'closed' ? (
        // Suppressed when status is 'closed': that's an attach failure,
        // already named by the status caption above — this banner is for a
        // rejected send() on an otherwise-live session, not a second copy of
        // the same message.
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txWarning,
            paddingHorizontal: theme.space.lg,
            paddingBottom: theme.space.xs,
          }}>
          {sendError}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: theme.space.md,
          borderTopWidth: theme.border.hairline,
          borderTopColor: theme.color.bdPrimary,
        }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={theme.color.txTertiary}
          style={{
            flex: 1,
            ...theme.type.body,
            color: theme.color.txPrimary,
            paddingVertical: theme.space.sm,
            paddingHorizontal: theme.space.md,
            borderRadius: theme.radius.md,
            borderWidth: theme.border.thin,
            borderColor: theme.color.bdBase,
          }}
        />
        {streaming ? (
          <Pressable
            onPress={() => void interrupt()}
            style={{
              paddingVertical: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.bgError,
            }}>
            <Text style={{ ...theme.type.label, color: theme.color.txError }}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onSend}
            style={{
              paddingVertical: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.bgAccent,
            }}>
            <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Send</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
