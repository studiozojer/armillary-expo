import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, renderRouter, screen, fireEvent, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { ActionSheetIOS, Text } from 'react-native';

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
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useRouter: () => ({ ...actual.useRouter(), push: mockPush }),
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
    archive: jest.fn(async () => {}),
    unarchive: jest.fn(async () => {}),
    ...overrides,
  } as unknown as SessionAPI;
}

let mockApi: SessionAPI;
// Same trick session-screen.test.tsx and new-instance.test.tsx use: the
// screen calls `sessionAPIFor(host)` rather than constructing its own client.
jest.mock('../src/lib/session/instance', () => ({
  sessionAPIFor: () => mockApi,
}));

function instanceFor(id: string, operator: string | null, archived = false): Instance {
  return {
    id,
    operator,
    stream: id,
    startedAt: new Date().toISOString(),
    lastSeq: 0,
    model: null,
    mayWriteComposition: false,
    archived,
  };
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
  'instance/[instanceId]': SessionStub,
};

describe('Instances list screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    focusCallback = undefined;
    mockUseFocusEffect.mockClear();
    mockPush.mockClear();
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

  it('the create pill opens the sheet', async () => {
    const list = jest.fn(async () => [instanceFor('inst-1', 'tycho')]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    fireEvent.press(screen.getByTestId('create-pill'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/(instances)/new');
  });

  it('the create pill is present but disabled on the error state', async () => {
    const list = jest.fn(async () => {
      throw new Error('unreachable');
    });
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText("Can't reach the engine")).toBeTruthy();

    const pill = screen.getByTestId('create-pill');
    expect(pill.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(pill);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('chrome renders on both states', async () => {
    const list = jest.fn(async () => [instanceFor('inst-1', 'tycho')]);
    mockApi = makeMockApi({ list });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    await act(async () => cleanup());

    const errorList = jest.fn(async () => {
      throw new Error('unreachable');
    });
    mockApi = makeMockApi({ list: errorList });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText("Can't reach the engine")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('the overflow is announced disabled', async () => {
    const list = jest.fn(async () => [instanceFor('inst-1', 'tycho')]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    expect(screen.getByTestId('more-stub').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('hides archived instances by default and shows them under the Archived filter', async () => {
    const list = jest.fn(async () => [
      instanceFor('a1', 'tycho'),
      instanceFor('a2', 'kepler', true),
    ]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();
    expect(screen.queryByText('kepler')).toBeNull();

    // Wrapped in `act` (not a bare `fireEvent.press`): a filter toggle
    // changes FlatList's `data`, and VirtualizedList's own post-update
    // bookkeeping schedules a timer of its own. Left unflushed, this was
    // observed to bleed into the next test's `renderRouter` (which re-arms
    // fake timers on every call — see
    // https://github.com/expo/expo/issues/46864 — colliding with the
    // still-pending one here).
    await act(async () => {
      fireEvent.press(screen.getByTestId('instance-filter'));
    });
    expect(await screen.findByText('kepler')).toBeTruthy();
    expect(screen.queryByText('tycho')).toBeNull();
  });

  it('shows an instance in the default Active view when `archived` is absent from the wire payload', async () => {
    // `Instance.archived` is a compile-time claim only — an older engine
    // omits the key entirely. `live.ts` casts the JSON without validation, so
    // this simulates that shape rather than assuming the field is always
    // present. `false === undefined` would blank the default Active view;
    // this pins that it must not.
    const instance = instanceFor('a1', 'tycho');
    delete (instance as { archived?: boolean }).archived;
    const list = jest.fn(async () => [instance]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();
  });

  it('long-press offers Archive with no confirm, calls the API, and refreshes', async () => {
    // D4: no confirmation dialog — the sheet's Archive acts immediately.
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_opts, cb) => cb(0));
    const list = jest.fn(async () => [instanceFor('a1', 'tycho')]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    await fireEvent(await screen.findByRole('button', { name: /^tycho\./ }), 'longPress');

    expect(sheet).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Archive', 'Cancel'] }),
      expect.any(Function),
    );
    expect(mockApi.archive).toHaveBeenCalledWith('a1');
    // initial load + the post-archive refresh
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    sheet.mockRestore();
  });

  it('long-press in the Archived view offers Unarchive', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_opts, cb) => cb(0));
    const list = jest.fn(async () => [instanceFor('a2', 'kepler', true)]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    // Same `act` wrap as the filter test above, and for the same reason.
    await act(async () => {
      fireEvent.press(await screen.findByTestId('instance-filter'));
    });
    await fireEvent(await screen.findByRole('button', { name: /^kepler\./ }), 'longPress');

    expect(sheet).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Unarchive', 'Cancel'] }),
      expect.any(Function),
    );
    expect(mockApi.unarchive).toHaveBeenCalledWith('a2');
    sheet.mockRestore();
  });

  it('rows carry the operator roundel and the honest note line', async () => {
    const instance: Instance = {
      id: 'inst-1',
      operator: 'tycho',
      stream: 'chat',
      startedAt: new Date().toISOString(),
      lastSeq: 12,
      model: null,
      mayWriteComposition: false,
      archived: false,
    };
    const list = jest.fn(async () => [instance]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    expect(screen.getByText('t', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('chat · seq 12')).toBeTruthy();
  });

  it('names the model piloting an instance, and says so when it is the default', async () => {
    const instances: Instance[] = [
      {
        id: 'i1',
        operator: 'tycho',
        stream: 'i1',
        startedAt: '2026-08-07T00:00:00.000Z',
        lastSeq: 3,
        model: 'zen/deepseek-v4-flash',
        mayWriteComposition: false,
        archived: false,
      },
      {
        id: 'i2',
        operator: null,
        stream: 'i2',
        startedAt: '2026-08-07T00:00:00.000Z',
        lastSeq: 1,
        model: null,
        mayWriteComposition: false,
        archived: false,
      },
    ];
    const list = jest.fn(async () => instances);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('zen/deepseek-v4-flash')).toBeTruthy();

    expect(screen.getByText('engine default')).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('pushes the chat at its root-level path, above the tab bar', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('inst-7', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });

    // By role, not by text: the card's press target is `CardRow`'s Pressable,
    // which sets `accessibilityRole="button"` when given an `onPress` and is
    // handed no testID by `InstanceCard`.
    //
    // Matched by regex, not by the bare operator name: CardRow composes its
    // accessible name as `${label}. ${note}`, so this row announces as
    // "tycho. inst-7 · seq 0". `name: 'tycho'` compares exactly and finds
    // nothing. Anchored at the start so it stays about the operator and does
    // not silently depend on the note line, which is the slot a topic and
    // token metrics take over once the engine serves them.
    await fireEvent.press(await screen.findByRole('button', { name: /^tycho\./ }));

    // `/instance/<id>`, not `/(tabs)/(instances)/<id>`: the chat is registered
    // on the ROOT stack, so the tab bar is part of the outgoing screen and
    // leaves with the push. A rename that silently reverted this would show up
    // here and nowhere else — the bar itself is invisible to jest (every suite
    // stubs `(tabs)/_layout` as a plain `Stack`, because NativeTabs is native).
    expect(mockPush).toHaveBeenCalledWith('/instance/inst-7');
  });
});
