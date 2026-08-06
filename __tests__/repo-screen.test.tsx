import AsyncStorage from '@react-native-async-storage/async-storage';
// Same wrapper-only rule `settings-route.test.tsx` documents: every helper
// comes from `expo-router/testing-library`, never mixed with the base
// `@testing-library/react-native` exports, because `renderRouter` reassigns
// its own `screen`.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';

import RepoScreen from '../src/app/(tabs)/(explorer)/repo/[name]';
import { DaemonClient } from '../src/lib/daemon/client';
import { __clearReposCacheForTests, getCachedRepos } from '../src/lib/daemon/repos-cache';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';
import type { ChangedFile, Commit, RepoState } from '../src/lib/daemon/types';

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

/** Group segments (`(tabs)`, `(explorer)`) never appear in the URL — same
 *  flattening `browse-screen.test.tsx` relies on for `browse/[...path]`. */
function TestRootLayout() {
  return (
    <HostProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </HostProvider>
  );
}

const context = { _layout: TestRootLayout, 'repo/[name]': RepoScreen };

function repo(overrides: Partial<RepoState> = {}): RepoState {
  return {
    name: 'tycho',
    path: 'operators/tycho',
    branch: 'main',
    position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
    dirty_files: 0,
    worktrees: 0,
    submodules: false,
    ...overrides,
  };
}

const COMMITS: Commit[] = [
  {
    sha: 'a1',
    subject: 'router: name our own boot file',
    author: 'tycho',
    date: new Date().toISOString(),
    unpushed: false,
  },
];

const CHANGES: ChangedFile[] = [{ path: 'notes/scratch.md', change: 'untracked', staged: false }];

/** Routes the mocked fetch by URL shape. `repos` is the fixed `GET /repos`
 *  gates payload every test in this file wants; `state` is what `GET
 *  /repos/tycho` answers. Kept as a function (not a shared mock) so each test
 *  can vary the repo state and gates independently without leaking into the
 *  next. */
function mockFetch(opts: {
  state: RepoState;
  gates?: { enabled: boolean; push_enabled: boolean };
  commits?: Commit[];
  changes?: ChangedFile[];
  onAction?: (verb: 'fetch' | 'pull' | 'push') => RepoState;
}) {
  const gates = opts.gates ?? { enabled: true, push_enabled: true };
  return jest.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const verb = url.endsWith('/fetch') ? 'fetch' : url.endsWith('/pull') ? 'pull' : 'push';
      if (!opts.onAction) throw new Error(`unexpected POST: ${url}`);
      return jsonResponse(200, opts.onAction(verb));
    }
    if (url.endsWith('/repos')) {
      return jsonResponse(200, { ...gates, repos: [opts.state], not_composed: [] });
    }
    if (url.includes('/log')) return jsonResponse(200, opts.commits ?? []);
    if (url.includes('/changes')) return jsonResponse(200, opts.changes ?? []);
    if (/\/repos\/[^/]+$/.test(url)) return jsonResponse(200, opts.state);
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe('Repo screen — unreadable', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // repos-cache.ts is module-level state, shared across every `it` in this
    // file (and with composition.tsx, in the real app). Without this, the
    // SECOND test's `GET /repos` mock is never actually hit — it silently
    // reads the FIRST test's cached gates instead, because both share the
    // same host id + generation (0, the default before any host switch).
    __clearReposCacheForTests();
  });

  it('renders the header and the State Card and NOTHING ELSE — no tabs, no lists, no empty copy', async () => {
    globalThis.fetch = mockFetch({
      state: repo({ branch: undefined, position: { kind: 'detached' }, read_error: 'not a git repository' }),
    });

    await renderRouter(context, { initialUrl: '/repo/tycho' });

    expect(await screen.findByTestId('repo-state-card')).toBeTruthy();
    expect(screen.getByText('Repo unreadable')).toBeTruthy();
    // The point of this test: rendering tabs/lists here is exactly the
    // regression Figma `372:748` rules out. Dropping the `read_error` guard
    // in the route (rendering `<RepoTabs>` unconditionally) turns this red —
    // `repo-tabs` and its default "No commits yet." both appear.
    expect(screen.queryByTestId('repo-tabs')).toBeNull();
    expect(screen.queryByText('No commits yet.')).toBeNull();
    expect(screen.queryByText('No uncommitted changes.')).toBeNull();
    expect(screen.queryByText('Changes')).toBeNull();
    expect(screen.queryByText('History')).toBeNull();
  });
});

describe('Repo screen — the happy path', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // repos-cache.ts is module-level state, shared across every `it` in this
    // file (and with composition.tsx, in the real app). Without this, the
    // SECOND test's `GET /repos` mock is never actually hit — it silently
    // reads the FIRST test's cached gates instead, because both share the
    // same host id + generation (0, the default before any host switch).
    __clearReposCacheForTests();
  });

  it('loads the card and the tabs from GET /repos/{name}, /log, /changes and /repos', async () => {
    globalThis.fetch = mockFetch({ state: repo(), commits: COMMITS, changes: CHANGES });

    await renderRouter(context, { initialUrl: '/repo/tycho' });

    expect(await screen.findByTestId('repo-state-card')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    // History is the default tab, and it is populated.
    expect(await screen.findByText('router: name our own boot file')).toBeTruthy();
    expect(screen.getByText('Changes (1)')).toBeTruthy();
  });

  it('sources the push grant from GET /repos, not a hardcoded default', async () => {
    // ahead > 0 with `push_enabled: false` must render the BLOCKED reading
    // ("not granted"), never the ready one — the only way that can be true
    // is if the card's `gates.pushEnabled` actually came from this response.
    globalThis.fetch = mockFetch({
      state: repo({ position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 } }),
      gates: { enabled: true, push_enabled: false },
      commits: COMMITS,
      changes: [],
    });

    await renderRouter(context, { initialUrl: '/repo/tycho' });

    expect(await screen.findByText('Push 2 commits')).toBeTruthy();
    const action = screen.getByTestId('repo-state-card-action');
    expect(action.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('wires the action button to the matching verb, and folds the RETURNED state back in without a re-read', async () => {
    const updated = repo({ last_fetch: new Date(2026, 7, 5, 14, 22).toISOString() });
    const fetcher = mockFetch({
      state: repo(),
      commits: [],
      changes: [],
      onAction: (verb) => {
        expect(verb).toBe('fetch');
        return updated;
      },
    });
    globalThis.fetch = fetcher;

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    await screen.findByTestId('repo-state-card-action');

    // One `GET /repos/tycho` from the initial load, and none since — the
    // baseline the negative assertion below is checked against.
    const repoReads = () =>
      (fetcher as jest.Mock).mock.calls.filter(
        ([url, init]: [string, RequestInit?]) =>
          /\/repos\/tycho$/.test(url) && init?.method !== 'POST',
      ).length;
    const readsBeforeAction = repoReads();
    expect(readsBeforeAction).toBe(1);

    await fireEvent.press(screen.getByTestId('repo-state-card-action'));

    await waitFor(() =>
      expect(
        (fetcher as jest.Mock).mock.calls.some(
          ([url, init]: [string, RequestInit?]) =>
            url.endsWith('/repos/tycho/fetch') && init?.method === 'POST',
        ),
      ).toBe(true),
    );

    // The card reflects the RETURNED state (`updated`'s `last_fetch`) —
    // proof the fold-in actually happened, not just that the POST fired.
    await waitFor(() => expect(screen.getByText('fetched 14:22 today')).toBeTruthy());

    // And the negative half of `client.ts`'s "never re-read" guarantee:
    // folding the response in must not ALSO trigger a second
    // `GET /repos/tycho`. A regression that quietly re-fetched and
    // re-rendered the identical data would pass every assertion above this
    // one; this is the one that would have caught it.
    expect(repoReads()).toBe(readsBeforeAction);
  });

  it('reuses a warm GET /repos cache instead of re-paying the sweep — the Important-1 fix', async () => {
    // Simulates the ordinary path: `composition.tsx` already loaded `GET
    // /repos` (a git-status fork PER COMPOSED REPO on the engine) for its
    // own row list, and the user then taps into a repo page. Pre-warm the
    // SAME cache `getCachedRepos` in `repo/[name].tsx` reads, at the SAME
    // host id + generation the route will use (`benatky`, `0` — the default
    // before any host switch), by calling it directly rather than through
    // `composition.tsx`, which is exercised by its own screen.
    const fetcher = mockFetch({ state: repo(), commits: [], changes: [] });
    globalThis.fetch = fetcher;
    await getCachedRepos(new DaemonClient(KNOWN_HOSTS[0].daemonUrl), KNOWN_HOSTS[0].id, 0);
    expect((fetcher as jest.Mock).mock.calls.filter(([url]) => (url as string).endsWith('/repos')))
      .toHaveLength(1);

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    expect(await screen.findByTestId('repo-state-card')).toBeTruthy();

    // The pre-warm call above is still the ONLY call to the bare `/repos`
    // sweep — the route's own `getCachedRepos` call was served from cache,
    // not the network. Before this fix, this count would be 2.
    expect(
      (fetcher as jest.Mock).mock.calls.filter(([url]) => (url as string).endsWith('/repos')),
    ).toHaveLength(1);
  });

  it('shows the host in a subtitle beneath the title — whole-branch review IMPORTANT 5', async () => {
    // All six Figma frames for this page draw a two-line header ("tycho"
    // over "stjerneborg / operators"); `module-list.tsx` already argues why
    // a host label belongs on screen ("only the host tells them apart"),
    // and that argument is strictly stronger here — this page pushes under
    // the host user's credential, with no undo. `repo()`'s fixture path is
    // `operators/tycho`, so the section is `operators`.
    globalThis.fetch = mockFetch({ state: repo(), commits: COMMITS, changes: CHANGES });
    await renderRouter(context, { initialUrl: '/repo/tycho' });
    expect(await screen.findByText('benatky / operators')).toBeTruthy();
  });
});

describe('Repo screen — whole-branch review IMPORTANT 1: a failed GET /repos must not sink the page', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __clearReposCacheForTests();
  });

  it('renders successfully with gates held CLOSED (not asserted REFUSED) when GET /repos alone fails', async () => {
    // `/repos/{name}`, `/log` and `/changes` all 200 — only the bare `/repos`
    // sweep fails. Before the I1 fix, `Promise.all` rejected the instant
    // that one call did, and the page showed "Can't reach the engine" having
    // reached it three times.
    globalThis.fetch = jest.fn((url: string) => {
      if (url.endsWith('/repos')) return jsonResponse(500, 'sweep failed');
      if (url.includes('/log')) return jsonResponse(200, COMMITS);
      if (url.includes('/changes')) return jsonResponse(200, CHANGES);
      if (/\/repos\/[^/]+$/.test(url)) return jsonResponse(200, repo());
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/repo/tycho' });

    expect(await screen.findByTestId('repo-state-card')).toBeTruthy();
    expect(screen.queryByText("Can't reach the engine")).toBeNull();

    // Held closed, not asserted refused (N1 of the whole-branch re-review):
    // `gates.enabled` reads `'unknown'`, not `'refused'`, when the gates
    // read never arrived — a plain ready-to-fetch repo blocks, but the
    // reason says the read failed, not that the host said no. The original
    // I1 fix defaulted straight to `false`/refused wording here, which
    // asserted a specific refusal nobody had actually read.
    const action = screen.getByTestId('repo-state-card-action');
    expect(action.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/held closed/i)).toBeTruthy();
    expect(screen.queryByText(/has not granted git authority/i)).toBeNull();
  });
});

describe('Repo screen — whole-branch review IMPORTANT 3: pull-to-refresh', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __clearReposCacheForTests();
  });

  it('clears a stale action_error by re-reading, and re-enables the button', async () => {
    // Rule 3 (`repo-state-card.ts`) sets `verb: null` on `action_error` —
    // right, as a model rule: someone who just watched a fetch fail should
    // not see "ready to fetch." But the ONLY way that ever clears is a fresh
    // `GET /repos/{name}` (the engine's own `read_one` NEVER carries
    // `action_error` — only a write verb's own response does), and before
    // this fix nothing on this screen instance ever fired one again.
    const fetcher = mockFetch({
      state: repo(),
      commits: COMMITS,
      changes: CHANGES,
      onAction: () => repo({ action_error: { kind: 'transport', message: 'could not reach origin' } }),
    });
    globalThis.fetch = fetcher;

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    await screen.findByTestId('repo-state-card-action');
    expect(screen.getByText('Fetch origin')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('repo-state-card-action'));
    await waitFor(() => expect(screen.getByText('Fetch failed')).toBeTruthy());
    expect(screen.getByTestId('repo-state-card-action').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    // `fireEvent(el, 'refresh')` targets a component with its OWN `onRefresh`
    // prop (FlatList); a plain `ScrollView` has no such prop — `refreshControl`
    // is a whole React element it renders as a child, so pulling the callback
    // off `scrollView.props.refreshControl.props.onRefresh` and calling it
    // directly is the real prop RN itself would invoke on a physical pull.
    await act(async () => {
      screen.getByTestId('repo-screen-scroll').props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(screen.getByText('Fetch origin')).toBeTruthy());
    expect(screen.getByTestId('repo-state-card-action').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('is the error state\'s only way out — reaching the engine again on the same screen instance', async () => {
    // Before this fix, `state.status === 'error'` had no `RefreshControl` and
    // no retry — the only recovery was leaving the screen and tapping the
    // row again. This proves the SAME screen instance can recover.
    let failing = true;
    globalThis.fetch = jest.fn((url: string) => {
      if (failing) return jsonResponse(500, 'down');
      return mockFetch({ state: repo(), commits: COMMITS, changes: CHANGES })(url, {});
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    expect(await screen.findByText("Can't reach the engine")).toBeTruthy();

    failing = false;
    await act(async () => {
      screen.getByTestId('repo-screen-error-scroll').props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByTestId('repo-state-card')).toBeTruthy();
    expect(screen.queryByText("Can't reach the engine")).toBeNull();
  });
});

describe('Repo screen — 403 invalidation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __clearReposCacheForTests();
  });

  it('a 403 on a write verb invalidates the cached grant and re-reads it, rather than leaving a refused button offered indefinitely', async () => {
    // A 403 IS proof the cached `enabled`/`push_enabled` was wrong. Before
    // this fix, the cache and the card's gates were left untouched, so the
    // card kept offering the same refused action until the TTL happened to
    // expire on its own.
    let sync = true;
    const fetcher = jest.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return sync ? jsonResponse(403, 'nope') : jsonResponse(200, repo());
      }
      if (url.endsWith('/repos')) return jsonResponse(200, { enabled: sync, push_enabled: true, repos: [repo()], not_composed: [] });
      if (url.includes('/log')) return jsonResponse(200, COMMITS);
      if (url.includes('/changes')) return jsonResponse(200, CHANGES);
      if (/\/repos\/[^/]+$/.test(url)) return jsonResponse(200, repo());
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    globalThis.fetch = fetcher;

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    await screen.findByTestId('repo-state-card-action');
    expect(screen.getByTestId('repo-state-card-action').props.accessibilityState).toMatchObject({
      disabled: false,
    });

    await fireEvent.press(screen.getByTestId('repo-state-card-action'));
    await waitFor(() =>
      expect(screen.getByText('This host has not granted that action.')).toBeTruthy(),
    );

    // The host actually granted it in the meantime (this test's stand-in for
    // "David flipped the manifest"). Nothing on screen has re-fetched the
    // gates yet UNLESS the 403 path invalidated the cache — so a second
    // gates read must have already gone out.
    sync = false;
    const reposReadsSoFar = (fetcher as jest.Mock).mock.calls.filter(([url]) =>
      (url as string).endsWith('/repos'),
    ).length;
    expect(reposReadsSoFar).toBeGreaterThanOrEqual(2);
  });
});

describe('Repo screen — N3 (whole-branch re-review): an epoch bump mid-action must not strand the spinner', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __clearReposCacheForTests();
  });

  it('a pull-to-refresh started while a verb is in flight still clears busy once the verb settles', async () => {
    // `handleRefresh` bumps `epoch.current` (the same guard `onAction`
    // reads). Before the fix, `onAction`'s `finally` only cleared `inFlight`
    // `if (epoch.current === mine)` — so an epoch bump mid-action (a pull,
    // or a host switch) left the spinner running forever: the button stayed
    // `{busy: true, disabled: true}` even after the POST had resolved,
    // because nothing on this screen instance could ever pass that guard
    // again.
    let resolvePost: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    const fetcher = jest.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pending.then(() => jsonResponse(200, repo()));
      if (url.endsWith('/repos')) {
        return jsonResponse(200, { enabled: true, push_enabled: true, repos: [repo()], not_composed: [] });
      }
      if (url.includes('/log')) return jsonResponse(200, COMMITS);
      if (url.includes('/changes')) return jsonResponse(200, CHANGES);
      if (/\/repos\/[^/]+$/.test(url)) return jsonResponse(200, repo());
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    globalThis.fetch = fetcher;

    await renderRouter(context, { initialUrl: '/repo/tycho' });
    await screen.findByTestId('repo-state-card-action');

    // NOT awaited, deliberately — `fireEvent.press` in this
    // `@testing-library/react-native` version wraps the async `onPress` in
    // `act()` and its returned promise only resolves once that ENTIRE
    // handler settles (`ui-composed.test.tsx`'s own doc on this). `onAction`
    // does not settle until the POST below resolves, and this test needs to
    // observe the screen WHILE that POST is still pending — awaiting here
    // would deadlock on the exact promise this test is about to hold open.
    fireEvent.press(screen.getByTestId('repo-state-card-action'));
    await waitFor(() => expect(screen.getByText('Fetching…')).toBeTruthy());

    // Bump the epoch MID-FLIGHT, before the POST resolves — the exact shape
    // N3 named ("tap Fetch, pull down while it spins"). `handleRefresh`
    // bumps `epoch.current` SYNCHRONOUSLY on call, which is all this proof
    // needs — no need to wait for the refresh's own reload to finish before
    // moving on (and `inFlight` from the original action still outranks it
    // in the card's own ladder until the POST below settles, so waiting for
    // any text change here would hang on the very bug this test exists to
    // catch).
    act(() => {
      screen.getByTestId('repo-screen-scroll').props.refreshControl.props.onRefresh();
    });

    // Now let the original action settle. The POST's mocked response chain
    // has several more hops after `pending` itself resolves (the fetch
    // mock's own `.then`, `DaemonClient.post`'s `await response.json()`,
    // `onAction`'s own continuation) — `waitFor` below polls across real
    // macrotasks, which is what actually drains all of them, not this
    // single `await`.
    await act(async () => {
      resolvePost();
      // A real macrotask boundary, not another microtask hop off the same
      // already-resolved `pending` — the mocked response has several more
      // hops after `pending` settles (the fetch mock's own `.then`,
      // `DaemonClient.post`'s `await response.json()`, `onAction`'s own
      // continuation), and a `setTimeout(0)` is what actually guarantees
      // the WHOLE microtask queue drains before this resolves, not just one
      // more turn of it.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The card must not still claim a request is running.
    await waitFor(() => expect(screen.queryByText('Fetching…')).toBeNull(), { timeout: 3000 });
    expect(screen.queryByTestId('repo-state-card-progress')).toBeNull();
    expect(screen.getByTestId('repo-state-card-action').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});
