import { Link, useRouter } from 'expo-router';
import { Pressable, RefreshControl, SectionList } from 'react-native';

import { useTheme } from '@/theme';
import type { Composition, Module, SyncReport, SyncRepo, SyncSkipReason } from '@/lib/daemon/types';

import { Box, Button, ListRow, ROW_ICON_LANE, Rule, SectionHeader, Text } from './ui';

type Section = { title: string; data: Module[] };

function sections(composition: Composition): Section[] {
  return [
    { title: 'OPERATORS', data: composition.operators },
    { title: 'COMMONS', data: composition.commons },
    { title: 'REPOS', data: composition.repos },
    // C-4 as UI: a section that composes nothing is omitted rather than shown
    // empty. A bare clone is a working host, so an empty workspace should read
    // as a workspace and not as a failure.
  ].filter((section) => section.data.length > 0);
}

/** Every skip/error reason the wire can carry, in words rather than enum
 *  spelling. `Record<SyncSkipReason, string>` on purpose: a new member of the
 *  union without a label here is a compile error, not a row reading
 *  `task-failed`. */
const SKIP_LABELS: Record<SyncSkipReason, string> = {
  dirty: 'dirty',
  diverged: 'diverged',
  detached: 'detached HEAD',
  timeout: 'timed out',
  'no-upstream': 'no upstream',
  'git-error': 'git error',
  'task-failed': 'failed',
};

/**
 * What a row says about itself. Named for what happened, not for the enum —
 * "no upstream" rather than "no-upstream", "+2" rather than "synced", because
 * the row is read at a glance and the count is the information.
 */
export function syncLabel(repo: SyncRepo): string {
  switch (repo.status) {
    case 'synced':
      return `+${repo.commits ?? 0}`;
    case 'behind':
      return `behind ${repo.commits ?? 0}`;
    case 'current':
      return 'current';
    case 'skipped':
      return repo.reason ? SKIP_LABELS[repo.reason] : 'skipped';
    case 'error':
      return repo.reason ? SKIP_LABELS[repo.reason] : 'error';
  }
}

/**
 * What the trailing slot actually shows. `fetch_error` pre-empts the verdict
 * on purpose: `verdict` is computed against whatever refs are on disk, and if
 * the fetch that was supposed to refresh them failed, a `current` read off
 * those stale refs isn't a status — it's the report being wrong with a
 * straight face. Saying the fetch failed beats showing a verdict computed
 * from data that was never touched.
 */
export function trailingLabel(repo: SyncRepo): string {
  return repo.fetch_error ? 'fetch failed' : syncLabel(repo);
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * The design's replacement for the rejected cross-host read (see the plan's
 * D-notes): a reader checks this against their own memory of when they were
 * last working, rather than trusting an aggregate "up to date" claim from a
 * machine they can't see. Relative within the last calendar day, absolute
 * beyond it. No `Intl` — the relative/absolute boundary has to be exact and
 * testable without depending on a locale the test runner may not carry.
 */
export function newestCommitLabel(iso: string, now: Date = new Date()): string {
  const commit = new Date(iso);
  const sameDay =
    commit.getFullYear() === now.getFullYear() &&
    commit.getMonth() === now.getMonth() &&
    commit.getDate() === now.getDate();
  const time = `${pad2(commit.getHours())}:${pad2(commit.getMinutes())}`;
  return sameDay
    ? `newest commit ${time} today`
    : `newest commit ${MONTHS[commit.getMonth()]} ${commit.getDate()}`;
}

/**
 * The row's second line: the module's own note until there is something
 * truer to say about the row. A fetch failure explains why the verdict can't
 * be trusted; a newest-commit timestamp is the actual answer to "is this
 * current". Absent a sync entry for this row at all, the manifest's own
 * `note` renders exactly as it did before this feature existed.
 */
export function rowNote(
  repo: SyncRepo | undefined,
  moduleNote: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!repo) return moduleNote;
  if (repo.fetch_error) return truncate(repo.fetch_error);
  if (repo.newest_commit) return newestCommitLabel(repo.newest_commit, now);
  return moduleNote;
}

/**
 * "3 of 24 could not fetch." A count derived straight from `sync.repos`,
 * independent of `sync.fetched` — `fetched` only ever meant "a sweep was
 * requested," never "it reached the network," so a report can be `fetched:
 * true` with every row's fetch having failed. Undefined when nothing failed,
 * so the header stays quiet on the common path.
 */
export function fetchFailureSummary(sync: SyncReport | undefined): string | undefined {
  if (!sync) return undefined;
  const failed = sync.repos.filter((r) => r.fetch_error).length;
  return failed > 0 ? `${failed} of ${sync.repos.length} could not fetch` : undefined;
}

function orphanLabel(repo: SyncRepo): string {
  const where = repo.path === '.' ? 'root' : repo.path;
  return `${repo.name} (${where}) — ${trailingLabel(repo)}`;
}

/**
 * A sync entry whose path matches no rendered module row. Today that's
 * always exactly the router root (`declared_modules` includes `{ path: "."
 * }` on purpose, and `/composition` never lists it because it isn't a
 * module) — but writing this as a general "orphan" rule rather than a
 * root-specific one means a future stray checkout surfaces here too, instead
 * of a sweep silently touching something the screen has no row for.
 */
export function describeOrphans(
  sync: SyncReport | undefined,
  composedPaths: ReadonlySet<string>,
): string | undefined {
  if (!sync) return undefined;
  const orphans = sync.repos.filter((r) => !composedPaths.has(r.path));
  return orphans.length > 0 ? `Also swept: ${orphans.map(orphanLabel).join(', ')}` : undefined;
}

export function ModuleList({
  composition,
  hostLabel,
  refreshing = false,
  onRefresh,
  sync,
  syncing = false,
  onSync,
  syncError,
}: {
  composition: Composition;
  hostLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Absent until `/sync` answers — the list renders without waiting on it. */
  sync?: SyncReport;
  syncing?: boolean;
  onSync?: () => void;
  /** Set after a failed sweep; cleared on the next attempt. The last true
   *  statuses stay on screen — this is only ever a line saying the tap did
   *  nothing, never a replacement for them. */
  syncError?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const data = sections(composition);
  const byPath = new Map((sync?.repos ?? []).map((r) => [r.path, r]));
  const composedPaths = new Set([
    ...composition.operators.map((m) => m.path),
    ...composition.commons.map((m) => m.path),
    ...composition.repos.map((m) => m.path),
  ]);
  const failureSummary = fetchFailureSummary(sync);
  const orphanLine = describeOrphans(sync, composedPaths);

  return (
    <SectionList
      sections={data}
      keyExtractor={(item) => item.path}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{
        paddingBottom: theme.space.xxxl,
      }}
      ListHeaderComponent={
        <Box px="lg" style={{ paddingTop: theme.space.lg }}>
          <Text variant="title">Loaded modules</Text>
          {/* Which armillary you are looking at, always visible. Two machines
              can both be serving a workspace, and only the host tells them apart.
              Wrapped in a Pressable rather than handing Link's `asChild` clone
              straight to the kit's Text: that Text only forwards the named
              props it declares, so an injected `onPress` lands on a component
              that drops it on the floor — the same silent-no-onPress shape
              Sprint 1 shipped once already, just with Text standing in for the
              View it happened to on. Pressable is a real host component and
              takes the clone correctly. */}
          <Link href="/settings" asChild>
            <Pressable hitSlop={8}>
              <Text variant="caption" color="txAccent" style={{ paddingTop: theme.space.xxs }}>
                {hostLabel} ›
              </Text>
            </Pressable>
          </Link>
          {sync && !sync.fetched ? (
            <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xxs }}>
              Statuses as of last sync
            </Text>
          ) : null}
          {failureSummary ? (
            <Text variant="caption" color="txError" style={{ paddingTop: theme.space.xxs }}>
              {/* `fetched: true` only ever meant "a sweep ran," never "it
                  reached the network" — this is the line that says so when
                  the tailnet was actually down. */}
              {failureSummary}
            </Text>
          ) : null}
          {sync?.enabled && onSync ? (
            <Box style={{ paddingTop: theme.space.sm }}>
              <Button
                testID="sync-action"
                label={syncing ? 'Syncing…' : 'Sync'}
                onPress={onSync}
                disabled={syncing}
              />
            </Box>
          ) : null}
          {syncError ? (
            <Text variant="caption" color="txError" style={{ paddingTop: theme.space.xxs }}>
              {syncError}
            </Text>
          ) : null}
        </Box>
      }
      ListEmptyComponent={
        <Box px="lg" style={{ paddingTop: theme.space.lg }}>
          <Text color="txTertiary">
            This workspace composes nothing. That is a working state, not an error.
          </Text>
        </Box>
      }
      renderSectionHeader={({ section }) => <SectionHeader>{section.title}</SectionHeader>}
      renderItem={({ item, index, section }) => {
        const status = byPath.get(item.path);
        return (
          <>
            <ListRow
              icon="folder"
              label={item.name}
              note={rowNote(status, item.note)}
              testID={`module-row-${item.path}`}
              trailing={
                status ? (
                  <Text
                    variant="caption"
                    color={
                      status.fetch_error
                        ? 'txError'
                        : status.status === 'skipped' || status.status === 'error'
                          ? 'txTertiary'
                          : 'txSecondary'
                    }>
                    {trailingLabel(status)}
                  </Text>
                ) : undefined
              }
              onPress={() => router.push(`/browse/${item.path}`)}
            />
            {index < section.data.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
          </>
        );
      }}
      ListFooterComponent={
        sync &&
        (sync.not_composed.length > 0 || sync.repos.some((r) => r.submodules) || orphanLine) ? (
          <Box px="lg" style={{ paddingTop: theme.space.lg }}>
            {sync.not_composed.length > 0 ? (
              <Text variant="caption" color="txTertiary">
                {/* The sweep's blind spot, made visible. Skipping an undeclared
                    checkout in silence reads identically to having nothing to
                    skip. */}
                Not composed, and not synced:{' '}
                {sync.not_composed.map((n) => n.path).join(', ')}
              </Text>
            ) : null}
            {sync.repos.some((r) => r.submodules) ? (
              <Text
                variant="caption"
                color="txTertiary"
                style={{ paddingTop: theme.space.xxs }}>
                {/* D5, said out loud: the pointer moved, the checkout did not.
                    A deliberate limit nobody can see reads as a bug. */}
                Submodules not updated:{' '}
                {sync.repos.filter((r) => r.submodules).map((r) => r.name).join(', ')}
              </Text>
            ) : null}
            {orphanLine ? (
              <Text
                variant="caption"
                color="txTertiary"
                style={{ paddingTop: theme.space.xxs }}>
                {/* declared_modules includes the router root on purpose, and
                    the engine has a test guarding that it is never silently
                    dropped. /composition doesn't list it (it isn't a
                    module), so without this line a Sync tap can fast-forward
                    the router repo itself with no way for the screen to say
                    so. */}
                {orphanLine}
              </Text>
            ) : null}
          </Box>
        ) : null
      }
    />
  );
}
