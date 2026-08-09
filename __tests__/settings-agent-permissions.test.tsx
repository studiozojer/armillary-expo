import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Settings, { AgentPermissionToggle } from '../src/app/settings';
import { AuthProvider } from '../src/lib/auth/auth-context';
import { __resetTokenCache } from '../src/lib/auth/token-store';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';
import { PreferencesProvider } from '../src/lib/preferences';

/** Same stand-in `settings-enrollment-facts.test.tsx` uses, and for the same reason. */
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
const HOST_2 = KNOWN_HOSTS[1];

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

/** No token held, no whoami reachable at all — the section still has an opinion. */
function stubHealthOnly() {
  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

describe('Settings — Agent permissions', () => {
  beforeEach(() => {
    secureMock().__store.clear();
    __resetTokenCache();
  });

  it('(a) reads as fully consented from a fresh store — all three toggles on by default', async () => {
    stubHealthOnly();
    await renderSettings();

    // `SectionHeader` uppercases its label, same as every other section here.
    expect(await screen.findByText('AGENT PERMISSIONS')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('agent-permission-sync').props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(screen.getByTestId('agent-permission-push').props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(screen.getByTestId('agent-permission-commit').props.accessibilityState).toMatchObject({
        checked: true,
      });
    });
  });

  it('(b) flipping a toggle persists it per host, independent of the other host', async () => {
    stubHealthOnly();
    await renderSettings();

    await waitFor(() => expect(screen.getByTestId('agent-permission-push')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('agent-permission-push'));

    await waitFor(() =>
      expect(screen.getByTestId('agent-permission-push').props.accessibilityState).toMatchObject({
        checked: false,
      }),
    );
    // sync and commit on HOST are untouched by flipping push.
    expect(screen.getByTestId('agent-permission-sync').props.accessibilityState).toMatchObject({
      checked: true,
    });

    // Switching to a second host must not carry the revocation with it.
    await fireEvent.press(screen.getByTestId(`host-${HOST_2.id}`));
    await waitFor(() =>
      expect(screen.getByTestId('agent-permission-push').props.accessibilityState).toMatchObject({
        checked: true,
      }),
    );

    // And switching back to HOST shows the revocation held.
    await fireEvent.press(screen.getByTestId(`host-${HOST.id}`));
    await waitFor(() =>
      expect(screen.getByTestId('agent-permission-push').props.accessibilityState).toMatchObject({
        checked: false,
      }),
    );
  });

  it('(c) disables a toggle with a reason when /whoami shows the device lacks that grant', async () => {
    secureMock().__store.set(`armillary.deviceToken.${HOST.id}`, 'tok-abc');
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/health')) return jsonResponse(200, { ok: true, root: '/x', version: '0' });
      if (url.includes('/whoami')) {
        return jsonResponse(200, { name: 'iphone', grants: ['sync', 'commit'], minted: '2026-08-01T00:00:00Z' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderSettings();

    await waitFor(() =>
      expect(screen.getByTestId('agent-permission-push').props.accessibilityState).toMatchObject({
        disabled: true,
      }),
    );
    expect(
      screen.getByText("This device isn't granted push — the toggle would gate nothing."),
    ).toBeTruthy();

    // The other two, present in the grant list, stay live.
    expect(screen.getByTestId('agent-permission-sync').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    expect(screen.getByTestId('agent-permission-commit').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});

describe('<AgentPermissionToggle> — prove-the-instrument', () => {
  it('(d) a disabled toggle never invokes its handler, and the identical wiring fires once enabled', async () => {
    // Prove-the-instrument (per-repo-git's own idiom, `repo-tabs.test.tsx`): a
    // mock that THROWS when invoked, not a plain `jest.fn()`. `not
    // .toHaveBeenCalled()` alone would pass for a control wired to nothing —
    // proof only comes from showing the SAME wiring fires once enabled.
    const onToggle = jest.fn(() => {
      throw new Error('onToggle fired');
    });

    await render(
      <AgentPermissionToggle
        testID="t"
        label="Push"
        value
        disabled
        reason="This device isn't granted push — the toggle would gate nothing."
        onToggle={onToggle}
      />,
    );
    const row = screen.getByTestId('t');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });

    // Silence: fireEvent.press on a disabled Pressable never calls onPress at
    // all, so the throwing mock never runs — a plain await is the "did not
    // throw" assertion here.
    await fireEvent.press(row);
    expect(onToggle).not.toHaveBeenCalled();

    await render(<AgentPermissionToggle testID="t" label="Push" value disabled={false} onToggle={onToggle} />);
    const enabled = screen.getByTestId('t');
    expect(enabled.props.accessibilityState).toMatchObject({ disabled: false });

    await expect(fireEvent.press(enabled)).rejects.toThrow('onToggle fired');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
