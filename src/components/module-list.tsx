import { Link, useRouter } from 'expo-router';
import { Pressable, RefreshControl, SectionList } from 'react-native';

import { useTheme, type ColorRole } from '@/theme';
import type { Composition, Module, RepoState } from '@/lib/daemon/types';
import { rowLabel, type Tone } from '@/lib/repo-label';

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

/** `Tone` → the kit's color role. `warn` and `error` both draw attention;
 *  `muted` is the resting reading nobody needs to act on. */
const TONE_COLOR: Record<Tone, ColorRole> = {
  error: 'txError',
  warn: 'txWarning',
  muted: 'txTertiary',
};

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * "3 of 24 could not fetch." A count derived from whichever `RepoState[]`
 * the `repos` prop currently holds — which is deliberate, not an
 * approximation of something better. Per `armillary-core`'s `read_one`,
 * `action_error` is populated ONLY by the write verbs (`fetch`/`pull`/
 * `push`, and the `fetch`-all sweep); `GET /repos` always answers with
 * `action_error: None` on every repo, because a read performs no action to
 * fail. So this is undefined immediately after every load — cold start,
 * host switch, pull-to-refresh — and only reads non-zero on the one render
 * right after `POST /repos/fetch` returns and its response is folded into
 * `repos`. That is exactly the shape wanted: a stale failure count
 * surviving past the next load, silently implying the CURRENT state is
 * still bad, would be the same "confidently wrong" failure this whole
 * feature exists to end. There is no separate piece of state mirroring
 * this — a second copy is a second place for it to drift from `repos`,
 * which is the bug shape being avoided, not merely relocated.
 */
export function fetchFailureSummary(repos: RepoState[] | undefined): string | undefined {
  if (!repos || repos.length === 0) return undefined;
  const failed = repos.filter((r) => r.action_error).length;
  return failed > 0 ? `${failed} of ${repos.length} could not fetch` : undefined;
}

export function ModuleList({
  composition,
  hostLabel,
  refreshing = false,
  onRefresh,
  repos,
  reposEnabled = false,
  fetching = false,
  onFetchAll,
  fetchError,
  notComposed,
}: {
  composition: Composition;
  hostLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Absent until `GET /repos` answers — the list renders without waiting on it. */
  repos?: RepoState[];
  /** The `sync` grant (fetch). Gates the Fetch action, nothing else on this
   *  screen — `push_enabled` belongs to the repo page. */
  reposEnabled?: boolean;
  fetching?: boolean;
  /** Present only when the host has granted the gate; see `reposEnabled`. */
  onFetchAll?: () => void;
  /** Set after a failed sweep; cleared on the next attempt. The last true
   *  statuses stay on screen — this is only ever a line saying the tap did
   *  nothing, never a replacement for them. */
  fetchError?: string;
  /** Repo-relative paths of git checkouts on disk that no manifest declares
   *  (`ReposResponse.not_composed`). Plain strings on the wire — the engine
   *  serializes `Vec<String>`, not a wrapper struct. */
  notComposed?: string[];
}) {
  const theme = useTheme();
  const router = useRouter();
  const data = sections(composition);
  // Repos are addressed by manifest NAME (D3), never by path — the same key
  // `GET /repos/{name}` resolves against.
  const byName = new Map((repos ?? []).map((r) => [r.name, r]));
  const composedNames = new Set([
    ...composition.operators.map((m) => m.name),
    ...composition.commons.map((m) => m.name),
    ...composition.repos.map((m) => m.name),
  ]);
  // A repo the engine swept but that has no rendered module row — today
  // that's always the router root itself (`declared_modules` puts it first,
  // named "armillary", and `/composition` never lists it because it isn't a
  // module). Written as a general "orphan" rule rather than a root-specific
  // one so a future stray checkout surfaces here too.
  const orphans = (repos ?? []).filter((r) => !composedNames.has(r.name));
  const submoduleRepos = (repos ?? []).filter((r) => r.submodules);
  const failureSummary = fetchFailureSummary(repos);

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
          {failureSummary ? (
            <Text variant="caption" color="txError" style={{ paddingTop: theme.space.xxs }}>
              {/* Only ever populated right after a sweep — see the doc on
                  `fetchFailureSummary` for why a cold load can't carry this. */}
              {failureSummary}
            </Text>
          ) : null}
          {reposEnabled && onFetchAll ? (
            <Box style={{ paddingTop: theme.space.sm }}>
              <Button
                testID="fetch-all-action"
                label={fetching ? 'Fetching…' : 'Fetch all'}
                onPress={onFetchAll}
                disabled={fetching}
              />
            </Box>
          ) : null}
          {fetchError ? (
            <Text variant="caption" color="txError" style={{ paddingTop: theme.space.xxs }}>
              {fetchError}
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
        const state = byName.get(item.name);
        const label = state ? rowLabel(state) : undefined;
        return (
          <>
            <ListRow
              icon="folder"
              label={item.name}
              // `newest_commit` no longer reaches the list route (D5) —
              // there is nothing truer than the manifest's own note to show
              // here any more, so unlike the retired sync-report design this
              // is no longer a derived value.
              note={item.note}
              testID={`module-row-${item.path}`}
              trailing={
                label ? (
                  <Text variant="caption" color={TONE_COLOR[label.tone]}>
                    {label.text}
                  </Text>
                ) : undefined
              }
              // The engine addresses a repo by manifest name, never by path
              // (D3) — this route does not exist yet (that's the next task),
              // but the name is what it will resolve against.
              onPress={() => router.push(`/repo/${encodeURIComponent(item.name)}`)}
            />
            {index < section.data.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
          </>
        );
      }}
      ListFooterComponent={
        (notComposed && notComposed.length > 0) || submoduleRepos.length > 0 || orphans.length > 0 ? (
          <Box px="lg" style={{ paddingTop: theme.space.lg }}>
            {notComposed && notComposed.length > 0 ? (
              <Text variant="caption" color="txTertiary">
                {/* The sweep's blind spot, made visible. Skipping an undeclared
                    checkout in silence reads identically to having nothing to
                    skip. Plain strings, not `{path}` objects — see the field
                    doc above. */}
                Not composed, and not synced: {notComposed.join(', ')}
              </Text>
            ) : null}
            {submoduleRepos.length > 0 ? (
              <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xxs }}>
                {/* D5, said out loud: the pointer moved, the checkout did not.
                    A deliberate limit nobody can see reads as a bug. */}
                Submodules not updated: {submoduleRepos.map((r) => r.name).join(', ')}
              </Text>
            ) : null}
            {orphans.length > 0 ? (
              <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xxs }}>
                {/* declared_modules includes the router root on purpose, and
                    the engine has a test guarding that it is never silently
                    dropped. /composition doesn't list it (it isn't a
                    module), so without this line a Fetch tap can touch the
                    router repo itself with no way for the screen to say so. */}
                Also swept:{' '}
                {orphans
                  .map((r) => {
                    const where = r.path === '.' ? 'root' : r.path;
                    return `${r.name} (${where}) — ${truncate(rowLabel(r).text)}`;
                  })
                  .join(', ')}
              </Text>
            ) : null}
          </Box>
        ) : null
      }
    />
  );
}
