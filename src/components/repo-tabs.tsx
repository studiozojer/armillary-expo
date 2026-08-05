import { useState } from 'react';
import { Pressable } from 'react-native';

import type { ChangedFile, Commit } from '@/lib/daemon/types';
import { useTheme, type ColorRole } from '@/theme';

import { Box, Icon, Inline, Stack, Text, type IconName } from './ui';

type Tab = 'changes' | 'history';

/** The underline's thickness. Not a `theme.space` value — same reasoning as
 *  `repo-state-card.tsx`'s `PROGRESS_HEIGHT`: Figma's 2px lands between the
 *  scale's `xxs` (2, coincidentally equal here) and the next step down would
 *  either vanish or thicken visibly, so it gets its own named constant. */
const INDICATOR_HEIGHT = 2;

/** The trailing marker's fixed square footprint (Figma `IconButton`, both the
 *  History unpushed marker and every Changes row glyph). */
const MARKER_SIZE = 28;

/**
 * `ChangedFile.change` → glyph and tint. A `Record<string, …>` rather than a
 * closed union keyed type: the wire type is a plain `string` (see
 * `icon.tsx`'s doc comment on the five icon names this reads) because the
 * engine's own `ChangedFile.change` is `&'static str`, not an enum — a future
 * sixth bucket is representable on the wire before it is representable here.
 * `changeGlyph` below falls back to `square`/`icSecondary` for anything not
 * in this table, so an unrecognised kind renders as "some kind of change"
 * rather than crashing on a missing key.
 *
 * Tint: `txWarning`/`txSuccess`/`txError` are used for the icon's own colour
 * — not the marker's background — because the generated daoUI token set
 * (`tokens.gen.ts`, `ROLE_COUNT = 37`) publishes `bg/warning` and `bg/error`
 * but no `bg/success` at all. Figma's sampled render tints the WHOLE 28px
 * marker per kind (a green box for `added`, a red one for `deleted`); doing
 * that faithfully would need a background role this token set does not
 * carry. Tinting the glyph instead of the box is the closest honest
 * expression available from what daoUI actually publishes — recorded here
 * rather than silently drawn as if it were the same thing.
 */
const CHANGE_GLYPH: Record<string, { icon: IconName; color: ColorRole }> = {
  modified: { icon: 'squareDot', color: 'txWarning' },
  added: { icon: 'squarePlus', color: 'txSuccess' },
  deleted: { icon: 'squareMinus', color: 'txError' },
  renamed: { icon: 'squareRenamed', color: 'icSecondary' },
  untracked: { icon: 'square', color: 'icSecondary' },
};

function changeGlyph(change: string): { icon: IconName; color: ColorRole } {
  return CHANGE_GLYPH[change] ?? { icon: 'square', color: 'icSecondary' };
}

/**
 * A commit's age in the History row's author line ("2 min ago", "yesterday",
 * Figma `342:5002`'s "history list"). Deliberately NOT `repo-label.ts`'s
 * exported `relative()`: that function's whole job is FRESHNESS ("fetched
 * 14:22 today" / "fetched Jul 29" / "never fetched") for the State Card's
 * sublabel and the list row's fallback reading, and every one of its strings
 * carries the word "fetched" — wrong on a commit, which was never fetched,
 * it was made. Renaming or parameterising that word onto a second caller
 * would couple two concepts (staleness-of-a-read vs. age-of-a-commit) that
 * only look alike because both happen to be relative-time strings.
 *
 * No `Intl`, for the same reason `relative()` avoids it: the day-boundary
 * arithmetic below has to be exact and independent of the test runner's
 * locale, not merely usually right.
 */
export function commitAge(iso: string, now: Date): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  // No absolute-date fallback beyond a week: no Figma sample runs that far
  // (the oldest sampled row is "2 days ago"), and every existing test fixes
  // `now` close enough to its commits that this branch is the honest answer
  // rather than a guess at where an unrequested cutoff belongs.
  return `${days} days ago`;
}

function TabButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ flex: 1, alignItems: 'center', paddingTop: theme.space.xxs }}>
      <Stack gap="sm" align="center" style={{ width: '100%' }}>
        <Text variant="whyteXs" color={active ? 'txPrimary' : 'txTertiary'}>
          {label}
        </Text>
        <Box
          testID={`${testID}-indicator`}
          bg={active ? 'txPrimary' : 'bdPrimary'}
          style={{ height: INDICATOR_HEIGHT, width: '100%' }}
        />
      </Stack>
    </Pressable>
  );
}

/** The 28px tinted glyph box every row (History's unpushed marker, every
 *  Changes row) trails with. A status indicator, not a control — there is no
 *  verb behind it (force-pushing an unpushed commit and staging/unstaging a
 *  change are both out of v1, D6), so it is a plain `Box`, never a
 *  `Pressable`: giving it a press target would announce an affordance this
 *  build does not honor, the exact defect the Changes tab's read-only rule
 *  exists to end. */
function Marker({ icon, color, testID }: { icon: IconName; color: ColorRole; testID?: string }) {
  return (
    <Box
      testID={testID}
      bg="bgPrimary"
      radius="md"
      style={{
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={icon} size={16} color={color} />
    </Box>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <Box
      style={{
        height: theme.border.thin,
        width: '100%',
        backgroundColor: theme.color.bdPrimary,
      }}
    />
  );
}

function HistoryRow({
  commit,
  now,
  last,
  testID,
}: {
  commit: Commit;
  now: Date;
  last: boolean;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Stack testID={testID} style={{ width: '100%' }}>
      <Inline gap="md" style={{ paddingVertical: theme.space.md }}>
        <Stack gap="xxs" flex={1}>
          <Text numberOfLines={1}>{commit.subject}</Text>
          <Inline gap="xs">
            <Box
              bg="icTertiary"
              radius="full"
              style={{ width: theme.space.xxs, height: theme.space.xxs }}
            />
            <Text variant="mono" color="txTertiary" numberOfLines={1}>
              {commit.author} · {commitAge(commit.date, now)}
            </Text>
          </Inline>
        </Stack>
        {/* `Commit.unpushed` gates this unconditionally — a commit already on
            the upstream must never carry the marker meant for one that
            isn't. */}
        {commit.unpushed ? (
          <Marker icon="arrowUp" color="icPrimary" testID={`${testID}-unpushed`} />
        ) : null}
      </Inline>
      {last ? null : <Divider />}
    </Stack>
  );
}

function ChangeRow({ file, last, testID }: { file: ChangedFile; last: boolean; testID: string }) {
  const theme = useTheme();
  const glyph = changeGlyph(file.change);
  return (
    <Stack testID={testID} style={{ width: '100%' }}>
      <Inline gap="md" style={{ paddingVertical: theme.space.sm }}>
        <Text variant="whyteXs" numberOfLines={1} style={{ flex: 1 }}>
          {file.path}
        </Text>
        <Marker icon={glyph.icon} color={glyph.color} testID={`${testID}-marker`} />
      </Inline>
      {last ? null : <Divider />}
    </Stack>
  );
}

function EmptyState({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Box style={{ paddingVertical: theme.space.xxl, alignItems: 'center' }}>
      <Text variant="whyteXs" color="txTertiary" align="center">
        {text}
      </Text>
    </Box>
  );
}

/**
 * The repo page's Changes/History section (Task 12; Figma `342:5002` and
 * siblings). Owns its own tab state — the route hands it the two lists it
 * already loaded and nothing about which tab is showing.
 *
 * **Defaults to History, not Changes.** History is the tab that is populated
 * on a clean repo (the common case — nothing to commit, plenty to have
 * committed), so defaulting there means a clean repo's page opens on
 * content. Defaulting to Changes would open a clean repo on "No uncommitted
 * changes." — an empty tab in the very state (a healthy, clean repo) this
 * page should read as least alarming.
 */
export function RepoTabs({
  commits,
  changes,
  now = new Date(),
  testID = 'repo-tabs',
}: {
  commits: Commit[];
  changes: ChangedFile[];
  /** Clock injection for `commitAge` — same idiom `rowLabel`/`stateCard` use
   *  so a test can pin "now" without depending on wall-clock time. */
  now?: Date;
  testID?: string;
}) {
  const [active, setActive] = useState<Tab>('history');

  return (
    <Stack style={{ width: '100%' }} testID={testID}>
      <Inline style={{ width: '100%' }}>
        <TabButton
          testID={`${testID}-changes-tab`}
          label={changes.length > 0 ? `Changes (${changes.length})` : 'Changes'}
          active={active === 'changes'}
          onPress={() => setActive('changes')}
        />
        <TabButton
          testID={`${testID}-history-tab`}
          label="History"
          active={active === 'history'}
          onPress={() => setActive('history')}
        />
      </Inline>

      {active === 'changes' ? (
        changes.length === 0 ? (
          <EmptyState text="No uncommitted changes." />
        ) : (
          changes.map((file, i) => (
            <ChangeRow
              key={file.path}
              file={file}
              last={i === changes.length - 1}
              testID={`${testID}-change-${i}`}
            />
          ))
        )
      ) : commits.length === 0 ? (
        <EmptyState text="No commits yet." />
      ) : (
        commits.map((commit, i) => (
          <HistoryRow
            key={commit.sha}
            commit={commit}
            now={now}
            last={i === commits.length - 1}
            testID={`${testID}-history-${i}`}
          />
        ))
      )}
    </Stack>
  );
}
