import { render, screen, waitFor } from '@testing-library/react-native';

import Settings from '../src/app/settings';
import { AuthProvider } from '../src/lib/auth/auth-context';
import { __resetTokenCache } from '../src/lib/auth/token-store';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';
import { PreferencesProvider } from '../src/lib/preferences';

/**
 * `Stack.Screen` (imported from bare `expo-router`, not `expo-router/stack`,
 * in `settings.tsx`) registers per-screen options through a real navigator's
 * context — rendered standalone it throws "Couldn't find a route object".
 * Same fix `session-screen.test.tsx` documents: a plain stand-in, so this
 * file can render `Settings` directly rather than through `renderRouter` —
 * whose own module-level `router-store` singleton makes more than one call
 * per FILE unsafe, per `settings-route.test.tsx`'s header comment. Four
 * scenarios below each want their own render and their own scripted fetch,
 * so a separate file (a separate module registry) is the isolation unit,
 * not a shared `renderRouter` call.
 */
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

function secureMock() {
  return jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

const HOST = KNOWN_HOSTS[0];

function renderSettings() {
  return render(
    <HostProvider>
      <AuthProvider>
        <PreferencesProvider>
          <Settings />
        </PreferencesProvider>
      </AuthProvider>
    </HostProvider>,
  );
}

function whoamiCalls() {
  return (globalThis.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('/whoami'));
}

describe('Settings — enrollment facts (whoami)', () => {
  beforeEach(() => {
    secureMock().__store.clear();
    __resetTokenCache();
  });

  it('fires zero /whoami calls while unenrolled, and shows the enrollment field as today', async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderSettings();
    expect(await screen.findByText('Not enrolled')).toBeTruthy();

    // Settle every host probe before counting — the assertion is about
    // /whoami specifically, not about whether fetch was called at all.
    await screen.findAllByText('/x');
    expect(whoamiCalls()).toHaveLength(0);
  });

  it('renders the name and grant chips once enrolled and the host answers', async () => {
    secureMock().__store.set(`armillary.deviceToken.${HOST.id}`, 'tok-abc');
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      if (url.includes('/whoami')) {
        return jsonResponse(200, {
          name: 'iphone',
          grants: ['sync', 'push', 'commit'],
          minted: '2026-08-01T00:00:00Z',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderSettings();
    expect(await screen.findByText('Enrolled')).toBeTruthy();

    expect(await screen.findByText('iphone')).toBeTruthy();
    expect(screen.getByText('sync')).toBeTruthy();
    expect(screen.getByText('push')).toBeTruthy();
    expect(screen.getByText('commit')).toBeTruthy();

    // Rides authedFetch even though it's a GET — the whole point of Task 6's
    // client-side contract, re-asserted here at the screen that actually
    // fires it.
    const call = whoamiCalls()[0];
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer tok-abc');
  });

  it('degrades to today’s display when the host’s engine predates /whoami (404)', async () => {
    secureMock().__store.set(`armillary.deviceToken.${HOST.id}`, 'tok-abc');
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      if (url.includes('/whoami')) return jsonResponse(404, 'not found');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderSettings();
    expect(await screen.findByText('Enrolled')).toBeTruthy();

    await waitFor(() => expect(whoamiCalls()).toHaveLength(1));
    // No facts row, and the enrolled copy from before this task is intact —
    // an older engine's 404 is a silent degrade, not an error state.
    expect(screen.queryByTestId('enrollment-facts')).toBeNull();
    expect(screen.getByText(/decided on the host/)).toBeTruthy();
  });

  it('maps a 401 to the existing device-refusal flow rather than crashing', async () => {
    secureMock().__store.set(`armillary.deviceToken.${HOST.id}`, 'tok-stale');
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      if (url.includes('/whoami')) return jsonResponse(401, 'unknown_principal: revoked');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderSettings();

    // Not asserting the intermediate "Enrolled" text here — the 401 can
    // resolve fast enough that by the time this polls, the section has
    // already flipped past it. `unknown_principal` invalidates the held
    // token (auth-context.ts's `noteRefusal`), so the existing enrollment
    // section — untouched by this task — should itself land on "Token
    // rejected" rather than the screen throwing.
    expect(await screen.findByText('Token rejected')).toBeTruthy();
    expect(screen.queryByTestId('enrollment-facts')).toBeNull();
  });
});
