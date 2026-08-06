import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SessionScreen from '../src/app/instance/[instanceId]';
import { MockSessionAPI } from '../src/lib/session/mock';
import type { SessionAPI } from '../src/lib/session/api';
import type { SubscriptionHandler } from '../src/lib/session/events';
import type { Host } from '../src/lib/hosts';
import { space } from '../src/theme';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

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

// `Stack.Screen` (from `expo-router/stack`, a separate module from the
// wholesale 'expo-router' mock above) registers per-screen options through a
// real navigator's context — rendered standalone (this file's whole approach;
// see the comment above) it throws "Couldn't find a route object". Mocked as
// a plain `Text` carrying the title, so the dynamic-title test below can
// assert on it the same way every other visible-row test in this file does,
// without pulling in a full `renderRouter` navigator just for one field.
jest.mock('expo-router/stack', () => {
  const { Text: RNText } = require('react-native');
  return {
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <RNText testID="stack-screen-title">{options.title}</RNText> : null,
    },
  };
});

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
    // `ActionSheetIOS.showActionSheetWithOptions` and `Alert.alert` are
    // spied directly on the shared `react-native` module objects (unlike
    // every other spy in this file, which targets a fresh per-test `api`
    // instance) — without restoring, a later test's `jest.spyOn(...)` call
    // returns the *same* accumulated spy rather than a fresh one, so its
    // `.mock.calls[0]` reads a prior test's call instead of its own.
    jest.restoreAllMocks();
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

    expect(await screen.findByText(/Couldn't reach the instance — no such instance: does-not-exist/)).toBeTruthy();
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    // Not duplicated by the send-error banner too.
    expect(screen.getAllByText(/no such instance: does-not-exist/)).toHaveLength(1);
  });

  it("sets the header title to @operator once attach resolves, and shows the instance's short id", async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    expect(await screen.findByTestId('stack-screen-title')).toHaveTextContent('@tycho');
    expect(screen.getByText(inst.id.slice(0, 8))).toBeTruthy();
  });

  it('titles a dispatcher-routed instance "dispatcher", not "@null" or blank', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create(null);
    mockInstanceId = inst.id;

    await render(<SessionScreen />);

    expect(await screen.findByTestId('stack-screen-title')).toHaveTextContent('dispatcher');
  });

  it('renders a failure-shaped assistant_message as a visible failure line naming the machine code, never a blank row', async () => {
    // Hand-rolled double (same style as use-session.test.tsx's scriptedApi):
    // no send() path in MockSessionAPI produces a failure-shaped turn — that's
    // armillary-engine's fail_turn (loop_.rs), not this app's mock — so this
    // test delivers the exact envelope shape directly via subscribe()'s handler.
    let handler!: SubscriptionHandler;
    const fakeApi: SessionAPI = {
      create: jest.fn(),
      list: jest.fn(),
      attach: jest.fn(async () => ({
        instance: {
          id: 'inst-err',
          operator: 'tycho',
          stream: 's-err',
          startedAt: '2026-07-28T00:00:00.000Z',
          lastSeq: 0,
        },
        earliestSeq: 1,
        headSeq: 0,
      })),
      subscribe: jest.fn((_stream: string, _fromSeq: number, h: SubscriptionHandler) => {
        handler = h;
        queueMicrotask(() => h.onStatus('live'));
        return () => {};
      }),
      send: jest.fn(),
      interrupt: jest.fn(),
      evict: jest.fn(),
    };
    mockApi = fakeApi;
    mockInstanceId = 'inst-err';

    await render(<SessionScreen />);
    await waitFor(() => expect(handler).toBeDefined());

    await act(async () => {
      handler.onEvent({
        stream: 's-err',
        id: 's-err:1:abc',
        seq: 1,
        ts: '2026-07-28T00:00:00.000Z',
        actor: { role: 'operator', instance: 'tycho' },
        type: 'assistant_message',
        version: 1,
        data: { text: '', generation: 'gen-1', interrupted: true, error: 'no_api_key' },
      });
    });

    expect(await screen.findByText('turn failed: no_api_key')).toBeTruthy();
  });

  it("gives the composer bottom clearance from the real safe-area inset, so it clears the native tab bar/home indicator", async () => {
    // Device-verified-only territory (see [instanceId].tsx's comment): this
    // asserts the composer's own static padding tracks whatever the OS
    // reports as the bottom safe-area inset, since that's the only lever
    // available with no `useBottomTabBarHeight()` equivalent for NativeTabs.
    // A real `SafeAreaProvider` with fixed `initialMetrics` (rather than
    // stubbing the hook's return value directly) exercises the actual
    // context path components read from, matching every other assertion in
    // this suite's preference for the real wiring over a hand-stubbed value.
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    await render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 59, left: 0, right: 0, bottom: 34 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}>
        <SessionScreen />
      </SafeAreaProvider>,
    );

    const composer = await screen.findByTestId('composer-row');
    const flatStyle = Object.assign({}, ...([composer.props.style].flat() as object[]));
    expect(flatStyle.paddingBottom).toBe(space.md + 34);
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

  it('long-press on a message opens the menu, and Copy puts the raw text on the clipboard', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    await mockApi.send(inst.id, 'hello there', 'seed');
    await jest.advanceTimersByTimeAsync(200);
    mockInstanceId = inst.id;

    const sheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    await render(<SessionScreen />);

    await fireEvent(await screen.findByText(CANNED_REPLY), 'longPress');

    expect(sheetSpy).toHaveBeenCalledTimes(1);
    const [config, onChoose] = sheetSpy.mock.calls[0];
    expect(config.options).toEqual(['Copy', 'Select text', 'Remove from context', 'Cancel']);
    expect(config.cancelButtonIndex).toBe(3);
    expect(config.destructiveButtonIndex).toBe(2);

    await act(async () => onChoose(0));
    // Raw text verbatim (spec decision 2) — the canned reply as stored.
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(CANNED_REPLY);
  });

  it('Remove from context survives the move behind the menu: confirm intact, evict called, row dims', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI({ fragmentDelayMs: 5 });
    const inst = await api.create('tycho');
    await api.send(inst.id, 'hello there', 'seed');
    await jest.advanceTimersByTimeAsync(200);
    const evictSpy = jest.spyOn(api, 'evict');
    mockApi = api as unknown as SessionAPI;
    mockInstanceId = inst.id;

    const sheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const alertSpy = jest.spyOn(Alert, 'alert');
    await render(<SessionScreen />);

    await fireEvent(await screen.findByText('hello there'), 'longPress');
    const [, onChoose] = sheetSpy.mock.calls[0];
    await act(async () => onChoose(2));

    // The existing confirm, verbatim — not skipped by the menu.
    expect(alertSpy).toHaveBeenCalledWith('Remove from context?', 'hello there', expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2]!;
    const remove = buttons.find((b) => b.text === 'Remove')!;
    await act(async () => {
      remove.onPress!();
      await jest.advanceTimersByTimeAsync(50);
    });

    expect(evictSpy).toHaveBeenCalledWith(inst.id, expect.any(String));
    // Two, not one: the evicted row's own dimmed caption, plus the durable
    // `context_evict` system row projectSession always appends alongside it
    // (project.ts) — both carry this exact label, pre-existing behavior this
    // menu doesn't touch.
    expect(await screen.findAllByText('removed from context')).toHaveLength(2);

    // The dimmed row still offers Copy and Select text — but not Remove.
    await fireEvent(screen.getByText('hello there'), 'longPress');
    const [evictedConfig] = sheetSpy.mock.calls[sheetSpy.mock.calls.length - 1];
    expect(evictedConfig.options).toEqual(['Copy', 'Select text', 'Cancel']);
    expect(evictedConfig.destructiveButtonIndex).toBeUndefined();
  });

  it('Select text opens the sheet with the full message selectable, and Done dismisses it', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    await mockApi.send(inst.id, 'hello there', 'seed');
    await jest.advanceTimersByTimeAsync(200);
    mockInstanceId = inst.id;

    const sheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    await render(<SessionScreen />);

    await fireEvent(await screen.findByText(CANNED_REPLY), 'longPress');
    const [, onChoose] = sheetSpy.mock.calls[0];
    await act(async () => onChoose(1));

    // Text now appears twice: the list row and the sheet's selectable copy.
    const copies = screen.getAllByText(CANNED_REPLY);
    expect(copies).toHaveLength(2);
    expect(copies.some((t) => t.props.selectable === true)).toBe(true);

    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getAllByText(CANNED_REPLY)).toHaveLength(1);
  });

  it('a streaming row offers no long-press menu', async () => {
    jest.useFakeTimers();
    mockApi = new MockSessionAPI({ fragmentDelayMs: 10 }) as unknown as SessionAPI;
    const inst = await (mockApi as MockSessionAPI).create('tycho');
    mockInstanceId = inst.id;

    const sheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    await render(<SessionScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'go');
    await fireEvent.press(screen.getByText('Send'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15);
    });

    // Mid-stream snapshot (same instant the existing streaming test pins).
    await fireEvent(screen.getByText('the…'), 'longPress');
    expect(sheetSpy).not.toHaveBeenCalled();
  });

  it('on Android the menu is an Alert with three buttons and tap-outside cancel', async () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      jest.useFakeTimers();
      mockApi = new MockSessionAPI({ fragmentDelayMs: 5 }) as unknown as SessionAPI;
      const inst = await (mockApi as MockSessionAPI).create('tycho');
      await mockApi.send(inst.id, 'hello there', 'seed');
      await jest.advanceTimersByTimeAsync(200);
      mockInstanceId = inst.id;

      const alertSpy = jest.spyOn(Alert, 'alert');
      await render(<SessionScreen />);
      await fireEvent(await screen.findByText('hello there'), 'longPress');

      const [, , buttons, options] = alertSpy.mock.calls[0];
      expect(buttons!.map((b) => b.text)).toEqual(['Copy', 'Select text', 'Remove from context']);
      expect(options).toEqual({ cancelable: true });
    } finally {
      replaced.restore();
    }
  });
});
