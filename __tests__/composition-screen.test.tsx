import AsyncStorage from '@react-native-async-storage/async-storage';
// Same wrapper-only rule `repo-screen.test.tsx` documents: every helper comes
// from `expo-router/testing-library`, never mixed with the base
// `@testing-library/react-native` exports, because `renderRouter` reassigns
// its own `screen`.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';

import CompositionScreen from '../src/app/(tabs)/(explorer)/composition';
import { __clearGitEpochForTests, bumpGitEpoch, gitEpochOf } from '../src/lib/daemon/git-epoch';
import { __clearReposCacheForTests } from '../src/lib/daemon/repos-cache';
import { AuthProvider } from '../src/lib/auth/auth-context';
import { __resetTokenCache } from '../src/lib/auth/token-store';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';
import type { Composition, RepoState } from '../src/lib/daemon/types';

/**
 * `useFocusEffect`'s real behaviour (expo-router/react-navigation) is to run
 * its callback whenever the screen becomes focused — including on first
 * mount, deferred until after commit. Mocked here exactly as
 * `instances-screen.test.tsx` does it: a real `useEffect` with an empty
 * dependency array fires the callback once per mount (matching mount-is-a-
 * focus), and the callback is stashed so a test can invoke it again directly
 * to simulate a LATER focus (e.g. navigating back to this tab) without
 * fighting `renderRouter`'s real navigator for a reliable push/pop cycle.
 */
let focusCallback: (() => void) | undefined;
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      focusCallback = callback;
      ReactActual.useEffect(() => {
        callback();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, by design (see comment above).
      }, []);
    },
  };
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

function TestRootLayout() {
  return (
    <HostProvider>
      {/* The real provider, as the app composes it — `seedEnrolled()` below
          puts a token in the mocked Keychain rather than this wrapper
          faking an enrollment the app cannot. */}
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </HostProvider>
  );
}

/** A token for every known host, in the mocked Keychain. */
function seedEnrolled() {
  const secure = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
  secure.__store.clear();
  for (const h of KNOWN_HOSTS) secure.__store.set(`armillary.deviceToken.${h.id}`, 'test-token');
}

const context = { _layout: TestRootLayout, composition: CompositionScreen };

function composition(overrides: Partial<Composition> = {}): Composition {
  return {
    operators: [{ name: 'tycho', path: 'operators/tycho' }],
    commons: [],
    repos: [],
    protocols: [],
    manifests: [],
    protocol_sources: [],
    ...overrides,
  };
}

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

/** Routes the mocked fetch by URL shape. The exact `/repos/fetch` POST is the
 *  fetch-ALL sweep (`client.ts`'s `fetchAll`) — distinct from a per-repo
 *  `/repos/<name>/fetch`, which this screen never fires. */
function mockFetch(opts: {
  gates?: { enabled: boolean; push_enabled: boolean };
  repos?: RepoState[];
  fetchAll?: () => { status: number; body: RepoState[] | string };
}) {
  const gates = opts.gates ?? { enabled: true, push_enabled: true };
  const repos = opts.repos ?? [repo()];
  return jest.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.endsWith('/repos/fetch')) {
      const result = opts.fetchAll ? opts.fetchAll() : { status: 200, body: repos };
      return jsonResponse(result.status, result.body);
    }
    if (url.endsWith('/composition')) return jsonResponse(200, composition());
    if (url.endsWith('/repos')) return jsonResponse(200, { ...gates, repos, not_composed: [] });
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe('Composition screen — git-ux: fetch-all is a bump site; focus revalidates', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    seedEnrolled();
    __resetTokenCache();
    // repos-cache.ts and git-epoch.ts are both module-level state, shared
    // across every `it` in this file — same reasoning `repo-screen.test.tsx`
    // gives for the repos cache: without clearing both, a later test can
    // silently read an earlier test's cached gates or bumped epoch.
    __clearReposCacheForTests();
    __clearGitEpochForTests();
    focusCallback = undefined;
  });

  it('a successful fetch-all bumps the epoch and invalidates the repos cache', async () => {
    globalThis.fetch = mockFetch({});

    await renderRouter(context, { initialUrl: '/composition' });

    const action = await screen.findByTestId('fetch-all-action');
    expect(gitEpochOf(KNOWN_HOSTS[0].id)).toBe(0);

    await fireEvent.press(action);

    await waitFor(() => expect(gitEpochOf(KNOWN_HOSTS[0].id)).toBe(1));
  });

  it('a failed fetch-all bumps nothing', async () => {
    globalThis.fetch = mockFetch({
      fetchAll: () => ({ status: 403, body: 'nope' }),
    });

    await renderRouter(context, { initialUrl: '/composition' });

    const action = await screen.findByTestId('fetch-all-action');
    await fireEvent.press(action);

    await waitFor(() => expect(screen.getByText('This host has not granted fetch.')).toBeTruthy());
    expect(gitEpochOf(KNOWN_HOSTS[0].id)).toBe(0);
  });

  it('regaining focus after a bump re-reads composition AND forces the repos sweep past the cache', async () => {
    const fetcher = mockFetch({});
    globalThis.fetch = fetcher;

    await renderRouter(context, { initialUrl: '/composition' });
    await screen.findByTestId('fetch-all-action');

    const countOf = (needle: string) =>
      (fetcher as jest.Mock).mock.calls.filter(
        ([url, init]: [string, RequestInit?]) =>
          (url as string).endsWith(needle) && init?.method !== 'POST',
      ).length;

    // One `GET /composition` and one `GET /repos` from the initial mount.
    expect(countOf('/composition')).toBe(1);
    expect(countOf('/repos')).toBe(1);

    // A repo page bumped the epoch — this screen never fired the action
    // itself, so `markFresh` was never called, and the next focus must find
    // it stale.
    bumpGitEpoch(KNOWN_HOSTS[0].id);

    await act(async () => {
      focusCallback?.();
    });
    await waitFor(() => expect(countOf('/composition')).toBe(2));
    await waitFor(() => expect(countOf('/repos')).toBe(2));

    // The composition re-read is silent (`useLoader.revalidate`'s own
    // contract: content-preserving, spinner-free) — but `ModuleList`'s
    // `SectionList` carries no testID in this codebase to query its
    // `refreshControl.props.refreshing` off of, so that half is not
    // re-asserted screen-side here; `use-loader.test.ts`'s own suite already
    // covers `revalidate`'s silence directly.
  });
});
