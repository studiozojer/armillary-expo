import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { RepoStateCard } from '@/components/repo-state-card';
import { RepoTabs } from '@/components/repo-tabs';
import { Box, Screen, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import { getCachedRepos } from '@/lib/daemon/repos-cache';
import { DaemonError, type ChangedFile, type Commit, type RepoState } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useTheme } from '@/theme';

type Verb = 'fetch' | 'pull' | 'push';

type Loaded = {
  repo: RepoState;
  commits: Commit[];
  changes: ChangedFile[];
  gates: { enabled: boolean; pushEnabled: boolean };
};

type ScreenState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ok'; data: Loaded };

/**
 * The per-repo git page (Task 12; Figma `342:5002` and siblings). Assembles
 * the pieces Tasks 9-11 built: the typed client, the State Card, and (this
 * task) the Changes/History tabs.
 *
 * **Where the gates come from.** `RepoStateCard.gates` (the `sync`/`push`
 * grants) is `ReposResponse.enabled`/`push_enabled` — a field of the SAME
 * `GET /repos` response `composition.tsx` already reads for its own
 * `reposEnabled`. This route calls `getCachedRepos()` itself rather than
 * receiving the grant as a navigation param: `router.push` in
 * `module-list.tsx` carries only the repo name (a string in the URL), and a
 * grant is host-level state, not something this specific navigation
 * produced — threading it through params would make the repo page's
 * authority depend on which screen happened to push it here, which breaks
 * the moment this page is reached any other way (a deep link, a future
 * board reference). Reading it directly here is the same choice
 * `composition.tsx` already made for the identical field, so there is
 * exactly one place in the app that decides what `GET /repos` means — not a
 * second one that copies it into a route param.
 *
 * **Why `getCachedRepos`, not `client.getRepos` directly.** `GET /repos`
 * runs one `git status` fork per composed repo on the engine (~24 here) —
 * this page only ever needs two booleans off it. Calling it plain would pay
 * the full sweep on every visit to every repo page, which is exactly the
 * "N forks for one repo's read" cost this whole feature exists to avoid.
 * `repos-cache.ts` shares a short-TTL, host-scoped cache with
 * `composition.tsx`, so a repo page reached shortly after the composition
 * screen loaded (the common path — you tap a row) pays nothing extra, and
 * a cold visit pays the sweep once, not once per repo page opened after it.
 */
export default function RepoScreen() {
  const theme = useTheme();
  const { name: rawName } = useLocalSearchParams<{ name: string }>();
  const name = rawName ?? '';
  const { host, generation, ready } = useHost();

  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const [inFlight, setInFlight] = useState<Verb | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  // Bumped on every load this screen starts. Same reasoning as
  // `composition.tsx`'s `reposEpoch`: an aborted request can still resolve
  // after a NEWER one already rendered, and abort alone does not stop that
  // write — only comparing against the current epoch does. `onAction` below
  // reads this WITHOUT incrementing it (mirroring `composition.tsx`'s
  // `fetchAll`, which is an action, not a load): a host switch mid-action is
  // what should invalidate the action's own write, and that switch is what
  // increments the epoch, via the load effect below.
  const epoch = useRef(0);

  const load = useCallback(
    async (signal: AbortSignal): Promise<Loaded> => {
      const client = new DaemonClient(host.daemonUrl);
      const [repo, repos] = await Promise.all([
        client.getRepo(name, signal),
        getCachedRepos(client, host.id, generation, { signal }),
      ]);
      const gates = { enabled: repos.enabled, pushEnabled: repos.push_enabled };
      // `read_error` is a 200-with-a-field, not a thrown `DaemonError` (see
      // `types.ts`'s doc on `RepoState.read_error`), so `repo` above always
      // resolves for a name the manifest knows. An unreadable repo has
      // nothing for `/log` or `/changes` to answer meaningfully — both would
      // most likely fail on the SAME repository the first call already
      // reported as unreadable — so this skips them rather than firing two
      // more requests whose only likely outcome is a second error to
      // reconcile with the first. `commits`/`changes` stay empty and unread
      // by the render path below (Figma `372:748`: no tabs at all when
      // `read_error` is set).
      if (repo.read_error) return { repo, commits: [], changes: [], gates };
      const [commits, changes] = await Promise.all([
        client.getLog(name, undefined, signal),
        client.getChanges(name, signal),
      ]);
      return { repo, commits, changes, gates };
    },
    [host.daemonUrl, host.id, generation, name],
  );

  useEffect(() => {
    if (!ready || !name) return;
    const controller = new AbortController();
    const mine = ++epoch.current;
    setState({ status: 'loading' });
    load(controller.signal)
      .then((data) => {
        if (epoch.current === mine) setState({ status: 'ok', data });
      })
      .catch((error) => {
        if (epoch.current === mine && !controller.signal.aborted) {
          setState({ status: 'error', error });
        }
      });
    return () => controller.abort();
  }, [host.daemonUrl, generation, ready, name, load]);

  const onAction = useCallback(
    async (verb: Verb) => {
      const mine = epoch.current;
      setInFlight(verb);
      setActionError(undefined);
      try {
        const client = new DaemonClient(host.daemonUrl);
        // Every verb returns the repo's OWN new state (`client.ts`'s doc on
        // the mutation methods) — folded straight in below, never re-read.
        // A second `getRepo` here would be a second source of truth for the
        // exact fact this response already carries.
        const updated =
          verb === 'fetch'
            ? await client.fetchRepo(name)
            : verb === 'pull'
              ? await client.pullRepo(name)
              : await client.pushRepo(name);
        if (epoch.current !== mine) return;
        setState((prev) =>
          prev.status === 'ok' ? { status: 'ok', data: { ...prev.data, repo: updated } } : prev,
        );
      } catch (error) {
        if (epoch.current !== mine) return;
        setActionError(
          error instanceof DaemonError
            ? error.status === 403
              ? 'This host has not granted that action.'
              : error.message || 'The request failed.'
            : 'The request failed.',
        );
      } finally {
        if (epoch.current === mine) setInFlight(undefined);
      }
    },
    [host.daemonUrl, name],
  );

  return (
    <Screen edges={[]}>
      {/* The route param IS the manifest name (D3) and `RepoState.name`
          agree with it once loaded, so the title is correct from the first
          frame rather than waiting on the load to resolve. */}
      <Stack.Screen options={{ title: name }} />

      {state.status === 'loading' ? (
        <Box style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </Box>
      ) : state.status === 'error' ? (
        <Box p="lg">
          <Text variant="heading">Can&apos;t reach the engine</Text>
          <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.sm }}>
            {state.error instanceof Error ? state.error.message : String(state.error)}
          </Text>
        </Box>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.space.lg }}>
          <RepoStateCard
            state={state.data.repo}
            gates={state.data.gates}
            inFlight={inFlight}
            onAction={onAction}
          />
          {actionError ? (
            <Text variant="caption" color="txError" style={{ paddingTop: theme.space.xs }}>
              {actionError}
            </Text>
          ) : null}

          {/* Figma `372:748`: an unreadable repo renders the header and the
              State Card and NOTHING ELSE — no tabs, no lists, no empty copy.
              A repo git cannot read has no branch to name and no history to
              show, so a Changes/History switcher beside the error would
              offer two doors onto data that does not exist, implying the
              repo is merely quiet rather than unreadable. */}
          {state.data.repo.read_error ? null : (
            <Box style={{ paddingTop: theme.space.lg }}>
              <RepoTabs commits={state.data.commits} changes={state.data.changes} />
            </Box>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
