import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';

import Explorer from '../src/app/(tabs)/(explorer)/index';
import { HostProvider } from '../src/lib/host-context';
import { PreferencesProvider } from '../src/lib/preferences';

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

/**
 * Stands in for the real root layout — same two providers, without the
 * splash/native-tabs machinery that layout also wires, which is irrelevant to
 * this screen's own count logic.
 */
function TestRootLayout() {
  return (
    <HostProvider>
      <PreferencesProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PreferencesProvider>
    </HostProvider>
  );
}

describe('Explorer screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('the footer counts what the engine returned, not the client-filtered list', async () => {
    // The property under test (C-7 in the review): `TreeList`'s own tests
    // pass `returned` by hand, so nothing exercises the real wiring at
    // `index.tsx`. Swapping `returned={tree.entries.length}` for
    // `returned={visibleEntries(...).length}` would zero the hidden count and
    // every `TreeList`-level test would still pass — only a test that renders
    // this screen and reads its own footer can catch that.
    await AsyncStorage.setItem('armillary.showDotfiles', 'false');

    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, {
          path: '',
          total: 5,
          truncated: false,
          entries: [
            { name: '.claude', dir: true },
            { name: '.DS_Store', dir: false },
            { name: 'CLAUDE.md', dir: false },
            { name: 'local', dir: true },
            { name: 'zojercommons', dir: true },
          ],
        });
      }
      if (url.includes('/composition')) {
        // The workspace root is load-bearing; composition is decoration and
        // this screen must still render without it.
        return jsonResponse(404, 'not composed');
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter({ _layout: TestRootLayout, index: Explorer }, { initialUrl: '/' });

    // 5 returned, 2 of them (.claude, .DS_Store) hidden by the toggled-off
    // preference, 3 rows on screen.
    expect(await screen.findByText('CLAUDE.md')).toBeTruthy();
    expect(screen.queryByText('.claude')).toBeNull();
    expect(screen.getByText(/2 hidden by the dotfile setting\./)).toBeTruthy();
  });

  it('offers a way into Settings', async () => {
    // A regression, found on device and by nobody else: the old three-section
    // screen reached Settings by tapping the host label, the rewrite replaced
    // that header, and the only link went with it. Reviews checked that
    // /composition was reachable and never asked whether /settings still was —
    // a missing link renders exactly like a screen that has no button, so
    // nothing failed. This test is the thing that would have failed.
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, { path: '', total: 0, truncated: false, entries: [] });
      }
      if (url.includes('/composition')) return jsonResponse(404, 'not composed');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(
      {
        _layout: () => (
          <HostProvider>
            <PreferencesProvider>
              <Stack />
            </PreferencesProvider>
          </HostProvider>
        ),
        index: Explorer,
      },
      { initialUrl: '/' },
    );

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('capture stays reachable from the chrome', async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, { path: '', total: 0, truncated: false, entries: [] });
      }
      if (url.includes('/composition')) return jsonResponse(404, 'not composed');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter({ _layout: TestRootLayout, index: Explorer }, { initialUrl: '/' });

    expect(await screen.findByRole('button', { name: 'Capture' })).toBeTruthy();
  });

  it('search and overflow are announced disabled', async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, { path: '', total: 0, truncated: false, entries: [] });
      }
      if (url.includes('/composition')) return jsonResponse(404, 'not composed');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter({ _layout: TestRootLayout, index: Explorer }, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Capture' });

    expect(screen.getByTestId('search-stub').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByTestId('explorer-more-stub').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('the identity header names the host and its composition, still linking to /composition', async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, { path: '', total: 0, truncated: false, entries: [] });
      }
      if (url.includes('/composition')) {
        return jsonResponse(200, {
          operators: Array.from({ length: 4 }, (_, i) => ({
            name: `operator-${i}`,
            path: `operators/operator-${i}`,
          })),
          repos: Array.from({ length: 15 }, (_, i) => ({ name: `repo-${i}`, path: `repos/repo-${i}` })),
          commons: Array.from({ length: 2 }, (_, i) => ({
            name: `commons-${i}`,
            path: `commons-${i}`,
          })),
          protocols: [],
          manifests: [],
          protocol_sources: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter({ _layout: TestRootLayout, index: Explorer }, { initialUrl: '/' });

    expect(await screen.findByText('benatky')).toBeTruthy();
    expect(screen.getByText('4 operators • 15 repos • 2 commons ›')).toBeTruthy();
  });

  it('chrome renders on the error state too', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    await renderRouter({ _layout: TestRootLayout, index: Explorer }, { initialUrl: '/' });

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
  });
});
