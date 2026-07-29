import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text } from 'react-native';

import InstancesLayout from '../src/app/(tabs)/(instances)/_layout';
import Instances from '../src/app/(tabs)/(instances)/index';
import New from '../src/app/(tabs)/(instances)/new';
import { HostProvider } from '../src/lib/host-context';
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

function instanceFor(id: string, operator: string | null): Instance {
  return { id, operator, stream: id, startedAt: new Date().toISOString(), lastSeq: 0 };
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
  '(tabs)/(instances)/[instanceId]': SessionStub,
};

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
    expect(mockApi.create).toHaveBeenCalledWith('tycho');
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
    expect(mockApi.create).toHaveBeenCalledWith(null);
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
    expect(mockApi.create).toHaveBeenCalledWith(null);
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

  it('the model row is an announced-disabled stub with the honest value', async () => {
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

    await renderRouter(routes, { initialUrl: '/new' });
    await screen.findByText('Dispatcher');

    const stub = screen.getByTestId('model-stub');
    expect(stub.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('engine default')).toBeTruthy();
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
