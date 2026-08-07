import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text } from 'react-native';

import InstancesLayout from '../src/app/(tabs)/(instances)/_layout';
import Instances from '../src/app/(tabs)/(instances)/index';
import New from '../src/app/(tabs)/(instances)/new';
import { HostProvider } from '../src/lib/host-context';
import type { ModelCatalog } from '../src/lib/daemon/types';
import type { Instance } from '../src/lib/session/events';
import type { SessionAPI } from '../src/lib/session/api';

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

/** Full `SessionAPI` shape with harmless defaults, so each test only spells
 *  out the method it actually cares about. */
function makeMockApi(overrides: Partial<SessionAPI> = {}): SessionAPI {
  return {
    list: jest.fn(async () => []),
    create: jest.fn(async () => {
      throw new Error('create() not stubbed for this test');
    }),
    attach: jest.fn(),
    subscribe: jest.fn(),
    send: jest.fn(),
    interrupt: jest.fn(),
    evict: jest.fn(),
    ...overrides,
  } as unknown as SessionAPI;
}

let mockApi: SessionAPI;
// Same trick session-screen.test.tsx uses: both the Instances list and the
// new-instance sheet call `sessionAPIFor(host)` rather than constructing
// their own client, so mocking the factory gives one controllable object
// both screens see.
jest.mock('../src/lib/session/instance', () => ({
  sessionAPIFor: () => mockApi,
}));

function instanceFor(id: string, operator: string | null, model: string | null = null): Instance {
  return { id, operator, stream: id, startedAt: new Date().toISOString(), lastSeq: 0, model };
}

/** Stands in for the session screen at the navigation destination. This
 *  suite is about the create-then-navigate contract, not session rendering
 *  (session-screen.test.tsx already owns that). */
function SessionStub() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  return <Text>{`session:${instanceId}`}</Text>;
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

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/(instances)/_layout': InstancesLayout,
  '(tabs)/(instances)/index': Instances,
  '(tabs)/(instances)/new': New,
  'instance/[instanceId]': SessionStub,
};

/** Set by `renderSheet` on every call, so a test can assert on the exact
 *  `(operator, model)` pair `create()` was called with without threading the
 *  spy through its return value. */
let createSpy: jest.Mock;

/**
 * `renderSheet` extends the harness the rest of this suite already uses
 * (`mockApi` + a `globalThis.fetch` stub keyed on the path) rather than
 * building a second one, per the brief. It fixes the composition response to
 * an empty operator list — these tests are about the model row, not the
 * operator one — and adds a `/models` branch driven by `models`/`modelsError`.
 *
 * Not in the brief's sketch: the sketch calls `renderSheet` synchronously
 * (`const { getByTestId } = renderSheet(...)`), but rendering a route is
 * async in this harness (`renderRouter` and the initial `findByText` both
 * need awaiting) — every other test in this file awaits `renderRouter`
 * before touching `screen`. Made `renderSheet` async and every call site
 * awaits it; the returned object is `screen` itself, since that already
 * carries `getByTestId`/`getByText`/`findByText`/`queryByText`.
 */
async function renderSheet(options: { models?: ModelCatalog; modelsError?: Error } = {}) {
  createSpy = jest.fn(async (operator: string | null, model: string | null) =>
    instanceFor('inst-model', operator, model),
  );
  mockApi = makeMockApi({ create: createSpy });

  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/composition')) {
      return jsonResponse(200, {
        operators: [],
        commons: [],
        repos: [],
        protocols: [],
        manifests: [],
        protocol_sources: [],
      });
    }
    if (url.includes('/models')) {
      if (options.modelsError) return jsonResponse(404, options.modelsError.message);
      return jsonResponse(200, options.models ?? { default: null, models: [] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;

  await renderRouter(routes, { initialUrl: '/new' });
  await screen.findByText('Dispatcher');

  return screen;
}

describe('New instance sheet', () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders Dispatcher collapsed, expands to the composed operators on tap, and Create with an operator selected calls create(name) and navigates', async () => {
    mockApi = makeMockApi({ create: jest.fn(async (operator: string | null) => instanceFor('inst-42', operator)) });
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/composition')) {
        return jsonResponse(200, {
          operators: [
            { name: 'tycho', path: 'operators/tycho' },
            { name: 'kepler', path: 'operators/kepler' },
          ],
          commons: [],
          repos: [],
          protocols: [],
          manifests: [],
          protocol_sources: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/new' });

    expect(await screen.findByText('Dispatcher')).toBeTruthy();
    expect(screen.queryByText('tycho')).toBeNull();

    await fireEvent.press(screen.getByTestId('operator-row'));
    expect(await screen.findByText('tycho')).toBeTruthy();
    expect(screen.getByText('kepler')).toBeTruthy();

    await fireEvent.press(screen.getByText('tycho'));
    // Picking collapses the accordion again — the other option is gone.
    expect(screen.queryByText('kepler')).toBeNull();

    await fireEvent.press(screen.getByText('Create'));

    expect(await screen.findByText('session:inst-42')).toBeTruthy();
    // Second arg is the model — Task 7's picker is what will send a real
    // selection; this screen still always passes null (see new.tsx).
    expect(mockApi.create).toHaveBeenCalledWith('tycho', null);
  });

  it('creates with Dispatcher (null) when Create is pressed without picking an operator, since Dispatcher starts preselected', async () => {
    mockApi = makeMockApi({ create: jest.fn(async (operator: string | null) => instanceFor('inst-1', operator)) });
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/composition')) {
        return jsonResponse(200, {
          operators: [],
          commons: [],
          repos: [],
          protocols: [],
          manifests: [],
          protocol_sources: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/new' });
    await screen.findByText('Dispatcher');

    await fireEvent.press(screen.getByText('Create'));

    expect(await screen.findByText('session:inst-1')).toBeTruthy();
    expect(mockApi.create).toHaveBeenCalledWith(null, null);
  });

  it('still offers a working Dispatcher row and names the refusal when the composition load fails', async () => {
    mockApi = makeMockApi({ create: jest.fn(async (operator: string | null) => instanceFor('inst-9', operator)) });
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/composition')) return jsonResponse(404, 'not composed');
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/new' });

    expect(await screen.findByText('Dispatcher')).toBeTruthy();
    expect(await screen.findByText(/Couldn't load operators/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Create'));

    expect(await screen.findByText('session:inst-9')).toBeTruthy();
    expect(mockApi.create).toHaveBeenCalledWith(null, null);
  });

  it('names the refusal and stays open, with Create re-enabled, when create() rejects — no navigation', async () => {
    mockApi = makeMockApi({
      create: jest.fn(async () => {
        throw new Error('daemon unreachable');
      }),
    });
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/composition')) {
        return jsonResponse(200, {
          operators: [],
          commons: [],
          repos: [],
          protocols: [],
          manifests: [],
          protocol_sources: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/new' });
    await screen.findByText('Dispatcher');

    await fireEvent.press(screen.getByText('Create'));

    expect(await screen.findByText(/daemon unreachable/)).toBeTruthy();
    expect(screen.queryByText(/^session:/)).toBeNull();
    // Re-enabled, not stuck on a disabled "Creating…" label.
    expect(screen.getByText('Create')).toBeTruthy();

    // And it isn't a dead end: pressing again still works once whatever was
    // wrong is fixed.
    mockApi.create = jest.fn(async () => instanceFor('inst-10', null));
    await fireEvent.press(screen.getByText('Create'));
    expect(await screen.findByText('session:inst-10')).toBeTruthy();
  });

  it('the create pill on Instances opens the new-instance sheet', async () => {
    mockApi = makeMockApi();
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/composition')) {
        return jsonResponse(200, {
          operators: [],
          commons: [],
          repos: [],
          protocols: [],
          manifests: [],
          protocol_sources: [],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/' });

    await fireEvent.press(await screen.findByLabelText('Create new instance'));

    expect(await screen.findByText('Dispatcher')).toBeTruthy();
  });

  // Superseded by the picker below (Task 7): the row is no longer a
  // permanently-disabled `View` — it expands like the operator row above it.
  // Kept, renamed and re-pointed at `model-row`, because the fact it asserts
  // — an unreadable/empty catalog reads as "engine default", stated
  // honestly rather than left blank — still holds and is still worth a name
  // of its own, separate from the fallback test below (which is specifically
  // about a catalog that errors, not one that is merely empty).
  it('the model row starts on "engine default" when the catalog is empty, following the operator row pattern', async () => {
    const { getByTestId } = await renderSheet({ models: { default: null, models: [] } });

    const row = getByTestId('model-row');
    expect(row.props.accessibilityLabel).toBe('Model, engine default');
  });

  // Fix 1's empty-accordion case. `modelRows` used to be `catalog?.models ?? []`
  // outright, so an empty catalog expanded the row onto NOTHING — a chevron
  // opening onto a broken state, exactly what the design promised the
  // fallback would never be. The synthetic "engine default" row must always
  // be present, so expanding shows exactly one row, not zero. Distinguished
  // from the collapsed caption above (which also reads "engine default") via
  // `getByLabelText` — the row's own accessibilityLabel is bare `'engine
  // default'`, while the collapsed Pressable's is `'Model, engine default'`.
  it('expanding the model row with no catalog shows exactly one row, not an empty accordion', async () => {
    const { getByTestId, getByLabelText, queryAllByText } = await renderSheet({
      models: { default: null, models: [] },
    });

    await fireEvent.press(getByTestId('model-row'));

    expect(getByLabelText('engine default')).toBeTruthy();
    // Exactly one occurrence of the row's own label, plus the collapsed
    // caption already on screen — two total, not more (no phantom rows) and
    // not one (the empty-accordion bug this test pins).
    expect(queryAllByText('engine default')).toHaveLength(2);
  });

  // Fix 1's tri-state regression guard: choosing "engine default" explicitly
  // must send `null`, even when the catalog's own `default` is a real model —
  // this is exactly the case a naive `model ?? catalog?.default` fix would
  // get wrong, since a row that sets `model` back to `null` would be
  // indistinguishable from "nothing chosen" and the catalog default would
  // win regardless of the tap.
  it('choosing "engine default" explicitly sends null even though the catalog declares a non-null default', async () => {
    const { getByTestId, getByLabelText, getByText } = await renderSheet({
      models: {
        default: 'claude-sonnet-5',
        models: [{ id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', usable: true }],
      },
    });

    await fireEvent.press(getByTestId('model-row'));
    await fireEvent.press(getByLabelText('engine default'));
    await fireEvent.press(getByText('Create'));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(null, null));
  });

  it('creates with the chosen model', async () => {
    const { getByTestId, getByText, findByText } = await renderSheet({
      models: {
        default: 'claude-sonnet-5',
        models: [
          { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', usable: true },
          { id: 'zen/deepseek-v4-flash', label: 'DeepSeek Flash', provider: 'zen', usable: true },
        ],
      },
    });

    // `await` on every press, matching the convention the operator-row test
    // above already sets (`await fireEvent.press(screen.getByText('tycho'))`)
    // rather than the brief's sketch, which fires all three presses
    // synchronously back to back. Un-awaited, the second press (picking
    // DeepSeek Flash) and the third (Create) land in the same batch: `onCreate`
    // is still the closure from the pre-selection render, so it reads the
    // catalog's default rather than the pick — measured by adding a debug log
    // to `onCreate`, which printed the default model, not the picked one,
    // when the presses weren't awaited. `await`ing a non-promise still yields
    // a microtask turn, which is enough for the state update to commit before
    // the next press reads it.
    await fireEvent.press(getByTestId('model-row'));
    await fireEvent.press(await findByText('DeepSeek Flash'));
    await fireEvent.press(getByText('Create'));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(null, 'zen/deepseek-v4-flash'));
  });

  // Not one of the brief's three required tests, but the behaviour it
  // documents in prose ("entries with usable: false render disabled with the
  // reason named — not silently greyed") had no assertion anywhere, and it's
  // the other half of what makes the picker honest rather than just present.
  it('names the reason and refuses the tap for a model the engine cannot use', async () => {
    const { getByTestId, getByText, findByText, queryByText } = await renderSheet({
      models: {
        default: 'claude-sonnet-5',
        models: [
          { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', usable: true },
          { id: 'zen/deepseek-v4-flash', label: 'DeepSeek Flash', provider: 'zen', usable: false },
        ],
      },
    });

    await fireEvent.press(getByTestId('model-row'));
    const unusableRow = await findByText('DeepSeek Flash');
    expect(queryByText('zen/deepseek-v4-flash — no key on this engine')).toBeTruthy();

    await fireEvent.press(unusableRow);
    // Refused: still expanded (a successful pick collapses the accordion —
    // see the "creates with the chosen model" test above), and Create still
    // carries the catalog default, not the row that was tapped.
    expect(queryByText('DeepSeek Flash')).toBeTruthy();

    await fireEvent.press(getByText('Create'));
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(null, 'claude-sonnet-5'));
  });

  it('defaults to the catalog default', async () => {
    const { getByText, findByText } = await renderSheet({
      models: {
        default: 'zen/deepseek-v4-flash',
        models: [
          { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', usable: true },
          { id: 'zen/deepseek-v4-flash', label: 'DeepSeek Flash', provider: 'zen', usable: true },
        ],
      },
    });

    // The catalog lands after first render, and the selection is derived
    // rather than latched by an effect — `model ?? catalog?.default ?? null`
    // (new.tsx) recomputes on every render, so a later-arriving catalog
    // still wins when nothing was explicitly picked. Waiting for the
    // collapsed row to actually show the default's label is what makes this
    // test about the default applying, rather than a race against whether
    // the fetch resolved before Create was pressed.
    await findByText('DeepSeek Flash');
    await fireEvent.press(getByText('Create'));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(null, 'zen/deepseek-v4-flash'));
  });

  it('keeps Create working when the catalog cannot be read', async () => {
    // The rule this screen already documents for the operator list: the
    // catalog is decoration, not load-bearing. An engine too old to serve
    // /models takes this same path, which is what lets the app ship first.
    const { getByTestId, getByText } = await renderSheet({ modelsError: new Error('404 Not Found') });

    // Checked via `model-row`'s own `accessibilityLabel`, not via
    // `queryByText(/engine default/i)` on the screen at large, and checked
    // before Create is pressed rather than after (both changes from the
    // brief's sketch, and both load-bearing — see the report's note on the
    // critical-obligation check this test exists to satisfy):
    //
    // - `queryByText` matched the OLD `model-stub` `View` just as well as the
    //   new picker — that `View`'s hard-coded "engine default" caption is
    //   there unconditionally, whether the catalog loaded, errored, or was
    //   never fetched at all. Asserting on it proved nothing about this
    //   task's fallback path specifically. `getByTestId('model-row')` does:
    //   that ID does not exist until Step 3 replaces the stub, so this
    //   assertion is what actually goes red before the row is built, rather
    //   than passing by coincidence against Task 6's leftover `null`.
    // - After Create is pressed, `onCreate` runs the same `dismissTo` + push`
    //   every successful create does, and the sheet is gone by the time
    //   `waitFor` below settles — there is no "engine default" text left on
    //   screen to find at that point on EITHER the old or the new code,
    //   which is exactly the false-negative shape as the false-positive
    //   above: passing or failing for a reason that has nothing to do with
    //   the fallback. Checked here, before Create, it is true only once the
    //   real fallback path (an errored `/models` load) is live.
    const row = getByTestId('model-row');
    expect(row.props.accessibilityLabel).toBe('Model, engine default');

    await fireEvent.press(getByText('Create'));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(null, null));
  });
});

/**
 * Read off the layout element itself rather than through a render.
 *
 * Deliberate, and the reason is the whole point of this block: **jest never
 * renders a native-stack header.** A `screen.queryByText('New instance')`
 * assertion here passes identically with the header on and with it off — it
 * was measured, returning 0 matches while the route still asked for a title
 * and the device still drew the bar over the content. The only thing the
 * machine tier can actually falsify is what the route *declares*, so that is
 * what this reads.
 */
function screenOptionsFor(layout: () => ReactNode, name: string): Record<string, unknown> {
  const tree = layout() as ReactElement<{ children?: ReactNode }>;
  const match = Children.toArray(tree.props.children)
    .filter(isValidElement)
    .map((child) => child.props as { name?: string; options?: Record<string, unknown> })
    .find((props) => props.name === name);
  if (!match) throw new Error(`no <Stack.Screen name="${name}"> in the layout`);
  return match.options ?? {};
}

describe('the new-instance route as a form sheet', () => {
  /**
   * The bug this pins, reported on device 2026-07-29: the Operator row sat
   * underneath the sheet's header bar.
   *
   * `formSheet` and a native header are an unsupported combination — the SDK 57
   * docs are explicit that "native stack headers and nested stack navigators
   * are not supported inside form sheet screens, so options such as
   * headerShown, title, and header buttons will not render", and direct the
   * title into the sheet content instead. What "not supported" meant in
   * practice was worse than nothing rendering: react-native-screens drew the
   * bar (themed `bgSolidCard` by `navThemeFor`, so it read as a card) without
   * insetting the content beneath it, and the first row of the sheet went under
   * it.
   *
   * So the route must declare no header at all. A `title` here is the specific
   * shape of the original defect — a claim about chrome the presentation cannot
   * honor — which is why its absence is asserted rather than just
   * `headerShown`.
   */
  it('declares no native header, because a form sheet cannot render one', () => {
    const options = screenOptionsFor(InstancesLayout, 'new');

    // The premise. If this ever stops being a form sheet the rest of this test
    // stops being the right rule, and it should fail rather than quietly pass.
    expect(options.presentation).toBe('formSheet');

    expect(options.headerShown).toBe(false);
    expect(options.title).toBeUndefined();
  });
});
