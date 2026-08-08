import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { Text } from 'react-native';

import InstancesLayout from '../src/app/(tabs)/(instances)/_layout';
import Instances from '../src/app/(tabs)/(instances)/index';
import New from '../src/app/(tabs)/(instances)/new';
import { AuthProvider } from '../src/lib/auth/auth-context';
import { HostProvider } from '../src/lib/host-context';
import type { Instance } from '../src/lib/session/events';
import type { SessionAPI } from '../src/lib/session/api';

/**
 * One journey, one file: list → sheet → chat → back.
 *
 * **Its own file on purpose.** The router's mocked `router-store` is a
 * module-level singleton that outlives `cleanup()`, so a second `renderRouter`
 * in one file resumes wherever the previous test's navigation left off rather
 * than honouring its own `initialUrl` — recorded in `settings-route.test.tsx`,
 * and re-confirmed the expensive way while writing this: adding this journey
 * as a fifth test inside `new-instance.test.tsx` turned six of its seven
 * siblings red, none of them for a reason to do with the code.
 *
 * **And it starts at the list, not at the sheet.** `new-instance.test.tsx`
 * starts every test at `/new`, which is correct for what those tests assert —
 * what the sheet does. This one asserts what the sheet *leaves behind*, and a
 * run beginning on the sheet has nothing in history behind it: `canGoBack()`
 * is false there for a reason that has nothing to do with the code under test.
 * The only honest version of this test walks in the way a person does.
 *
 * What it defends: the chat now lives on the ROOT stack, above the tab bar
 * (design 2026-07-30). The sheet's create-then-navigate used to be a single
 * `replace` inside ONE stack, where replacing the sheet took it out of history
 * as a side effect. That navigation now crosses navigators, so the guarantee
 * no longer follows from the structure — and a sheet left in history is
 * invisible until someone taps back from the chat and lands on the picker they
 * just used.
 */

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

let mockApi: SessionAPI;
jest.mock('../src/lib/session/instance', () => ({
  sessionAPIFor: () => mockApi,
}));

function instanceFor(id: string, operator: string | null): Instance {
  return { id, operator, stream: id, startedAt: new Date().toISOString(), lastSeq: 0, model: null };
}

/** Stands in for the chat at the navigation destination — `instance/
 *  [instanceId]` is the only route in this map that renders it, so finding
 *  this text proves both the route and the param. Session rendering is
 *  session-screen.test.tsx's. */
function SessionStub() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  return <Text>{`session:${instanceId}`}</Text>;
}

function RootLayout() {
  return (
    <HostProvider>
      {/* Mirrors `_layout.tsx` — the create sheet reads the device's
          enrolment to report a refusal in the phone's own words. */}
      <AuthProvider>
        <Stack />
      </AuthProvider>
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

describe('Create from the sheet, then back', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('lands on the instances list, not back on the sheet', async () => {
    mockApi = {
      list: jest.fn(async () => []),
      create: jest.fn(async (operator: string | null) => instanceFor('inst-42', operator)),
      attach: jest.fn(),
      subscribe: jest.fn(),
      send: jest.fn(),
      interrupt: jest.fn(),
      evict: jest.fn(),
    } as unknown as SessionAPI;

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

    fireEvent.press(await screen.findByTestId('create-pill'));
    await screen.findByText('Dispatcher');

    await fireEvent.press(screen.getByText('Create'));
    expect(await screen.findByText('session:inst-42')).toBeTruthy();

    // `testRouter.back()` asserts `canGoBack()` before going back, which is
    // half the test: with a single `replace` into the root stack, there is
    // nothing to go back TO and this line fails first.
    //
    // Called without its optional expected-path argument, and the landing
    // asserted by render below instead. `back('/')` would route the assertion
    // through the `toHavePathnameWithParams` matcher, which calls
    // `screen.getPathnameWithParams()` — one of the helpers expo-router 57.0.8
    // attaches with `Object.assign` onto @testing-library/react-native's
    // render result, where they do not take. The matcher dies with
    // `screen.getPathnameWithParams is not a function`, which reads like a
    // version mismatch and is not one. Asserting on what is actually on screen
    // is the better test regardless — it is the thing a person would see.
    testRouter.back();

    // The list, by its own affordance.
    expect(await screen.findByTestId('create-pill')).toBeTruthy();
    // Not the chat we just left...
    expect(screen.queryByText('session:inst-42')).toBeNull();
    // ...and, the whole point, not the picker we already used.
    expect(screen.queryByText('Dispatcher')).toBeNull();
  });
});
