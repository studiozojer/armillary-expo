import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { StyleSheet } from 'react-native';

import Browse from '../src/app/(tabs)/(explorer)/browse/[...path]';
import { __clearGitEpochForTests, bumpGitEpoch } from '../src/lib/daemon/git-epoch';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';
import { PreferencesProvider } from '../src/lib/preferences';

/**
 * Same trick `explorer-screen.test.tsx`, `composition-screen.test.tsx` and
 * `instances-screen.test.tsx` use: a real `useEffect` with an empty
 * dependency array fires the callback once per mount (matching
 * mount-is-a-focus), and the callback is stashed so a test can invoke it
 * again directly to simulate a LATER focus (e.g. navigating back to this
 * depth from a deeper one) without fighting `renderRouter`'s real navigator
 * for a reliable push/pop cycle. `Browse` imports `Stack` from `expo-router`
 * itself (not `expo-router/stack`, unlike the Explorer screen), so it is
 * covered by this same mock via the spread of `actual`.
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

/** The query-string `path` value a mocked fetch URL was called with. */
function pathParam(url: string): string {
  const match = url.match(/[?&]path=([^&]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Same minimal stand-in for the root layout used by the Explorer screen test. */
function TestRootLayout() {
  return (
    <HostProvider>
      <PreferencesProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PreferencesProvider>
    </HostProvider>
  );
}

const context = { _layout: TestRootLayout, 'browse/[...path]': Browse };

describe('Browse screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    focusCallback = undefined;
    // git-epoch.ts is module-level state, shared across every `it` in this
    // file — same reasoning `composition-screen.test.tsx` gives for clearing
    // it: without this, a later test can silently read an earlier test's
    // bumped epoch and revalidate when it should not.
    __clearGitEpochForTests();
  });

  it('the footer counts what the engine returned, not the client-filtered list', async () => {
    // Same property as the Explorer screen (C-7), exercised at the other
    // caller — `browse/[...path].tsx:194` — which also passes `returned` by
    // hand and is equally unguarded by `TreeList`'s own tests.
    await AsyncStorage.setItem('armillary.showDotfiles', 'false');

    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, {
          path: pathParam(url),
          total: 4,
          truncated: false,
          entries: [
            { name: '.hidden', dir: false },
            { name: 'a.md', dir: false },
            { name: 'b.md', dir: false },
            { name: 'sub', dir: true },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/local' });

    expect(await screen.findByText('a.md')).toBeTruthy();
    expect(screen.queryByText('.hidden')).toBeNull();
    expect(screen.getByText(/1 hidden by the dotfile setting\./)).toBeTruthy();
  });

  it('a voicenotes sidecar failure decorates nothing but does not break the directory listing', async () => {
    // C-2: the sidecar fetch used to sit inside the `getTree` try/catch, so a
    // non-404 sidecar failure (400 from a misconfigured `audio_root`, a 500,
    // a tailnet blip) was misread as "not a directory" and killed the whole
    // listing over what is only a decoration.
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        return jsonResponse(200, {
          path: pathParam(url),
          total: 1,
          truncated: false,
          entries: [{ name: 'memo.m4a', dir: false }],
        });
      }
      if (url.includes('/voicenotes')) {
        // A composed-but-misconfigured audio_root: not a 404 (absent
        // feature), just a refusal.
        return jsonResponse(400, 'bad audio_root');
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/local/inbox' });

    // The directory still renders — the sidecar's failure did not turn it
    // into "Not found".
    expect(await screen.findByText('memo.m4a')).toBeTruthy();
    expect(screen.queryByText('Not found')).toBeNull();
  });

  it('a 404 on an audio path resolves through the voicenote index when the entry says the audio is elsewhere (C-5)', async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) return jsonResponse(400, 'not a directory');
      if (url.includes('/file')) return jsonResponse(404, 'not found');
      if (url.includes('/voicenotes')) {
        return jsonResponse(200, {
          audio_root: 'local/inbox',
          transcript_roots: ['zojercommons/voicenotes'],
          entries: [
            {
              audio: 'local/inbox/elsewhere.m4a',
              state: 'audio_absent',
              transcript: { path: 'zojercommons/voicenotes/2026-07-23-elsewhere.md' },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/local/inbox/elsewhere.m4a' });

    // Widening the branch to `(415 || 404) && isAudioPath` is what makes this
    // resolve to the voicenote page instead of the generic "Not found" the
    // design forbids for a transcript whose audio just lives on another
    // machine.
    expect(await screen.findByText(/not on this machine/i)).toBeTruthy();
    expect(screen.queryByText('Not found')).toBeNull();
  });

  it('a genuine 404 on an audio-shaped path with no matching index entry still reports "Not found" (C-5)', async () => {
    // The other half of C-5: the guard must still rethrow, not swallow, when
    // the index has nothing for this path — a real typo must not silently
    // resolve to a voicenote page.
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) return jsonResponse(400, 'not a directory');
      if (url.includes('/file')) return jsonResponse(404, 'not found');
      if (url.includes('/voicenotes')) {
        return jsonResponse(200, {
          audio_root: 'local/inbox',
          transcript_roots: ['zojercommons/voicenotes'],
          entries: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/local/inbox/typo.m4a' });

    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('renders a markdown file in the studio faces, not the system font', async () => {
    // markedStylesFor() on its own is a token pair: it proves the map is right
    // and nothing about whether this screen — the largest reading surface in
    // the app, and the entire point of Explorer — ever passes it. Drop the
    // `styles={markedStylesFor(theme)}` prop and every other test stays green.
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) return jsonResponse(400, 'not a directory');
      if (url.includes('/file')) {
        return jsonResponse(200, {
          path: 'zojercommons/BOARD.md',
          sha256: 'x',
          bytes: 32,
          text: '# The board\n\nA paragraph of prose.\n',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/zojercommons/BOARD.md' });

    const heading = await screen.findByText('The board');
    const paragraph = screen.getByText('A paragraph of prose.');

    // react-native-marked flattens [itsOwnDefaults, userStyles] per element and
    // hands the result straight to a <Text>, so props.style is a plain object
    // here — flattening anyway keeps this honest if that ever changes.
    const familyOf = (node: { props: { style?: unknown } }) =>
      (StyleSheet.flatten(node.props.style as never) as Record<string, unknown>).fontFamily;

    expect(familyOf(heading)).toMatch(/^ABCWhyte/);
    expect(familyOf(paragraph)).toMatch(/^ABCWhyte/);
    // The two registers actually differ — a version that set one family
    // everywhere would pass the two assertions above.
    expect(familyOf(heading)).not.toBe(familyOf(paragraph));
  });

  it('a browse depth revalidates on focus after a bump — new files appear on back-navigation', async () => {
    const treeCalls: string[] = [];
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/tree')) {
        treeCalls.push(url);
        const entries =
          treeCalls.length === 1
            ? [{ name: 'a.md', dir: false }]
            : [
                { name: 'a.md', dir: false },
                { name: 'pulled.md', dir: false },
              ];
        return jsonResponse(200, {
          path: pathParam(url),
          total: entries.length,
          truncated: false,
          entries,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(context, { initialUrl: '/browse/local' });
    expect(await screen.findByText('a.md')).toBeTruthy();
    // One `GET /tree` from the initial mount; the mocked `useFocusEffect`
    // also fires once at mount (mount-is-a-focus), but
    // `useGitEpochFocusRefresh` skips that first focus itself.
    expect(treeCalls.length).toBe(1);

    // A pull elsewhere (e.g. a deeper depth's own action, or another screen
    // entirely) — this depth never fired the action itself, so the next
    // focus (returning here via back-navigation) must find its stamp stale.
    bumpGitEpoch(KNOWN_HOSTS[0].id);

    await act(async () => {
      focusCallback?.();
    });

    await waitFor(() => expect(treeCalls.length).toBe(2));
    expect(await screen.findByText('pulled.md')).toBeTruthy();
  });
});
