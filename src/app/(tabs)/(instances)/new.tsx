import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { Box, Button, Icon, ListRow, ROW_ICON_LANE, Rule, Screen, Stack as VStack, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { sessionAPIFor } from '@/lib/session/instance';
import { useLoader } from '@/lib/use-loader';
import { useTheme } from '@/theme';

/** A row in the picker. `value: null` is Dispatcher — the one row that's
 *  always present regardless of whether the composition loaded. */
type PickerRow = { key: string; label: string; note?: string; value: string | null };

/**
 * The `+` sheet: pick an operator (or Dispatcher), press Create.
 *
 * `null` (Dispatcher) starts selected rather than nothing being selected —
 * there's no third "nothing chosen yet" state to model, so Create is live
 * the moment the sheet opens instead of waiting on a tap that most sessions
 * (dispatcher-routed ones) will never make.
 */
export default function NewInstance() {
  const theme = useTheme();
  const router = useRouter();
  const { host, generation, ready } = useHost();

  // Same identity rule as the list and session screens: memoized by
  // id/url inside `sessionAPIFor` already, keyed here on `host.id` +
  // `generation` rather than `host` itself for the same lint reason those
  // screens document.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(() => sessionAPIFor(host), [host.id, generation]);

  const loadComposition = useCallback(
    (signal: AbortSignal) => new DaemonClient(host.daemonUrl).getComposition(signal),
    [host.daemonUrl],
  );
  const { state } = useLoader<Composition>(`${host.id}:${generation}:composition`, loadComposition, ready);

  const operators = state.status === 'ok' ? state.data.operators : [];
  // Named specifically rather than folded into a generic "something went
  // wrong": the composed workspace's operator list is decoration here, not
  // load-bearing — Dispatcher still works with no composition at all, so this
  // is a caption, never the whole screen (see Explorer's index.tsx for the
  // same distinction between the filesystem, which is load-bearing, and
  // composition, which isn't).
  const compositionError =
    state.status === 'error' ? (state.error instanceof Error ? state.error.message : String(state.error)) : null;

  const [selection, setSelection] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const instance = await api.create(selection);
      // A single `replace`, not `dismiss()` + `push()`: this screen is the
      // top entry of the Instances stack (presented as a form sheet), so
      // replacing it swaps the sheet itself for the session route — the
      // sheet closes as a side effect of leaving, and back from the session
      // lands on the list, never back on the sheet. `push` would leave the
      // sheet in history for exactly that back button to return to.
      router.replace(`/(tabs)/(instances)/${instance.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      setCreating(false);
    }
  }, [api, selection, router]);

  const rows: PickerRow[] = [
    { key: 'dispatcher', label: 'Dispatcher', note: 'no operator summoned', value: null },
    ...operators.map((op) => ({ key: op.name, label: op.name, note: op.note ?? op.path, value: op.name })),
  ];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'New instance' }} />

      {compositionError ? (
        <Text
          variant="caption"
          color="txWarning"
          style={{
            paddingHorizontal: theme.space.lg,
            paddingTop: theme.space.md,
            paddingBottom: theme.space.xs,
          }}>
          {`Couldn't load operators — ${compositionError}`}
        </Text>
      ) : null}

      {state.status === 'loading' ? (
        <ActivityIndicator style={{ marginTop: theme.space.lg }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ paddingBottom: theme.space.xxxl }}
          renderItem={({ item, index }) => (
            <>
              <ListRow
                icon="inbox"
                label={item.label}
                note={item.note}
                trailing={selection === item.value ? <Icon name="check" size={18} color="icAccent" /> : null}
                onPress={() => setSelection(item.value)}
              />
              {index < rows.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
            </>
          )}
        />
      )}

      <Box
        p="lg"
        style={{ borderTopWidth: theme.border.hairline, borderTopColor: theme.color.bdPrimary }}>
        <VStack gap="sm">
          {createError ? (
            <Text variant="caption" color="txWarning">
              {`Couldn't create the instance — ${createError}`}
            </Text>
          ) : null}
          <Button label={creating ? 'Creating…' : 'Create'} onPress={onCreate} disabled={creating} />
        </VStack>
      </Box>
    </Screen>
  );
}
