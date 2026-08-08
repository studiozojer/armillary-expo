import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { Box, Button, Card, Icon, Inline, ListRow, Rule, Screen, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import type { Composition, ModelCatalog } from '@/lib/daemon/types';
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

  const loadModels = useCallback(
    (signal: AbortSignal) => new DaemonClient(host.daemonUrl).getModels(signal),
    [host.daemonUrl],
  );
  const { state: modelsState } = useLoader<ModelCatalog>(`${host.id}:${generation}:models`, loadModels, ready);

  // The catalog is decoration, exactly like the operator list above it: an
  // engine with no models.toml — or one too old to serve /models at all —
  // must still create instances. `null` then means "the engine's default
  // pilots", which is the honest thing to send and the honest thing to show.
  const catalog = modelsState.status === 'ok' ? modelsState.data : null;
  // `undefined` = the user has not chosen; `null` = the user explicitly
  // chose "engine default"; a string = an explicit model. The three are
  // genuinely different, which is why this is not a plain `string | null` —
  // a picker row now maps to `null` (see the synthetic row below), so `null`
  // can no longer double as "nothing chosen yet" the way it used to.
  const [model, setModel] = useState<string | null | undefined>(undefined);
  const [modelExpanded, setModelExpanded] = useState(false);

  // A later-arriving catalog can never clobber a choice already made: once
  // `model` is anything but `undefined` it wins outright, regardless of what
  // the catalog resolves to. No effect, no touched flag — this was a
  // `useEffect` + `modelTouched` pair before; a derived value does the same
  // job with one less piece of state and no ordering to get wrong.
  const effectiveModel = model !== undefined ? model : (catalog?.default ?? null);

  // The synthetic "engine default" row is always first — same idiom as the
  // always-present Dispatcher row above, same reason: with no catalog (no
  // models.toml, or an engine too old to serve /models) this is the only
  // row, not an empty accordion, and it is always a way to say "let the
  // engine decide" even when the catalog's own `default` is unusable.
  const modelRows: { id: string | null; label: string | null; usable: boolean }[] = [
    { id: null, label: 'engine default', usable: true },
    ...(catalog?.models ?? []),
  ];
  const modelLabel = modelRows.find((m) => m.id === effectiveModel)?.label ?? effectiveModel ?? 'engine default';

  const onCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const instance = await api.create(selection, effectiveModel);
      // Dismiss the sheet, then push — NOT a single `replace`.
      //
      // While the chat lived beside this sheet in the Instances stack, one
      // `replace` was right: it swapped the sheet for the chat, the sheet left
      // history as a side effect of being replaced, and back from the chat
      // landed on the list. The chat moved to the ROOT stack (2026-07-30) so
      // the tab bar leaves with the push — and that made this navigation cross
      // navigators.
      //
      // What `replace` does across navigators is not "swap the sheet". It
      // replaces the entry in the stack that owns the destination — the root
      // one — so the whole `(tabs)` subtree goes out of history with it and
      // `canGoBack()` is FALSE at the chat. Not a sheet stranded in history:
      // a chat with no way back to anything, which is how it presents on
      // device. Measured, not reasoned: `create-then-back.test.tsx` fails on
      // exactly that assertion if this reverts to a single `replace`.
      router.dismissTo('/');
      router.push(`/instance/${instance.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      setCreating(false);
    }
  }, [api, selection, effectiveModel, router]);

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

          <Pressable
            testID="model-row"
            accessibilityRole="button"
            accessibilityLabel={`Model, ${modelLabel}`}
            onPress={() => setModelExpanded((e) => !e)}>
            <Box px="lg" py="md">
              <Inline justify="space-between">
                <Text>Model</Text>
                <Inline gap="xs">
                  <Text color="txSecondary">{modelLabel}</Text>
                  <Icon name="chevronDown" size={14} color="icSecondary" />
                </Inline>
              </Inline>
            </Box>
          </Pressable>

          {modelExpanded
            ? modelRows.map((m) => (
                <ListRow
                  key={m.id ?? 'engine-default'}
                  icon="inbox"
                  label={m.label ?? m.id ?? 'engine default'}
                  // Named, not merely greyed: a row that is dim for an
                  // unexplained reason reads as a bug. The engine still
                  // ACCEPTS this model — it just cannot pilot it — so the
                  // row is disabled here rather than refused there. The
                  // synthetic "engine default" row (`m.id === null`) has no
                  // model to name, so it carries no note at all.
                  note={m.id === null ? undefined : m.usable ? m.id : `${m.id} — no key on this engine`}
                  disabled={!m.usable}
                  trailing={effectiveModel === m.id ? <Icon name="check" size={18} color="icAccent" /> : null}
                  onPress={() => {
                    setModel(m.id);
                    setModelExpanded(false);
                  }}
                />
              ))
            : null}
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
