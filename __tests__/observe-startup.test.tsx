import { render } from '@testing-library/react-native';

import { ObserveStartup } from '../src/components/observe-startup';

let mockHostReady = false;
let mockAuthReady = false;
const mockMarker = jest.fn(() => null);

jest.mock('expo-observe', () => ({
  ObserveInteractiveMarker: () => mockMarker(),
}));
jest.mock('../src/lib/host-context', () => ({
  useHost: () => ({ ready: mockHostReady }),
}));
jest.mock('../src/lib/auth/auth-context', () => ({
  useAuth: () => ({ ready: mockAuthReady }),
}));

beforeEach(() => {
  mockMarker.mockClear();
});

it.each([
  [false, true, true],
  [true, false, true],
  [true, true, false],
])('waits when splash=%s, host=%s, auth=%s', async (splashHidden, hostReady, authReady) => {
  mockHostReady = hostReady;
  mockAuthReady = authReady;
  const view = await render(<ObserveStartup splashHidden={splashHidden} />);
  expect(mockMarker).not.toHaveBeenCalled();

  mockHostReady = true;
  mockAuthReady = true;
  await view.rerender(<ObserveStartup splashHidden />);
  expect(mockMarker).toHaveBeenCalled();
});
