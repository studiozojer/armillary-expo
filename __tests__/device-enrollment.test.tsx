import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DeviceEnrollment } from '../src/components/device-enrollment';
import { AuthProvider } from '../src/lib/auth/auth-context';
import { __resetTokenCache, loadToken } from '../src/lib/auth/token-store';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';

function secureMock() {
  return jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
}

const HOST = KNOWN_HOSTS[0];

beforeEach(() => {
  secureMock().__store.clear();
  __resetTokenCache();
});

function renderEnrollment() {
  return render(
    <HostProvider>
      <AuthProvider>
        <DeviceEnrollment host={HOST} />
      </AuthProvider>
    </HostProvider>,
  );
}

describe('<DeviceEnrollment>', () => {
  it('reports the device unenrolled, and says which host it would enroll against', async () => {
    // Naming the host is the guard against pasting the right token at the
    // wrong machine — the registry is host-local, so that mistake produces a
    // 401 that looks like a bad token rather than a misaimed one.
    await renderEnrollment();
    expect(await screen.findByText('Not enrolled')).toBeTruthy();
    expect(screen.getByText(new RegExp(`Mint a token on ${HOST.label}`))).toBeTruthy();
  });

  it('shows the exact command that mints a token, because nothing here can', async () => {
    // There is no enrollment endpoint by design, so the only honest instruction
    // is the one that runs on the host.
    await renderEnrollment();
    expect(await screen.findByText(/armillary-engine enroll/)).toBeTruthy();
  });

  it('stores a pasted token against the selected host and flips to enrolled', async () => {
    await renderEnrollment();
    await screen.findByText('Not enrolled');

    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'tok-from-host');
    // Wait for the button to actually enable before pressing it. `changeText`
    // and `press` in the same tick pressed a still-disabled control, whose
    // `onPress` is `undefined` — the press landed on nothing and the test
    // failed for a harness reason that looks exactly like a broken feature.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enroll this device' }).props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Enroll this device' }));

    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(await loadToken(HOST.id)).toBe('tok-from-host');
  });

  it('refuses to submit an empty field rather than storing a blank credential', async () => {
    await renderEnrollment();
    await screen.findByText('Not enrolled');
    // Asserted as a POSITIVE fact about the control, not merely as "nothing
    // happened" — an earlier draft of this test only pressed and checked the
    // state was unchanged, which passed even when the press did nothing at
    // all because it was aimed at the inner Text rather than the button.
    const button = screen.getByRole('button', { name: 'Enroll this device' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(button);
    await waitFor(() => expect(screen.getByText('Not enrolled')).toBeTruthy());
    expect(await loadToken(HOST.id)).toBeNull();

    // And it enables the moment there is something to submit — otherwise
    // "disabled" would pass for a button that is simply always dead.
    fireEvent.changeText(screen.getByTestId('enrollment-input'), 'tok');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enroll this device' }).props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
  });

  it('removes the token, and does not claim authorities it cannot know', async () => {
    secureMock().__store.set(`armillary.deviceToken.${HOST.id}`, 'tok');
    await renderEnrollment();
    expect(await screen.findByText('Enrolled')).toBeTruthy();

    // No route reports a principal's grants, so the enrolled copy must not
    // promise push — the engine would contradict it.
    expect(screen.queryByText(/you can push/i)).toBeNull();
    expect(screen.getByText(/decided on the host/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Remove token' }));
    expect(await screen.findByText('Not enrolled')).toBeTruthy();
    expect(await loadToken(HOST.id)).toBeNull();
  });
});
