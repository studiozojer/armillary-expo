import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Box, Button, Card, Icon, Inline, ListRow, Rule, Screen, Text } from '@/components/ui';
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
  const [expanded, setExpanded] = useState(false);
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
      router.replace(`/instance/${instance.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      setCreating(false);
    }
  }, [api, selection, router]);

  const rows: PickerRow[] = [
    { key: 'dispatcher', label: 'Dispatcher', note: 'no operator summoned', value: null },
    ...operators.map((op) => ({ key: op.name, label: op.name, note: op.note ?? op.path, value: op.name })),
  ];

  const selectionLabel = selection ?? 'Dispatcher';

  return (
    // The top inset is deliberate padding, not `edges={['top']}`.
    //
    // `SafeAreaView` inside a form sheet reports the *window's* insets, not the
    // sheet's — the sheet is presented below the notch, so adding the window's
    // top edge here would pad by the status-bar/notch height the sheet already
    // clears, pushing the card down by roughly a header's worth of nothing.
    // `edges={['bottom']}` stays: the home-indicator strip is the window's and
    // the sheet does extend into it.
    //
    // It lives on the root rather than on the `Box` below so both states get
    // it. Before, the padding was on the `Box` and the composition-error
    // caption rendered above it with its own — so the two branches began at
    // different heights. That is the same shape as the scar `ChromeZone`
    // documents: a per-branch inset renders exactly like a correct screen until
    // you hit the other branch.
    //
    // `xl` (20) was settled by measuring the simulator, not by reasoning about
    // it. Decoding the screenshot down the sheet's centre line (iPhone 17 Pro,
    // @3x) puts the sheet's top edge at 62.0pt, the grabber at 67.0–72.0pt (5pt
    // tall, inset 5pt), and the card's top edge at 82.0pt — so this padding
    // arrives intact at exactly 20pt and leaves 10pt of clearance under the
    // grabber. That measurement is also what rules `edges={['top']}` out
    // numerically rather than by argument: the window's top inset here is the
    // same ~62pt the sheet is already presented at, so consuming that edge
    // would have put the card near 124pt — three times the inset, all of it
    // dead space. `md` (12), what the `Box` used to carry, leaves only 2pt
    // under the grabber.
    <Screen edges={['bottom']} style={{ paddingTop: theme.space.xl }}>
      {compositionError ? (
        <Text
          variant="caption"
          color="txWarning"
          style={{
            paddingHorizontal: theme.space.lg,
            paddingBottom: theme.space.xs,
          }}>
          {`Couldn't load operators — ${compositionError}`}
        </Text>
      ) : null}

      <Box px="lg">
        {/* overflow hidden so the ListRow surfaces inside respect the card's corners */}
        <Card p="none" radius="lg" style={{ overflow: 'hidden' }}>
          <Pressable
            testID="operator-row"
            accessibilityRole="button"
            accessibilityLabel={`Operator, ${selectionLabel}`}
            onPress={() => setExpanded((e) => !e)}>
            <Box px="lg" py="md">
              <Inline justify="space-between">
                <Text>Operator</Text>
                <Inline gap="xs">
                  <Text color="txSecondary">{selectionLabel}</Text>
                  <Icon name="chevronDown" size={14} color="icSecondary" />
                </Inline>
              </Inline>
            </Box>
          </Pressable>

          {expanded && state.status === 'loading' ? (
            <ActivityIndicator style={{ marginVertical: theme.space.lg }} />
          ) : null}

          {expanded && state.status !== 'loading'
            ? rows.map((item) => (
                <ListRow
                  key={item.key}
                  icon="inbox"
                  label={item.label}
                  note={item.note}
                  trailing={selection === item.value ? <Icon name="check" size={18} color="icAccent" /> : null}
                  onPress={() => {
                    setSelection(item.value);
                    setExpanded(false);
                  }}
                />
              ))
            : null}

          <Rule />

          <View
            testID="model-stub"
            accessible
            accessibilityState={{ disabled: true }}
            accessibilityLabel="Model, engine default"
            style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
            <Inline justify="space-between">
              <Text color="txDisabled">Model</Text>
              <Text color="txDisabled">engine default</Text>
            </Inline>
          </View>
        </Card>

        {createError ? (
          <Text variant="caption" color="txWarning" style={{ paddingTop: theme.space.sm }}>
            {`Couldn't create the instance — ${createError}`}
          </Text>
        ) : null}

        <Inline justify="flex-end" style={{ paddingTop: theme.space.lg }}>
          <Button label={creating ? 'Creating…' : 'Create'} onPress={onCreate} disabled={creating} />
        </Inline>
      </Box>
    </Screen>
  );
}
