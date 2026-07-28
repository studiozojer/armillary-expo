import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen, fireEvent } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { Text } from 'react-native';

import InstancesLayout from '../src/app/(tabs)/(instances)/_layout';
import Instances from '../src/app/(tabs)/(instances)/index';
import { HostProvider } from '../src/lib/host-context';
import type { Instance } from '../src/lib/session/events';
import type { SessionAPI } from '../src/lib/session/api';

/**
 * `useFocusEffect`'s real behaviour (expo-router/react-navigation) is to run
 * its callback whenever the screen becomes focused — including on first
 * mount — deferred until after commit, same as `useEffect`. Mocked here (same
 * trick session-screen.test.tsx and others use for router pieces) via a real
 * `useEffect` with an empty dependency array, so it fires exactly once per
 * mount, after render (not synchronously during it, which would call
 * `refresh()`'s `setState` mid-render and loop) — matching the
 * mount-is-a-focus behaviour the guard-against-double-fire test below
 * exercises. The callback is also stashed so a test can invoke it again
 * directly to simulate a *later* focus (e.g. returning to this tab).
 */
let focusCallback: (() => void) | undefined;
const mockUseFocusEffect = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      mockUseFocusEffect(callback);
      focusCallback = callback;
      ReactActual.useEffect(() => {
        callback();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, by design (see comment above).
      }, []);
    },
  };
});

function makeMockApi(overrides: Partial<SessionAPI> = {}): SessionAPI {
  return {
    list: jest.fn(async () => []),
    create: jest.fn(),
    attach: jest.fn(),
    subscribe: jest.fn(),
    send: jest.fn(),
    interrupt: jest.fn(),
    evict: jest.fn(),
    ...overrides,
  } as unknown as SessionAPI;
}

let mockApi: SessionAPI;
// Same trick session-screen.test.tsx and new-instance.test.tsx use: the
// screen calls `sessionAPIFor(host)` rather than constructing its own client.
jest.mock('../src/lib/session/instance', () => ({
  sessionAPIFor: () => mockApi,
}));

function instanceFor(id: string, operator: string | null): Instance {
  return { id, operator, stream: id, startedAt: new Date().toISOString(), lastSeq: 0 };
}

function RootLayout() {
  return (
    <HostProvider>
      <Stack />
    </HostProvider>
  );
}
function TabsLayout() {
  return <Stack />;
}
function NewStub() {
  return <Text>new-stub</Text>;
}
function SessionStub() {
  return <Text>session-stub</Text>;
}

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/(instances)/_layout': InstancesLayout,
  '(tabs)/(instances)/index': Instances,
  '(tabs)/(instances)/new': NewStub,
  '(tabs)/(instances)/[instanceId]': SessionStub,
};

describe('Instances list screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    focusCallback = undefined;
    mockUseFocusEffect.mockClear();
  });

  it('wires pull-to-refresh to the loader: pulling refetches the list', async () => {
    const list = jest.fn(async () => [instanceFor('inst-1', 'tycho')]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(1);

    const flatList = screen.getByTestId('instances-list');
    await act(async () => {
      fireEvent(flatList, 'refresh');
    });

    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does not double-fetch on first mount, but refetches on a later focus', async () => {
    const list = jest.fn(async () => [instanceFor('inst-1', 'tycho')]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    // useFocusEffect already fired once, synchronously, as part of mount
    // (the mock's factory calls it immediately, matching real navigation's
    // mount-is-a-focus behaviour) — that must not have produced a *second*
    // call to list() on top of useLoader's own mount-triggered fetch.
    expect(list).toHaveBeenCalledTimes(1);

    // A later focus (e.g. navigating back to this tab) must refetch.
    await act(async () => {
      focusCallback?.();
    });

    expect(list).toHaveBeenCalledTimes(2);
  });
});
