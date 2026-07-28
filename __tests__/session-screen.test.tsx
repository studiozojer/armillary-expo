import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SessionScreen from '../src/app/(tabs)/(instances)/[instanceId]';
import { MockSessionAPI } from '../src/lib/session/mock';
import type { SessionAPI } from '../src/lib/session/api';
import type { Host } from '../src/lib/hosts';

// The screen calls `sessionAPIFor(host)` rather than constructing its own
// MockSessionAPI (Task 5's shared-store requirement, Task 15's host-aware
// factory). Mocked so each test can point it at a freshly configured
// instance regardless of which host object the screen's `useHost()` mock
// hands back. A jest.fn (rather than a bare closure) so the host-switch test
// below can give it a per-host implementation instead of one fixed return.
let mockApi: SessionAPI;
const mockSessionAPIFor = jest.fn((_host: Host) => mockApi);
jest.mock('../src/lib/session/instance', () => ({
  sessionAPIFor: (host: Host) => mockSessionAPIFor(host),
}));

// `useHost()` backs the screen's `useMemo(() => sessionAPIFor(host), ...)`
// and its `ready` gate. A mutable value (read fresh on every call, like the
// `sessionAPI`/`sessionAPIFor` getter above) rather than a fixed object, so
// one test below can flip `ready` mid-test and rerender — most tests just
// leave it at the default (already-ready) and never touch it.
let mockHostValue = {
  host: { id: 'test-host', label: 'test', daemonUrl: 'http://test:7778', inboxUrl: 'http://test:7777' },
  hosts: [] as { id: string; label: string; daemonUrl: string; inboxUrl: string }[],
  setHost: () => {},
  generation: 0,
  ready: true,
};
jest.mock('../src/lib/host-context', () => ({
  useHost: () => mockHostValue,
}));

// Similarly for the route param: the screen reads `instanceId` via
// `useLocalSearchParams`, mocked directly rather than routed through
// `expo-router/testing-library`'s full navigator (this screen owns no
// navigation logic worth exercising through a real Stack).
let mockInstanceId: string;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ instanceId: mockInstanceId }),
}));

const CANNED_REPLY = 'the log remembers what actually happened here, not what was meant.';

describe('Session screen', () => {
  beforeEach(async () => {
    // Every test's first `create()` on a fresh MockSessionAPI gets the same
    // id ('inst-mock-1') since its counter restarts at 0 — so a leftover
    // scrollback cache from a prior test would otherwise bleed into this
    // one's render (use-session.ts hydrates from AsyncStorage before the
    // live subscription delivers anything).
    await AsyncStorage.clear();
    // Reset in case a prior test flipped `ready` and didn't restore it.
    mockHostValue = { ...mockHostValue, ready: true };
    mockSessionAPIFor.mockReset();
    mockSessionAPIFor.mockImplementation(() => mockApi);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders fixture messages already in the log', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    await mockApi.send(inst.id, 'hello there', 'seed');
    await jest.advanceTimersByTimeAsync(200);
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(screen.getByText(CANNED_REPLY)).toBeTruthy();
  });

  it('composer send shows the text immediately as a pending row', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    // Each fireEvent call is awaited in turn — bundling both inside one
    // act() without awaiting the first meant the second fired against a
    // stale onPress closure captured before the changeText re-render
    // committed, silently no-opping (draft still '' in that closure).
    await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'ping');
    await fireEvent.press(screen.getByText('Send'));

    expect(screen.getByText('ping')).toBeTruthy();
  });

  it('shows a streaming row updating and a Stop affordance during generation, then exactly one copy after settling', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 10 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'go');
    await fireEvent.press(screen.getByText('Send'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15);
    });

    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.getByText('the…')).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    // Supersession pinned at the UI layer: the streaming snapshot must not
    // survive alongside the durable final text.
    expect(screen.getAllByText(CANNED_REPLY)).toHaveLength(1);
    expect(screen.queryByText('Stop')).toBeNull();
  });

  it('shows a gap row naming the missing range for a session with a truncated log', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ earliestSeq: 5, fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    await render(<SessionScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(await screen.findByText(/before seq 5/)).toBeTruthy();
  });

  it('holds off attaching until the host is ready, then loads once it flips true', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI({ fragmentDelayMs: 5 });
    const attachSpy = jest.spyOn(api, 'attach');
    mockApi = api as unknown as SessionAPI;
    const inst = await api.create('tycho');
    await api.send(inst.id, 'hello there', 'seed');
    await jest.advanceTimersByTimeAsync(200);
    mockInstanceId = inst.id;

    // Models the cold-launch window: the stored host hasn't hydrated yet.
    mockHostValue = { ...mockHostValue, ready: false };
    const { rerender } = await render(<SessionScreen />);

    expect(attachSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('hello there')).toBeNull();

    // The host resolves — `ready` flips, and the screen re-renders.
    mockHostValue = { ...mockHostValue, ready: true };
    await act(async () => {
      rerender(<SessionScreen />);
    });

    expect(attachSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('hello there')).toBeTruthy();
  });

  it('remounts and re-subscribes fresh against the new host on a mid-session host switch', async () => {
    jest.useFakeTimers();

    const apiA = new MockSessionAPI({ fragmentDelayMs: 5 });
    const instA = await apiA.create('tycho');
    // Wrap subscribe so its returned unsubscribe is observable — the point
    // of this test is that the *old* host's subscription gets torn down,
    // not merely that a new one starts.
    const unsubSpyA = jest.fn();
    const realSubscribeA = apiA.subscribe.bind(apiA);
    jest.spyOn(apiA, 'subscribe').mockImplementation((stream, fromSeq, handler) => {
      const unsub = realSubscribeA(stream, fromSeq, handler);
      return () => {
        unsubSpyA();
        unsub();
      };
    });

    const apiB = new MockSessionAPI({ fragmentDelayMs: 5 });
    // Same counter start as apiA (each MockSessionAPI's own counter begins
    // at 0), so this instance shares the id the screen is already attached
    // to under host A.
    await apiB.create('tycho');
    const attachSpyB = jest.spyOn(apiB, 'attach');
    const subscribeSpyB = jest.spyOn(apiB, 'subscribe');

    const hostA = { id: 'host-a', label: 'a', daemonUrl: 'http://a', inboxUrl: 'http://a' };
    const hostB = { id: 'host-b', label: 'b', daemonUrl: 'http://b', inboxUrl: 'http://b' };
    mockSessionAPIFor.mockImplementation((host: Host) =>
      host.id === hostB.id ? (apiB as unknown as SessionAPI) : (apiA as unknown as SessionAPI),
    );
    mockApi = apiA as unknown as SessionAPI;
    mockInstanceId = instA.id;
    mockHostValue = { ...mockHostValue, host: hostA, generation: 0 };

    const { rerender } = await render(<SessionScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(subscribeSpyB).not.toHaveBeenCalled();
    expect(unsubSpyA).not.toHaveBeenCalled();

    // Switch hosts mid-session.
    mockHostValue = { ...mockHostValue, host: hostB, generation: 1 };
    await act(async () => {
      rerender(<SessionScreen />);
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(unsubSpyA).toHaveBeenCalled();
    expect(attachSpyB).toHaveBeenCalledTimes(1);
    expect(subscribeSpyB).toHaveBeenCalledTimes(1);
  });

  it('names the refusal distinctly when attach() fails, rather than showing "Reconnecting…"', async () => {
    mockApi = new MockSessionAPI() as unknown as SessionAPI;
    // No instance created — MockSessionAPI.attach() rejects for an unknown id.
    mockInstanceId = 'does-not-exist';

    await render(<SessionScreen />);

    expect(await screen.findByText(/Couldn't reach the session — no such instance: does-not-exist/)).toBeTruthy();
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    // Not duplicated by the send-error banner too.
    expect(screen.getAllByText(/no such instance: does-not-exist/)).toHaveLength(1);
  });

  it('restores the draft text after a rejected send rather than losing it', async () => {
    const api = new MockSessionAPI({ fragmentDelayMs: 5 });
    const inst = await api.create('tycho');
    jest.spyOn(api, 'send').mockRejectedValueOnce(new Error('refused: instance busy'));
    mockApi = api as unknown as SessionAPI;
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'important draft');
    await act(async () => {
      await fireEvent.press(screen.getByText('Send'));
    });

    expect(await screen.findByDisplayValue('important draft')).toBeTruthy();
    expect(screen.getByText(/refused: instance busy/)).toBeTruthy();
  });
});
