import { fireEvent, render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';

import { PushDoorbell } from '../src/components/push-doorbell';

// Pin the projectId rather than inheriting whatever jest-expo surfaces from
// app.json — the no-project test below rewrites it, and a test order that
// depended on the real manifest would break the moment the id rotates.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-under-test' } } } },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

function notificationsMock() {
  return jest.requireMock('expo-notifications') as {
    getPermissionsAsync: jest.Mock;
    requestPermissionsAsync: jest.Mock;
    getExpoPushTokenAsync: jest.Mock;
  };
}

function clipboardMock() {
  return jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-seed the setup-file defaults that clearAllMocks wipes.
  notificationsMock().getPermissionsAsync.mockImplementation(async () => ({
    status: 'undetermined',
  }));
  notificationsMock().requestPermissionsAsync.mockImplementation(async () => ({
    status: 'denied',
  }));
  notificationsMock().getExpoPushTokenAsync.mockImplementation(async () => ({
    data: 'ExponentPushToken[jest]',
  }));
  (Constants as { expoConfig: unknown }).expoConfig = {
    extra: { eas: { projectId: 'proj-under-test' } },
  };
});

describe('<PushDoorbell>', () => {
  it('offers the one-shot ask while permission is undetermined, and never fetches a token', async () => {
    await render(<PushDoorbell />);
    expect(await screen.findByTestId('push-undetermined')).toBeTruthy();
    // The iOS prompt is spendable exactly once, so mount must read, not ask.
    expect(notificationsMock().requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notificationsMock().getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('reports a denial as terminal instead of re-offering a button that cannot work', async () => {
    await render(<PushDoorbell />);
    fireEvent.press(await screen.findByTestId('push-enable'));
    expect(await screen.findByTestId('push-denied')).toBeTruthy();
    expect(notificationsMock().requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('shows the token when permission is already granted, minted against the configured project', async () => {
    notificationsMock().getPermissionsAsync.mockImplementation(async () => ({
      status: 'granted',
    }));
    await render(<PushDoorbell />);
    expect(await screen.findByText('ExponentPushToken[jest]')).toBeTruthy();
    expect(notificationsMock().getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'proj-under-test',
    });
  });

  it('copies the token — the whole distribution mechanism — and says it did', async () => {
    notificationsMock().getPermissionsAsync.mockImplementation(async () => ({
      status: 'granted',
    }));
    await render(<PushDoorbell />);
    fireEvent.press(await screen.findByTestId('push-copy'));
    expect(clipboardMock().setStringAsync).toHaveBeenCalledWith('ExponentPushToken[jest]');
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('names the missing EAS project rather than surfacing a library rejection', async () => {
    (Constants as { expoConfig: unknown }).expoConfig = { extra: {} };
    await render(<PushDoorbell />);
    expect(await screen.findByTestId('push-no-project')).toBeTruthy();
    expect(notificationsMock().getPermissionsAsync).not.toHaveBeenCalled();
  });
});
