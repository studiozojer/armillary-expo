import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownView } from '@/components/markdown-view';
import { useHost } from '@/lib/host-context';
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
  const theme = useTheme();
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { host, generation, ready } = useHost();
  // Same factory, same identity rule as the list screen (Task 5's shared
  // store, now host-aware): whichever instance the list screen created this
  // is, by construction, the same client object. Keyed on `host.id` +
  // `generation` rather than `host` itself for the same reason as the list
  // screen (see its comment) — `sessionAPIFor` already memoizes by id/url.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(() => sessionAPIFor(host), [host.id, generation]);
  const { rows, status, gap, sendError, send, interrupt, evict } = useSession(api, instanceId);
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
    void send(text);
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

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      {status !== 'live' ? (
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txWarning,
            textAlign: 'center',
            paddingVertical: theme.space.xs,
          }}>
          {status === 'replaying' ? 'Loading…' : 'Reconnecting…'}
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

      {sendError ? (
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
