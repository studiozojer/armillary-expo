import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, renderRouter, screen, fireEvent, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { ActionSheetIOS, StyleSheet, Text } from 'react-native';

import InstancesLayout from '../src/app/(tabs)/(instances)/_layout';
import Instances from '../src/app/(tabs)/(instances)/index';
import { HostProvider } from '../src/lib/host-context';
import type { Instance } from '../src/lib/session/events';
import type { SessionAPI } from '../src/lib/session/api';
import { families } from '../src/theme/fonts.gen';

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

/**
 * Answers whichever `ActionSheetIOS` sheet appears by picking the first of
 * `labels` it actually offers.
 *
 * Two different sheets now go through this one API — the filter picker and the
 * archive sheet — so a mock that answered by INDEX (`cb(0)`) would answer the
 * wrong sheet as confidently as the right one, and the assertion downstream
 * would read as a product bug. Selecting by label makes the mock name what it
 * is choosing, and throwing on a sheet that offers none of them turns a
 * mis-wired test into a message instead of a silent pass.
 */
function answerSheetWith(...labels: string[]) {
  return jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((opts, cb) => {
      const options = opts.options as string[];
      const index = options.findIndex((o) => labels.includes(o));
      if (index < 0) {
        throw new Error(
          `sheet offers [${options.join(', ')}], none of the expected [${labels.join(', ')}]`,
        );
      }
      cb(index);
    });
}

/**
 * Picks a state from the filter's pull-down menu.
 *
 * The menu is a real SwiftUI `Menu` (`@expo/ui/swift-ui`), not a mock: its
 * items render as host views carrying `label`/`systemImage`, and `onPress`
 * arrives as an `onButtonPress` view event. So these tests drive the actual
 * control rather than a stand-in — the thing that cannot be exercised here is
 * the *opening* of the menu, which is SwiftUI's own and not ours to test.
 *
 * `act` for the same reason the list's own interactions need it: changing the
 * filter changes FlatList's `data`, and VirtualizedList schedules post-update
 * bookkeeping that otherwise bleeds into the next test's `renderRouter`.
 */
async function chooseFilter(filter: 'active' | 'archived') {
  await act(async () => {
    fireEvent(screen.getByTestId(`instance-filter-${filter}`), 'buttonPress');
  });
}

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

  /**
   * The reported symptom: returning from an instance re-synced the list *and*
   * animated the RefreshControl open, sliding every row down. The re-sync is
   * wanted; the gesture's animation belongs to the gesture.
   *
   * Asserted mid-flight, with the second load deliberately unresolved — after
   * it settles `refreshing` is false either way, so an assertion at the end
   * would pass against both implementations and prove nothing.
   */
  it('re-syncs on a later focus without opening the pull-to-refresh spinner', async () => {
    let releaseSecondLoad: (instances: Instance[]) => void = () => {};
    const list = jest
      .fn<Promise<Instance[]>, []>()
      .mockResolvedValueOnce([instanceFor('a1', 'tycho')])
      .mockImplementationOnce(
        () =>
          new Promise<Instance[]>((resolve) => {
            releaseSecondLoad = resolve;
          }),
      );
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    await act(async () => {
      focusCallback?.();
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('instances-list').props.refreshing).toBe(false);

    await act(async () => {
      releaseSecondLoad([instanceFor('a1', 'tycho')]);
    });
  });

  /**
   * The same swap's second consequence, and the reason it is the right fix
   * rather than merely a quieter one: a re-read nobody asked for out loud must
   * not replace good content with an error screen when the network blips.
   */
  it('keeps the rows on screen when a focus re-read fails', async () => {
    const list = jest
      .fn<Promise<Instance[]>, []>()
      .mockResolvedValueOnce([instanceFor('a1', 'tycho')])
      .mockRejectedValueOnce(new Error('connection refused'));
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    await act(async () => {
      focusCallback?.();
    });

    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.queryByText("Can't reach the engine")).toBeNull();
  });

  /**
   * A decision-pin, not a proof: it fixes WHERE the bottom clearance comes
   * from, which is the part a future edit can silently undo. Whether the last
   * row actually clears iOS 26's floating capsule is a device question, and
   * only the walk answers it.
   *
   * The clearance used to be a flat 32pt constant, which is less than the
   * capsule plus the home indicator — so the final rows sat under the bar.
   * `automatic` hands the scroll view the tab controller's own inset instead
   * of us guessing a number; the padding that remains is breathing room on top
   * of that inset, not a substitute for it.
   */
  it('takes its bottom clearance from the platform, not from a constant', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('a1', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });
    const list = await screen.findByTestId('instances-list');

    expect(list.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(list.props.contentContainerStyle.paddingBottom).toBeLessThan(32);
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

    await chooseFilter('archived');
    expect(await screen.findByText('kepler')).toBeTruthy();
    expect(screen.queryByText('tycho')).toBeNull();
  });

  /**
   * The chevron used to promise a menu and deliver a toggle; then it delivered
   * a modal action sheet, which is the wrong idiom for a chevron (David,
   * 2026-08-13). It is an anchored pull-down now. Both states are offered by
   * name, and the current one carries the platform's checkmark — which is the
   * only thing telling you what is selected once the menu is open.
   */
  it('the filter offers both states by name, checkmarking the current one', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('a1', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });

    const active = await screen.findByTestId('instance-filter-active');
    const archived = screen.getByTestId('instance-filter-archived');
    expect(active.props.label).toBe('Active');
    expect(archived.props.label).toBe('Archived');
    expect(active.props.systemImage).toBe('checkmark');
    expect(archived.props.systemImage).toBeUndefined();

    await chooseFilter('archived');
    expect(screen.getByTestId('instance-filter-archived').props.systemImage).toBe('checkmark');
    expect(screen.getByTestId('instance-filter-active').props.systemImage).toBeUndefined();
  });

  /**
   * The studio owns the surface even though the platform owns the menu: the
   * trigger is embedded in SwiftUI via `RNHostView`, so it stays the same
   * `Inline`/`Text`/`Icon` composition in Whyte. `@expo/ui`'s universal
   * `Picker` was the alternative and has no label slot — it would have replaced
   * this with the system's own button, silently and without a test failing.
   */
  it('keeps the studio trigger — Whyte and our chevron, not a system button', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('a1', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });

    const label = await screen.findByText('Active');
    expect(
      (StyleSheet.flatten(label.props.style) as { fontFamily?: string }).fontFamily,
    ).toBe(families.whyte.book);
    expect(screen.getByTestId('instance-filter')).toBeTruthy();
  });

  /**
   * Moving the trigger inside SwiftUI's `Menu` cost it its accessibility
   * identity: `Inline` does not forward a11y props, so the control that used to
   * announce as a button with a described state became bare static text. Caught
   * on the device walk, in the read-back rather than the screenshot — an
   * `AXStaticText` where an `AXButton` had been.
   */
  it('the trigger still announces as a button naming the state it shows', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('a1', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });

    expect(
      await screen.findByRole('button', { name: 'Filter instances, showing active' }),
    ).toBeTruthy();

    await chooseFilter('archived');
    expect(screen.getByRole('button', { name: 'Filter instances, showing archived' })).toBeTruthy();
  });

  /**
   * A regression guard for a defect only the device could find, pinned here so
   * it cannot come back silently.
   *
   * `RNHostView` measures its children once on mount and a SwiftUI `Menu` label
   * slot keeps that measurement, so when the trigger read "Active" and then
   * became the wider "Archived", the chevron was pushed past the measured frame
   * and clipped. (Walked 2026-08-13: the frame stayed 0.146 of screen width
   * while the text grew to 0.142. A `key` remount was tried and did not
   * re-measure.) The trigger therefore renders an invisible copy of the longest
   * state name to hold its box open, which makes the width the same in every
   * state and the single measurement correct.
   *
   * Deleting the reserver would restore the bug and break nothing else.
   */
  it('reserves the widest state name in the trigger, so the chevron cannot be clipped', async () => {
    mockApi = makeMockApi({ list: jest.fn(async () => [instanceFor('a1', 'tycho')]) });

    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('instance-filter');

    // Present even though "Active" is the selected state — that is the point.
    const reserver = screen.getByText('Archived');
    expect((StyleSheet.flatten(reserver.props.style) as { opacity?: number }).opacity).toBe(0);
  });

  it('choosing the state already showing is a no-op, not a toggle', async () => {
    mockApi = makeMockApi({
      list: jest.fn(async () => [instanceFor('a1', 'tycho'), instanceFor('a2', 'kepler', true)]),
    });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    await chooseFilter('active');

    // A toggle would have flipped to Archived here. A menu holds.
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.queryByText('kepler')).toBeNull();
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
    const sheet = answerSheetWith('Archive');
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
    const sheet = answerSheetWith('Unarchive');
    const list = jest.fn(async () => [instanceFor('a2', 'kepler', true)]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('instance-filter-archived');
    await chooseFilter('archived');
    await fireEvent(await screen.findByRole('button', { name: /^kepler\./ }), 'longPress');

    expect(sheet).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Unarchive', 'Cancel'] }),
      expect.any(Function),
    );
    expect(mockApi.unarchive).toHaveBeenCalledWith('a2');
    sheet.mockRestore();
  });

  it('rows carry the operator roundel and how long ago the instance started', async () => {
    const instance: Instance = {
      id: 'inst-1',
      operator: 'tycho',
      stream: 'chat',
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
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
    expect(screen.getByText('3h ago')).toBeTruthy();
    // The stream/seq pair moved off the glance surface; it is still shown in
    // full on the instance panel.
    expect(screen.queryByText('chat · seq 12')).toBeNull();
  });

  // `live.ts` casts the wire JSON without validating it, so an engine that
  // omits or malforms `startedAt` reaches the row. The row must lose its
  // second line, not print `Invalid Date` where a time belongs.
  it('drops the note line entirely when startedAt cannot be parsed', async () => {
    const instance = { ...instanceFor('inst-1', 'tycho'), startedAt: 't' };
    mockApi = makeMockApi({ list: jest.fn(async () => [instance]) });

    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('tycho')).toBeTruthy();

    expect(screen.queryByText('Invalid Date')).toBeNull();
    expect(screen.queryByText(/ago/)).toBeNull();
  });

  // `SessionAPI.list()` is a raw passthrough of the engine's `/instances`, so
  // the order on screen is whatever the log happened to produce — oldest first
  // in practice. The screen sorts rather than reverses, so this survives the
  // engine changing its mind about ordering.
  it('shows the newest instance first, whatever order the engine returned', async () => {
    const at = (iso: string, operator: string): Instance => ({
      ...instanceFor(operator, operator),
      startedAt: iso,
    });
    const list = jest.fn(async () => [
      at('2026-08-01T00:00:00.000Z', 'oldest'),
      at('2026-08-13T00:00:00.000Z', 'newest'),
      at('2026-08-07T00:00:00.000Z', 'middle'),
    ]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('newest');

    const order = screen.getAllByText(/^(oldest|middle|newest)$/).map((n) => n.props.children);
    expect(order).toEqual(['newest', 'middle', 'oldest']);
  });

  it('sorts an unparseable startedAt to the bottom instead of scrambling the list', async () => {
    const list = jest.fn(async () => [
      { ...instanceFor('broken', 'broken'), startedAt: 't' },
      { ...instanceFor('dated', 'dated'), startedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    mockApi = makeMockApi({ list });

    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('dated');

    const order = screen.getAllByText(/^(broken|dated)$/).map((n) => n.props.children);
    expect(order).toEqual(['dated', 'broken']);
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
