import { useAuth } from '@/lib/auth/auth-context';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityLine } from '@/components/activity-line';
import { InstancePanel } from '@/components/instance-panel';
import { Icon } from '@/components/ui';
import { usePanel, usePanelContent } from '@/lib/panel-context';
import { MessageMarkdown } from '@/components/message-markdown';
import { SelectTextSheet } from '@/components/select-text-sheet';
import { ThinkingAccordion } from '@/components/thinking-accordion';
import { ToolRow } from '@/components/tool-row';
import { useHost } from '@/lib/host-context';
import type { Host } from '@/lib/hosts';
import { useShowThinking } from '@/lib/preferences';
import { sessionAPIFor } from '@/lib/session/instance';
import { pairToolRows } from '@/lib/session/project';
import type { DisplayRow, SessionRow } from '@/lib/session/project';
import { useSession } from '@/lib/session/use-session';
import { useTheme } from '@/theme';

type MessageRow = Extract<SessionRow, { kind: 'message' }>;

export function HeaderTitle({ operator, model }: { operator: string | null; model: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ ...theme.type.label, color: theme.color.txPrimary }}>
        {operator ? `@${operator}` : 'dispatcher'}
      </Text>
      {model ? (
        <Text numberOfLines={1} style={{ ...theme.type.caption, color: theme.color.txTertiary }}>{model}</Text>
      ) : null}
    </View>
  );
}

/**
 * Approximate — the standard (non-large-title) iOS native-stack header
 * content height. This screen's `SafeAreaView` opts out of the `top` edge
 * (see below), so the JS content genuinely starts under the native header
 * rather than below it; `KeyboardAvoidingView`'s own frame measurement
 * doesn't know that, and without this offset its "padding" behavior would
 * overshoot by exactly the header's height when the keyboard shows.
 *
 * Not measured via `useHeaderHeight()` (the react-navigation-recommended way
 * to get this exactly rather than guess it): that hook throws outside a
 * screen inside a real navigator, and this screen's own test suite
 * (session-screen.test.tsx) renders it standalone, with no Stack ancestor —
 * matching every other screen test in this repo's convention of mocking
 * router pieces rather than mounting a full navigator for one field. Revisit
 * with a device pass — if the title ever grows (a large title, a wrapped
 * title), this constant needs to grow with it.
 */
const ESTIMATED_HEADER_HEIGHT = 44;

/** One key per row, by kind — the same identity project.ts's own rows carry,
 *  plus the synthetic gap row this screen (not the reducer) injects. */
function rowKey(row: DisplayRow): string {
  switch (row.kind) {
    case 'message':
    case 'system':
    case 'tool':
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
  const insets = useSafeAreaInsets();
  const { noteRefusal } = useAuth();
  const { showThinking } = useShowThinking();
  // Same factory, same identity rule as the list screen (Task 5's shared
  // store, now host-aware): whichever instance the list screen created this
  // is, by construction, the same client object. Keyed on `host.id` +
  // `generation` rather than `host` itself for the same reason as the list
  // screen (see its comment) — `sessionAPIFor` already memoizes by id/url.
  const api = useMemo(() => sessionAPIFor(host), [host.id, generation]);
  const {
    rows,
    status,
    gap,
    sendError,
    send,
    interrupt,
    evict,
    instance,
    turnInFlight,
    turnStateUnsupported,
  } = useSession(
    api,
    instanceId,
    true,
    // Lets a REVOKE land: the host reads its registry per request, so being
    // refused is the only way this app learns its token died mid-session.
    noteRefusal,
  );
  const [draft, setDraft] = useState('');
  // The panel's open state belongs to the host above the Stack, not to this
  // screen — the drawer has to be up there to cover the header, so the screen
  // supplies content and asks for it to open rather than owning it.
  const { setOpen: setPanelOpen } = usePanel();

  // The streaming row itself still renders straight off `displayRows`/`rows`
  // below — this is about the other two readers: the composer's Send/Stop
  // branch and the drawer's `canInterrupt`. Both bind to `turnInFlight`, not
  // to whether text happens to be arriving (that was the bug: a streaming row
  // goes false at every round boundary and during every tool call, so Stop
  // vanished mid-turn).
  //
  // `turnStateUnsupported` is a COMPATIBILITY SHIM, not a second source of
  // truth: `turnInProgress` is documented optional so this app can attach to
  // an engine predating core#30, and against such a host — no field on
  // attach, no `turn_started`/`turn_ended` on the wire — `turnInFlight` would
  // sit permanently `false` and Stop would never appear at all (a regression
  // against the pre-this-branch behavior, which at least showed Stop while
  // text streamed). Falling back to the streaming-derived read ONLY while the
  // host is confirmed too old to answer keeps the two-signals-two-jobs design
  // untouched for every current host. Delete this the moment no engine
  // predating core#30 is in service.
  const workingIndicator = turnStateUnsupported
    ? rows.some((r) => r.kind === 'streaming')
    : turnInFlight;

  // Chronological rows (oldest first) plus, when the log has a hole the
  // subscription can't fill, a gap row naming it — `projectSession` never
  // emits one itself (Task 4's design: the reducer is pure over durable
  // events + transients, the gap is a transport-layer signal the hook
  // surfaces separately). Reversed once, for the inverted FlatList below.
  const displayRows = useMemo<DisplayRow[]>(() => {
    const withGap: SessionRow[] = gap
      ? [
          {
            kind: 'gap',
            label: `earlier messages (before seq ${gap.earliestAvailable}) are not available`,
          },
          ...rows,
        ]
      : rows;
    return [...pairToolRows(withGap)].reverse();
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

  const [selectText, setSelectText] = useState<string | null>(null);

  // The user/pending bubble, extracted once — both render arms below share it.
  const bubbleStyle = {
    maxWidth: '78%' as const,
    backgroundColor: theme.color.bgSecondary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm + theme.space.xxs,
  };

  // The evict confirm, exactly as it was before the menu existed — the menu's
  // Remove item leads here rather than replacing it.
  const confirmEvict = useCallback(
    (row: MessageRow) => {
      Alert.alert('Remove from context?', row.text, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void evict(row.id) },
      ]);
    },
    [evict],
  );

  const onLongPressMessage = useCallback(
    (row: MessageRow) => {
      const copy = () => void Clipboard.setStringAsync(row.text);
      const select = () => setSelectText(row.text);
      if (Platform.OS === 'ios') {
        // Evicted rows drop Remove — there is nothing left to remove.
        const options = row.evicted
          ? ['Copy', 'Select text', 'Cancel']
          : ['Copy', 'Select text', 'Remove from context', 'Cancel'];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: options.length - 1,
            destructiveButtonIndex: row.evicted ? undefined : 2,
          },
          (index) => {
            if (index === 0) copy();
            else if (index === 1) select();
            else if (index === 2 && !row.evicted) confirmEvict(row);
          },
        );
      } else {
        // Android's Alert renders at most three buttons, so Cancel is not a
        // button here: tap-outside/back dismisses (spec § Interaction).
        Alert.alert(
          'Message',
          undefined,
          [
            { text: 'Copy', onPress: copy },
            { text: 'Select text', onPress: select },
            ...(row.evicted
              ? []
              : [
                  {
                    text: 'Remove from context',
                    style: 'destructive' as const,
                    onPress: () => confirmEvict(row),
                  },
                ]),
          ],
          { cancelable: true },
        );
      }
    },
    [confirmEvict],
  );

  // Archive or unarchive, whichever this instance is not — the same
  // `api.archive`/`api.unarchive` pair the Instances list reaches by long
  // press, not a second implementation. No confirm (design 2026-08-11 D4): the
  // verb acts immediately and the Archived filter is the undo path. The button
  // does not need to re-read anything afterwards — the engine appends the
  // marker to this instance's own stream, so the open subscription carries it
  // back and `useSession` updates `instance.archived` from the event.
  const onArchive = useCallback(() => {
    if (!instance) return;
    const verb = instance.archived ? 'Unarchive' : 'Archive';
    void (instance.archived ? api.unarchive(instance.id) : api.archive(instance.id)).catch(
      (e: unknown) => {
        Alert.alert(`${verb} failed`, e instanceof Error ? e.message : String(e));
      },
    );
  }, [api, instance]);

  // What this screen puts in the app's one panel, for as long as it is mounted.
  // Memoized because `usePanelContent` depends on its identity — a fresh
  // closure every render would re-register every render.
  const panelContent = useCallback(
    () => (
      <InstancePanel
        instance={instance}
        onDismiss={() => setPanelOpen(false)}
        onInterrupt={() => {
          setPanelOpen(false);
          void interrupt();
        }}
        canInterrupt={workingIndicator}
        onArchive={onArchive}
      />
    ),
    [instance, setPanelOpen, interrupt, workingIndicator, onArchive],
  );
  usePanelContent(panelContent);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <Stack.Screen
        options={{
          // Title is set only once attach() resolves — before that,
          // `_layout.tsx`'s static "Instance" fallback holds.
          // `@operator`/`dispatcher` names who's actually attached
          // (vocabulary: an operator is a composed identity, not "a
          // session") — matching how the app already names
          // dispatcher-routed instances elsewhere (project.ts's
          // `instance_created` system row).
          ...(instance
            ? { headerTitle: () => <HeaderTitle operator={instance.operator} model={instance.model} /> }
            : null),
          // The panel's open affordance. Unconditional, unlike the title: a
          // panel that only appears once attach() resolves would be missing
          // in exactly the states — reconnecting, refused — where knowing
          // which model and stream you are attached to matters most.
          headerRight: () => (
            <Pressable
              onPress={() => setPanelOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open instance panel"
              testID="open-instance-panel">
              <Icon name="panel" size={20} color="icPrimary" />
            </Pressable>
          ),
        }}
      />

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

      {/*
        Clears the composer from the native bottom tab bar and rises it with
        the keyboard. Wrapping from here (not just the composer row) so the
        FlatList — flex: 1 — is what actually shrinks when the keyboard
        appears, with the composer staying pinned just above it.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + ESTIMATED_HEADER_HEIGHT : 0}>
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
                    <Pressable
                      onLongPress={() => onLongPressMessage(item)}
                      style={{ paddingVertical: theme.space.sm }}>
                      <Text style={{ ...theme.type.body, color: theme.color.txDisabled }}>{item.text}</Text>
                      <Text
                        style={{
                          ...theme.type.caption,
                          color: theme.color.txDisabled,
                          paddingTop: theme.space.xxs,
                        }}>
                        removed from context
                      </Text>
                    </Pressable>
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
                if (item.role === 'operator') {
                  // A tool-only round leaves `text: ''` with no thinking to
                  // show (showThinking off, the default, is the common case) —
                  // rendering the Pressable then would be an empty 16pt strip
                  // with an invisible long-press target and a Copy-'' menu.
                  // Nothing to show means no row at all.
                  if (!item.text && !(showThinking && item.thinking)) return null;
                  return (
                    <Pressable
                      onLongPress={() => onLongPressMessage(item)}
                      style={{ paddingVertical: theme.space.sm }}>
                      {showThinking && item.thinking ? <ThinkingAccordion blocks={item.thinking} /> : null}
                      {item.text ? <MessageMarkdown source={item.text} /> : null}
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    onLongPress={() => onLongPressMessage(item)}
                    style={{ paddingVertical: theme.space.xs, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <View testID="user-bubble" style={bubbleStyle}>
                      <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>{item.text}</Text>
                    </View>
                  </Pressable>
                );
              }
              case 'pending':
                return (
                  <View style={{ paddingVertical: theme.space.xs, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <View testID="pending-bubble" style={{ ...bubbleStyle, opacity: 0.6 }}>
                      <Text style={{ ...theme.type.body, color: theme.color.txPrimary }}>{item.text}</Text>
                    </View>
                  </View>
                );
              case 'streaming':
                return (
                  <View style={{ paddingVertical: theme.space.sm }}>
                    <Text style={{ ...theme.type.body, color: theme.color.txBody }}>
                      {item.text}
                      {/* ▍as a styled glyph rides inline through wrapping,
                          which no View can. Accent-colored per D6; the token
                          is blue until daoUI resolves the orange gap. If
                          Whyte lacks the glyph the system fallback renders
                          it — the device walk confirms which. */}
                      <Text style={{ color: theme.color.txAccent }}>▍</Text>
                    </Text>
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
              case 'tool':
                return <ToolRow row={item} />;
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

        <ActivityLine label={workingIndicator ? 'working' : null} />

        <View
          testID="composer-row"
          style={{
            paddingHorizontal: theme.space.lg,
            paddingTop: theme.space.sm,
            // The static (keyboard-down) clearance from the home indicator,
            // and nothing else. This screen is registered on the ROOT stack,
            // above the tab bar, so no bar sits beneath it and `insets.bottom`
            // is the bare safe-area value.
            //
            // `edges={[]}` on this screen's outer SafeAreaView means no bottom
            // inset is applied there, so this is still the only place the
            // clearance can live.
            //
            // This replaces a comment that could not settle whether a *pushed*
            // stack screen inside a tab controller inherits the controller's
            // reduced inset or just the bare home-indicator value — iOS 26's
            // floating-capsule tab bar made it a device question, and there is
            // no `useBottomTabBarHeight()` equivalent for NativeTabs to
            // cross-check against. Moving the chat above the bar closed that
            // question rather than answering it: there is no capsule beneath
            // this screen to be ambiguous about.
            paddingBottom: theme.space.md + insets.bottom,
          }}>
          <View
            style={{
              backgroundColor: theme.color.bgSecondary,
              borderRadius: theme.radius.xl,
              paddingHorizontal: theme.space.md,
              paddingTop: theme.space.md,
              paddingBottom: theme.space.sm,
              gap: theme.space.sm,
            }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={theme.color.txTertiary}
              multiline
              style={{ ...theme.type.body, color: theme.color.txPrimary, maxHeight: 120, padding: 0 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              {workingIndicator ? (
                <Pressable
                  onPress={() => void interrupt()}
                  accessibilityRole="button"
                  accessibilityLabel="Stop"
                  hitSlop={8}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: theme.radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.bgError,
                  }}>
                  <Icon name="square" size={12} color="txError" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  hitSlop={8}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: theme.radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.bgAccent,
                  }}>
                  <Icon name="arrowUp" size={16} color="txAccent" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SelectTextSheet text={selectText} onDone={() => setSelectText(null)} />
    </SafeAreaView>
  );
}
