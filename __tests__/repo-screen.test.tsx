import AsyncStorage from '@react-native-async-storage/async-storage';
// Same wrapper-only rule `settings-route.test.tsx` documents: every helper
// comes from `expo-router/testing-library`, never mixed with the base
// `@testing-library/react-native` exports, because `renderRouter` reassigns
// its own `screen`.
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
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
});
