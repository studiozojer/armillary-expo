import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';

import { RepoStateCard } from '@/components/repo-state-card';
import { RepoTabs } from '@/components/repo-tabs';
import { Box, Screen, Text } from '@/components/ui';
import { DaemonClient } from '@/lib/daemon/client';
import { getCachedRepos, invalidateReposCache } from '@/lib/daemon/repos-cache';
import { type GateState } from '@/lib/repo-state-card';
import { DaemonError, type ChangedFile, type Commit, type ReposResponse, type RepoState } from '@/lib/daemon/types';
import { useHost } from '@/lib/host-context';
import { useTheme } from '@/theme';

/** The manifest section a repo lives under — the first path segment
 *  (`operators/tycho` -> `operators`). */
function sectionOf(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? path : path.slice(0, idx);
}

/**
 * `repos` is `undefined` exactly when `GET /repos` FAILED (see `load`
 * below's `.catch(() => undefined)`) — a fact distinct from the host having
 * REFUSED the grant, which is what `repos.enabled`/`repos.push_enabled ===
 * false` actually means. Collapsing the two (N1 of the whole-branch
 * re-review) made a failed read assert "this host has not granted..." — a
 * specific remedy for a refusal nobody actually read. `granted`/`refused`
 * mirror the wire booleans; `unknown` is the read-failed case, with its own
 * reason in `repo-state-card.ts`.
 */
function gateState(repos: ReposResponse | undefined, granted: boolean | undefined): GateState {
  if (repos === undefined) return 'unknown';
  return granted ? 'granted' : 'refused';
}

type Verb = 'fetch' | 'pull' | 'push';

type Loaded = {
  repo: RepoState;
  commits: Commit[];
  changes: ChangedFile[];
  gates: { enabled: GateState; pushEnabled: GateState };
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
  const [refreshing, setRefreshing] = useState(false);

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
    async (signal: AbortSignal, force = false): Promise<Loaded> => {
      const client = new DaemonClient(host.daemonUrl);
      // `getRepo` and `getCachedRepos` are two INDEPENDENT reads, joined only
      // by this `Promise.all` — and `Promise.all` rejects the instant either
      // one does. Before this fix, a `GET /repos` failure (the sweep this
      // page never even needs beyond two booleans) sank a page that had
      // already reached the engine successfully for `getRepo` and was about
      // to for `/log` and `/changes`. `.catch(() => undefined)` below turns
      // that failure into "no grant available" rather than "no repo page at
      // all" — fail CLOSED (every verb reads as not-granted), which matches
      // the engine's own reading of an absent/malformed `GET /repos`
      // (`composition.tsx`'s doc: "an older engine... simply leaves this
      // undefined").
      const [repo, repos] = await Promise.all([
        client.getRepo(name, signal),
        getCachedRepos(client, host.id, generation, { signal, force }).catch(() => undefined),
      ]);
      const gates = { enabled: gateState(repos, repos?.enabled), pushEnabled: gateState(repos, repos?.push_enabled) };
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

  // Pull-to-refresh. Two independent things need it: (1) it is the only way
  // off a stale `action_error` (rule 3 sets `verb: null` on purpose — someone
  // who just watched a push fail should not see "ready to push" — but that is
  // "blocked because the last attempt failed," not "blocked because HEAD is
  // detached," and only the first obviously wants a retry with nothing else
  // on screen offering one); (2) it is IMPORTANT-1's way out of the error
  // state, which otherwise has none. `force: true` bypasses the gates cache
  // deliberately, the same reasoning `composition.tsx`'s own pull-to-refresh
  // gives for `loadRepos(undefined, true)` — a pull IS the user asking for a
  // fresh read.
  const handleRefresh = useCallback(() => {
    const mine = ++epoch.current;
    setRefreshing(true);
    load(new AbortController().signal, true)
      .then((data) => {
        if (epoch.current === mine) {
          setState({ status: 'ok', data });
          setActionError(undefined);
        }
      })
      .catch((error) => {
        if (epoch.current === mine) setState({ status: 'error', error });
      })
      .finally(() => {
        if (epoch.current === mine) setRefreshing(false);
      });
  }, [load]);

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
        if (error instanceof DaemonError && error.status === 403) {
          // A 403 here is PROOF the cached grant was wrong — not a reason to
          // keep offering a button the engine just refused. Clear the cache
          // key and re-read the gates, so the card reflects reality on the
          // very next render rather than for up to `TTL_MS` more.
          invalidateReposCache(host.id, generation);
          getCachedRepos(new DaemonClient(host.daemonUrl), host.id, generation, { force: true })
            .then((repos) => {
              if (epoch.current !== mine) return;
              setState((prev) =>
                prev.status === 'ok'
                  ? {
                      status: 'ok',
                      data: {
                        ...prev.data,
                        gates: {
                          enabled: gateState(repos, repos.enabled),
                          pushEnabled: gateState(repos, repos.push_enabled),
                        },
                      },
                    }
                  : prev,
              );
            })
            .catch(() => undefined);
        }
        setActionError(
          error instanceof DaemonError
            ? error.status === 403
              ? 'This host has not granted that action.'
              : error.message || 'The request failed.'
            : 'The request failed.',
        );
      } finally {
        // UNCONDITIONAL, unlike the writes above — the epoch guard's job is
        // "don't write a stale repo into a screen that has moved on," never
        // "don't stop the spinner." An epoch bump mid-action (a pull-to-
        // refresh, a host switch) used to leave `inFlight` set forever,
        // because this line matched the writes' own guard: the request had
        // already returned, but the card kept claiming one was running —
        // busy, disabled, progress bar and all — until the screen unmounted.
        // Stopping the spinner is correct regardless of which epoch is
        // current, so it is the one write in this function that isn't
        // gated on `mine`.
        setInFlight(undefined);
      }
    },
    [host.daemonUrl, host.id, generation, name],
  );

  // "tycho" over "stjerneborg / operators" — all six Figma frames for this
  // page draw a two-line header, and `module-list.tsx` already states why a
  // host label belongs on screen in its own words: "Two machines can both be
  // serving a workspace, and only the host tells them apart." That argument
  // is strictly stronger here than on the composition list — this is the
  // page that pushes under the host user's credential, with no undo. The
  // section (the manifest directory the repo lives under) needs `repo.path`,
  // which is only known once the load resolves; before that, the host alone
  // still answers "which machine am I about to act on."
  const subtitle =
    state.status === 'ok' ? `${host.label} / ${sectionOf(state.data.repo.path)}` : host.label;

  return (
    <Screen edges={[]}>
      {/* The route param IS the manifest name (D3) and `RepoState.name`
          agree with it once loaded, so the title is correct from the first
          frame rather than waiting on the load to resolve. */}
      <Stack.Screen options={{ title: name }} />
      <Box px="lg" style={{ paddingTop: theme.space.sm }}>
        <Text variant="caption" color="txTertiary" numberOfLines={1}>
          {subtitle}
        </Text>
      </Box>

      {state.status === 'loading' ? (
        <Box style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </Box>
      ) : state.status === 'error' ? (
        <ScrollView
          testID="repo-screen-error-scroll"
          contentContainerStyle={{ flexGrow: 1, padding: theme.space.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          <Text variant="heading">Can&apos;t reach the engine</Text>
          <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.sm }}>
            {state.error instanceof Error ? state.error.message : String(state.error)}
          </Text>
          {/* No retry button and no host switcher here on purpose — pull-to-
              refresh (IMPORTANT-1's way out of this state) already covers
              "try again," and a host switch is `useHost`'s job via Settings,
              not a control this screen re-invents. */}
        </ScrollView>
      ) : (
        <ScrollView
          testID="repo-screen-scroll"
          contentContainerStyle={{ padding: theme.space.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
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
