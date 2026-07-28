import type { Host } from '../src/lib/hosts';
import { LiveSessionAPI } from '../src/lib/session/live';
import { MockSessionAPI } from '../src/lib/session/mock';
import { sessionAPIFor } from '../src/lib/session/instance';

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: 'host-a',
    label: 'Host A',
    daemonUrl: 'http://host-a:7778',
    inboxUrl: 'http://host-a:7777',
    ...overrides,
  };
}

describe('sessionAPIFor', () => {
  const originalMock = process.env.EXPO_PUBLIC_SESSION_MOCK;

  afterEach(() => {
    if (originalMock === undefined) delete process.env.EXPO_PUBLIC_SESSION_MOCK;
    else process.env.EXPO_PUBLIC_SESSION_MOCK = originalMock;
  });

  it('returns a MockSessionAPI when the mock flag is set', () => {
    process.env.EXPO_PUBLIC_SESSION_MOCK = '1';
    const api = sessionAPIFor(makeHost({ id: 'mock-flag-host' }));
    expect(api).toBeInstanceOf(MockSessionAPI);
  });

  it('returns a LiveSessionAPI carrying the host daemonUrl when the flag is unset', () => {
    delete process.env.EXPO_PUBLIC_SESSION_MOCK;
    const host = makeHost({ id: 'live-flag-host', daemonUrl: 'http://somewhere-else:7778' });
    const api = sessionAPIFor(host);
    expect(api).toBeInstanceOf(LiveSessionAPI);
    // baseUrl is private on LiveSessionAPI — this reaches past that to confirm
    // the factory actually threaded the host's daemonUrl through, not just
    // that it built *a* LiveSessionAPI.
    expect((api as unknown as { baseUrl: string }).baseUrl).toBe(host.daemonUrl);
  });

  it('memoizes: the same host and flag return the identical instance', () => {
    process.env.EXPO_PUBLIC_SESSION_MOCK = '1';
    const host = makeHost({ id: 'memo-host' });
    const first = sessionAPIFor(host);
    // A structurally-equal but distinct object, same fields — identity must
    // key on the host's fields, not on `host` being the same reference,
    // since screens will each call `useHost()` independently.
    const second = sessionAPIFor({ ...host });
    expect(second).toBe(first);
  });

  it('a different host id produces a different instance', () => {
    process.env.EXPO_PUBLIC_SESSION_MOCK = '1';
    const a = sessionAPIFor(makeHost({ id: 'distinct-a' }));
    const b = sessionAPIFor(makeHost({ id: 'distinct-b' }));
    expect(a).not.toBe(b);
  });

  it('the same host id with a different daemonUrl produces a different instance', () => {
    // Pins the memo key by inspection: it's `${mock}:${host.id}:${host.daemonUrl}`,
    // not just the id — a host record whose URL changed (e.g. re-resolved,
    // or a config edit) must not get handed the old client.
    delete process.env.EXPO_PUBLIC_SESSION_MOCK;
    const a = sessionAPIFor(makeHost({ id: 'same-id', daemonUrl: 'http://one:7778' }));
    const b = sessionAPIFor(makeHost({ id: 'same-id', daemonUrl: 'http://two:7778' }));
    expect(a).not.toBe(b);
  });
});
