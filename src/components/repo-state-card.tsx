import { Pressable } from 'react-native';

import { useTheme, type ColorRole } from '@/theme';
import type { RepoState } from '@/lib/daemon/types';
import { stateCard, type CardTone, type DeviceGate, type GateState } from '@/lib/repo-state-card';

import { Box, Icon, Inline, Stack, Text } from './ui';

/** `CardTone` (excluding the `'none'` that means "no reason row at all") to
 *  the tint the reason line's ground carries. Figma's own bindings, read
 *  back off the file: `neutral` -> `bg/secondary` (a near-invisible 5% tint —
 *  "policy," the quietest tone), `warn` -> `bg/warning`, `error` ->
 *  `bg/error`. */
const TONE_BG: Record<Exclude<CardTone, 'none'>, ColorRole> = {
  neutral: 'bgSecondary',
  warn: 'bgWarning',
  error: 'bgError',
};

/**
 * The progress track's height. Not a `theme.space` value on purpose — 3px
 * lands between `xxs` (2) and `xs` (4) in that scale, and rounding it to
 * either would visibly thicken or thin the hairline Figma actually drew.
 * Same idiom as `CircleButton`'s `DIAMETER`: a one-off design metric that
 * does not belong in a shared scale gets its own named constant instead of
 * a bare literal at the call site.
 */
const PROGRESS_HEIGHT = 3;

/**
 * The repo page's centrepiece (Task 11; supersedes the plan's
 * `primaryAction`). Built from Figma `bbjHiHEBoR3xWWruoprPkH`, node 345:448,
 * "State Card" — a two-property, eleven-variant component set (`Action` ×
 * `Tone`). All layout/colour decisions below trace back to that node; see
 * the task report for the exact reads.
 *
 * This component renders `stateCard`'s output; it makes no decisions of its
 * own about what the card should say. `onAction` fires with the model's verb
 * — never called when `model.verb` is `null`, since the button is disabled
 * in every state that has no verb.
 */
export function RepoStateCard({
  state,
  gates,
  inFlight,
  onAction,
  testID = 'repo-state-card',
}: {
  state: RepoState;
  gates: { enabled: GateState; pushEnabled: GateState; commitEnabled: GateState; device: DeviceGate };
  inFlight?: 'fetch' | 'pull' | 'push';
  // `'commit'` is a real, callable verb as of Task 8 — the card itself never
  // POSTs it (it has no way to collect a message and must not invent one),
  // but it fires the SAME `onAction` every other verb does, and it is the
  // caller's job to route a `'commit'` tap to wherever a message can be
  // typed (`repo/[name].tsx`'s `onAction` sends it to the Changes tab).
  onAction?: (verb: 'fetch' | 'pull' | 'push' | 'commit') => void;
  testID?: string;
}) {
  const theme = useTheme();
  const model = stateCard(state, gates, inFlight);
  const busy = model.action === 'busy';
  const blocked = model.action === 'blocked';
  // Branch switching is deferred past v1 (David's ruling, 2026-08-05) — a
  // constant, not a computed condition, because there is no state in this
  // component that could ever turn it on. Named and read twice below (the
  // Pressable's `disabled` prop and its `accessibilityState`) rather than
  // written as two separate `true` literals — see the chevron's own comment.
  const branchPickerDisabled = true;
  const actionTextColor: ColorRole = blocked ? 'txDisabled' : 'txPrimary';
  const freshnessColor: ColorRole = blocked ? 'txDisabled' : 'txTertiary';
  // `busy` recolours the glyph itself to the accent (Figma's own read: the
  // action icon's fill switches from ink to `bg/solid/accent`-adjacent blue
  // only in the busy variants, nowhere else) — the icon is what says
  // "working," not a colour change on the text beside it, which stays full
  // ink exactly as it does when `ready`.
  const actionIconColor: ColorRole = busy ? 'icAccent' : blocked ? 'txDisabled' : 'icPrimary';

  return (
    <Box
      testID={testID}
      bg="bgSolidCard"
      radius="lg"
      border="thin"
      borderColor="bdCard"
      style={{ width: '100%', overflow: 'hidden' }}>
      <Inline style={{ width: '100%' }}>
        {/* Current branch. Text only — the whole cell is informational, never
            pressable. See the chevron below for the one interactive-looking
            element in it, and why it isn't. */}
        <Inline
          gap="xs"
          style={{
            flex: 1,
            paddingLeft: theme.space.sm,
            paddingRight: theme.space.lg,
            paddingVertical: theme.space.md,
            borderRightWidth: theme.border.thin,
            borderRightColor: theme.color.bdPrimary,
          }}>
          <Icon name="gitBranch" size={16} color="icPrimary" />
          <Stack style={{ flex: 1 }}>
            <Text variant="caption" color="txTertiary" numberOfLines={1}>
              Current branch
            </Text>
            {/* `branch` is `undefined` for two different reasons: a real
                detached HEAD, and `read_error` — where the engine sets
                `branch: None`/`position: Detached` as TYPE DEFAULTS before
                `status_v2` ever runs (see `types.ts`'s doc on
                `RepoState.read_error`). Reading the raw field here would
                assert a detached HEAD the engine never measured. Figma
                `372:748` draws an em dash for this state — not a branch
                name, not "(detached)", because neither claim is true when
                the repo could not be read at all. */}
            <Text numberOfLines={1}>
              {state.read_error ? '—' : (state.branch ?? '(detached)')}
            </Text>
          </Stack>
          {/*
           * STUBBED — David's ruling, 2026-08-05: branch switching is
           * deferred past v1. Wrapped in a real, permanently-disabled
           * `Pressable` — same idiom `CircleButton`'s search/more/filter
           * stubs use ("a stub with no handler is still announced disabled",
           * `ui-circle-button.test.tsx`) — rather than a bare `Icon`, because
           * the point is to be HONEST about the affordance: it exists, it is
           * not live yet, and a screen reader should hear "disabled," not
           * silence. Removing the control entirely (rather than disabling
           * it) was rejected for the same reason cited in the task: it would
           * reflow this row the day branch-picking lands, and would give the
           * control's absence no distinction from "not built yet" versus
           * "will never exist."
           */}
          <Pressable
            testID={`${testID}-branch-chevron`}
            // ONE source of truth, read twice below, rather than two literal
            // `true`s that happen to agree today. Two independent hardcodes
            // is exactly the shape review caught: a future edit could give
            // this control a real `onPress` (branch-picking landing) without
            // touching a second, easy-to-miss `accessibilityState` literal,
            // leaving it announced disabled while actually live. Deriving
            // both from `branchPickerDisabled` makes that drift
            // unrepresentable rather than merely unlikely.
            disabled={branchPickerDisabled}
            accessibilityRole="button"
            accessibilityLabel="Switch branch"
            accessibilityState={{ disabled: branchPickerDisabled }}
            hitSlop={8}>
            <Icon name="chevronDown" size={14} color="txDisabled" />
          </Pressable>
        </Inline>

        {/* The primary action. Disabled whenever the model offers no verb —
            every blocked and every busy state, by construction (`CardModel`
            guarantees `verb` is non-null only when `action === 'ready'`). */}
        <Pressable
          testID={`${testID}-action`}
          // `'commit'` is a real, ready verb as of Task 8 — it fires
          // `onAction` exactly like `'fetch'`/`'pull'`/`'push'` do. What it
          // fires is no longer this component's problem: the card cannot
          // collect a message (there is nowhere here to type one) and must
          // not invent one, so `repo/[name].tsx`'s `onAction` is the one that
          // decides what a `'commit'` tap actually does (routes to the
          // Changes tab rather than POSTing) — this Pressable just relays
          // the verb `stateCard` handed it, same as every other one.
          disabled={model.verb === null}
          onPress={
            model.verb ? () => onAction?.(model.verb as 'fetch' | 'pull' | 'push' | 'commit') : undefined
          }
          accessibilityRole="button"
          accessibilityLabel={model.sublabel ? `${model.label}. ${model.sublabel}` : model.label}
          accessibilityState={{ disabled: model.verb === null, busy }}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.xs,
            paddingLeft: theme.space.sm,
            paddingRight: theme.space.lg,
            paddingVertical: theme.space.md,
          }}>
          <Icon testID={`${testID}-action-icon`} name={model.icon} size={16} color={actionIconColor} />
          <Stack style={{ flex: 1 }}>
            <Text color={actionTextColor} numberOfLines={1}>
              {model.label}
            </Text>
            <Text variant="caption" color={freshnessColor} numberOfLines={1}>
              {model.sublabel}
            </Text>
          </Stack>
        </Pressable>
      </Inline>

      {/* The reason line. Absent for `tone === 'none'` — there is deliberately
          no "blocked, tone none" variant in Figma either: a blocked action
          that does not say what unblocks it is the defect this redesign
          exists to end, so there is nothing to render in that combination in
          the first place. The text itself stays plain ink in every tone —
          only the ground behind it tints — matching every sampled variant in
          the source file. */}
      {model.tone !== 'none' ? (
        <Box
          testID={`${testID}-reason`}
          px="md"
          py="sm"
          bg={TONE_BG[model.tone]}
          style={{ width: '100%' }}>
          <Inline gap="sm" align="flex-start">
            <Text variant="whyteXs">↳</Text>
            {/* Only this line wraps (Branch, Verb and Freshness all truncate
                at one line, per the Figma node's own component description) —
                `flex: 1` with no `numberOfLines` is what lets it. */}
            <Text variant="whyteXs" style={{ flex: 1 }}>
              {model.reason}
            </Text>
          </Inline>
        </Box>
      ) : null}

      {/* The progress track. `busy` only — no percentage exists on the wire
          (no verb reports fractional progress), so this is a fixed,
          non-animated indicator of "something is running," not a measured
          fill. Animating it is left for whoever wires this to a real
          in-flight request; nothing here depends on that landing. */}
      {busy ? (
        <Box
          testID={`${testID}-progress`}
          bg="bgSecondary"
          style={{ height: PROGRESS_HEIGHT, width: '100%' }}>
          <Box bg="txAccent" style={{ height: PROGRESS_HEIGHT, width: '38%' }} />
        </Box>
      ) : null}
    </Box>
  );
}
