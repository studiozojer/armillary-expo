import AsyncStorage from '@react-native-async-storage/async-storage';
// Every helper comes from expo-router's wrapper, not from the base library.
// The wrapper reassigns its own `screen` when `renderRouter` mounts, so mixing
// the two hands a later test a stale view of an earlier render.
import { cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';

import Instances from '../src/app/(tabs)/(instances)/index';
import Settings from '../src/app/settings';
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

/** The real root: providers, then a Stack holding the tabs and the modal. */
function RootLayout() {
  return (
    <HostProvider>
      <PreferencesProvider>
        <Stack />
      </PreferencesProvider>
    </HostProvider>
  );
}

/**
 * Stands in for `(tabs)/_layout`, which renders `NativeTabs` — a native
 * component with nothing to render under jest.
 *
 * **One tab group per render, deliberately.** Group segments do not appear in
 * URLs, so `(tabs)/(explorer)/index` and `(tabs)/(instances)/index` BOTH
 * resolve to `/`; only the native tab bar tells them apart. Mounting both under
 * a plain `Stack` makes `/` ambiguous and the second one unreachable — which is
 * a fact about this route tree worth knowing, not a limitation of the test.
 */
function TabsLayout() {
  return <Stack />;
}

/** A line only the Settings screen renders. */
const SETTINGS_MARKER = /Which machine is serving this workspace/;

/**
 * One `renderRouter` per file: the router caches its mock context, so a second
 * call with a different route map in the same file silently renders nothing.
 * The Explorer side of this property is covered by its own screen test.
 */
const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/(instances)/index': Instances,
  settings: Settings,
};

describe('Settings as a root-level modal', () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, {
          path: '',
          total: 1,
          truncated: false,
          entries: [{ name: 'CLAUDE.md', dir: false }],
        });
      }
      if (url.includes('/composition')) return jsonResponse(404, 'not composed');
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  it('is reachable from the Instances tab', async () => {
    // The whole reason for the restructure. Settings used to live inside the
    // Explorer group's stack, where a `Link` from the other tab had nothing to
    // push onto — and the two groups cannot each declare `/settings`, because
    // siblings collide on one URL. A screen on the root stack is the only one
    // presentable from both.
    await renderRouter(routes, { initialUrl: '/' });

    fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));

    expect(await screen.findByText(SETTINGS_MARKER)).toBeTruthy();
  });
});
