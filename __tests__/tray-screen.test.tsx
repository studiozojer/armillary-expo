import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/stack';
import { Text } from 'react-native';

import TrayLayout from '../src/app/(tabs)/(tray)/_layout';
import TrayScreen from '../src/app/(tabs)/(tray)/index';
import { HostProvider } from '../src/lib/host-context';
import { KNOWN_HOSTS } from '../src/lib/hosts';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useRouter: () => ({ ...actual.useRouter(), push: mockPush }),
    // Fire once per mount, after render — the same stand-in the Instances
    // screen test uses and for the same reason.
    useFocusEffect: (callback: () => void) => {
      ReactActual.useEffect(() => {
        callback();
      }, []);
    },
  };
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

const augurEntry = {
  id: 'local/tray/1789367400000-augur-2026-09-14.json',
  sender: 'augur',
  kind: 'field',
  created_at: '2026-09-14T06:30:00-07:00',
  summary: 'Mercury trine natal Neptune perfects (+4)',
  path: 'operators/augur/field/2026-09-14.md',
  host: 'stjerneborg',
  date: '2026-09-14',
  event_count: 20,
};

/**
 * Answers `/tray` per host: stjerneborg has one arrival, delos refuses, the
 * rest are empty. A host that HANGS rather than refuses is the fan-out's own
 * timeout case and is covered in `tray-fanout.test.ts` with a short timeout;
 * here the refusal stands in, so the screen is not waiting out four seconds.
 */
function fetchAnsweringTrays() {
  const stjerneborg = KNOWN_HOSTS.find((h) => h.id === 'stjerneborg')!;
  const delos = KNOWN_HOSTS.find((h) => h.id === 'delos')!;
  globalThis.fetch = jest.fn((url: string) => {
    if (!url.endsWith('/tray')) throw new Error(`unexpected fetch: ${url}`);
    if (url.startsWith(stjerneborg.daemonUrl)) {
      return jsonResponse(200, { entries: [augurEntry], skipped: 0 });
    }
    if (url.startsWith(delos.daemonUrl)) {
      return Promise.reject(new Error('ECONNREFUSED'));
    }
    return jsonResponse(200, { entries: [], skipped: 0 });
  }) as unknown as typeof fetch;
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
function BrowseStub() {
  return <Text>browse-stub</Text>;
}

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/(tray)/_layout': TrayLayout,
  '(tabs)/(tray)/index': TrayScreen,
  '(tabs)/(explorer)/browse/[...path]': BrowseStub,
};

describe('the tray screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPush.mockClear();
  });

  it('shows every machine\'s arrivals with the origin on a chip, and names a host that did not answer', async () => {
    fetchAnsweringTrays();
    // Pinned to benatky so the one arrival is from a DIFFERENT machine and
    // the chip is doing real work.
    await AsyncStorage.setItem('armillary.selectedHostId', 'benatky');

    await renderRouter(routes, { initialUrl: '/(tabs)/(tray)' });

    expect(await screen.findByText('Mercury trine natal Neptune perfects (+4)')).toBeTruthy();
    expect(screen.getByText('augur')).toBeTruthy();
    expect(screen.getByText('stjerneborg')).toBeTruthy();
    // delos refused; the feed still rendered, and the screen says who was
    // missing rather than failing.
    expect(await screen.findByTestId('tray-unreachable')).toBeTruthy();
    expect(screen.getByText(/Not answering: delos/)).toBeTruthy();
  });

  it('opens an arrival on the machine that wrote it, switching host first', async () => {
    fetchAnsweringTrays();
    await AsyncStorage.setItem('armillary.selectedHostId', 'benatky');

    await renderRouter(routes, { initialUrl: '/(tabs)/(tray)' });
    const card = await screen.findByTestId(`tray-card-${augurEntry.id}`);

    await act(async () => {
      fireEvent.press(card);
    });

    expect(mockPush).toHaveBeenCalledWith('/browse/operators/augur/field/2026-09-14.md');
    // The host switch is the part a screenshot cannot show: the stored
    // selection moved to the artifact's machine before the navigation.
    expect(await AsyncStorage.getItem('armillary.selectedHostId')).toBe('stjerneborg');
  });

  it('renders an empty feed as a sentence, not a spinner or an error', async () => {
    globalThis.fetch = jest.fn(() =>
      jsonResponse(200, { entries: [], skipped: 0 }),
    ) as unknown as typeof fetch;

    await renderRouter(routes, { initialUrl: '/(tabs)/(tray)' });

    expect(await screen.findByText('Nothing has arrived.')).toBeTruthy();
    expect(screen.queryByTestId('tray-unreachable')).toBeNull();
  });
});
