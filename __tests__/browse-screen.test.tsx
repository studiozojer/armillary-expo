import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';

import Browse from '../src/app/(explorer)/browse/[...path]';
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
});
