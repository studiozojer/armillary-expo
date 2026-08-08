import { authedFetch } from '../src/lib/auth/authed-fetch';
import { deviceRefusalOf, invalidatesToken, REFUSAL_REASON } from '../src/lib/auth/refusal';
import {
  __resetTokenCache,
  cachedToken,
  clearToken,
  loadToken,
  saveToken,
} from '../src/lib/auth/token-store';

function secureMock() {
  return jest.requireMock('expo-secure-store') as {
    __store: Map<string, string>;
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
  };
}

beforeEach(() => {
  secureMock().__store.clear();
  secureMock().getItemAsync.mockClear();
  __resetTokenCache();
});

describe('token-store', () => {
  it('round-trips a token per host, and one host cannot read another’s', async () => {
    // The registry on the engine is HOST-LOCAL, so a token minted on one
    // machine authenticates against nothing on another. Keying by host is what
    // stops the app presenting benatky's credential to stjerneborg.
    await saveToken('benatky', 'tok-benatky');
    await saveToken('stjerneborg', 'tok-stjerneborg');

    expect(await loadToken('benatky')).toBe('tok-benatky');
    expect(await loadToken('stjerneborg')).toBe('tok-stjerneborg');
    expect(await loadToken('localhost')).toBeNull();
  });

  it('trims, and refuses a blank token rather than storing one', async () => {
    await saveToken('benatky', '  tok-with-space  ');
    expect(await loadToken('benatky')).toBe('tok-with-space');

    await expect(saveToken('benatky', '   ')).rejects.toThrow(/not a token/i);
    // And the refusal did not clobber what was already there.
    expect(await loadToken('benatky')).toBe('tok-with-space');
  });

  it('reads an empty stored string as no token, not as a token', async () => {
    // What a cleared field or a half-finished write leaves behind. Treating it
    // as a token would send `Authorization: Bearer ` and earn a 401 that reads
    // as a revoke rather than as "never enrolled".
    secureMock().__store.set('armillary.deviceToken.benatky', '');
    expect(await loadToken('benatky')).toBeNull();
  });

  it('reports no token when the Keychain read throws, instead of propagating', async () => {
    secureMock().getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(loadToken('benatky')).resolves.toBeNull();
  });

  it('caches only AFTER the write lands, so a failed write leaves nothing claimed', async () => {
    // Setting the cache first would leave the app believing it is enrolled on
    // a host whose Keychain write threw — enrolled until relaunch, unenrolled
    // after, with nothing on screen to explain the difference.
    secureMock().setItemAsync.mockRejectedValueOnce(new Error('keychain full'));
    await expect(saveToken('benatky', 'tok')).rejects.toThrow();
    expect(cachedToken('benatky')).toBeNull();
  });

  it('clearing drops the cached value as well as the stored one', async () => {
    await saveToken('benatky', 'tok');
    expect(cachedToken('benatky')).toBe('tok');
    await clearToken('benatky');
    expect(cachedToken('benatky')).toBeNull();
    expect(await loadToken('benatky')).toBeNull();
  });
});

describe('authedFetch', () => {
  it('attaches the host’s token as a bearer header', async () => {
    await saveToken('benatky', 'tok-benatky');
    const base = jest.fn(async () => new Response('{}'));
    await authedFetch('benatky', base as unknown as typeof fetch)('http://h/repos/x/push', {
      method: 'POST',
    });

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-benatky');
  });

  it('sends NO header when the device holds no token, rather than an empty one', async () => {
    // An `Authorization: Bearer ` would earn `unknown_principal` — a refusal
    // that reads as "revoked" for a device that was simply never enrolled.
    const base = jest.fn(async () => new Response('{}'));
    await authedFetch('benatky', base as unknown as typeof fetch)('http://h/repos');

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(init?.headers).toBeUndefined();
  });

  it('reads the token PER REQUEST, so enrolling reaches a client already built', async () => {
    // MUTATION-CHECKED, and the whole reason this is a cache read rather than
    // a captured value: `sessionAPIFor` memoizes one client per host for the
    // life of the app. A token captured when the fetcher was built would leave
    // a freshly enrolled device still refused until relaunch — a defect that
    // presents as "enrolment didn't work".
    const base = jest.fn(async () => new Response('{}'));
    const fetcher = authedFetch('benatky', base as unknown as typeof fetch);

    await fetcher('http://h/a');
    await saveToken('benatky', 'minted-later');
    await fetcher('http://h/b');

    const first = (base.mock.calls[0] as unknown as [string, RequestInit | undefined])[1];
    const second = (base.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(first?.headers).toBeUndefined();
    expect(new Headers(second.headers).get('Authorization')).toBe('Bearer minted-later');
  });

  it('stops sending a token the moment it is cleared — a revoke needs no restart', async () => {
    await saveToken('benatky', 'tok');
    const base = jest.fn(async () => new Response('{}'));
    const fetcher = authedFetch('benatky', base as unknown as typeof fetch);

    await fetcher('http://h/a');
    await clearToken('benatky');
    await fetcher('http://h/b');

    const second = (base.mock.calls[1] as unknown as [string, RequestInit | undefined])[1];
    expect(second?.headers).toBeUndefined();
  });

  it('preserves the caller’s own headers instead of replacing them', async () => {
    // A spread over `init.headers` produces `{}` when it arrives as a Headers
    // instance — silently dropping the Content-Type the session client sets on
    // every POST body, while appearing to work.
    await saveToken('benatky', 'tok');
    const base = jest.fn(async () => new Response('{}'));
    await authedFetch('benatky', base as unknown as typeof fetch)('http://h/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('survives headers arriving as a Headers instance', async () => {
    await saveToken('benatky', 'tok');
    const base = jest.fn(async () => new Response('{}'));
    await authedFetch('benatky', base as unknown as typeof fetch)('http://h/x', {
      headers: new Headers({ Accept: 'text/event-stream' }),
    });

    const [, init] = base.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });
});

describe('refusal parsing', () => {
  it('names each device refusal from the engine’s own body format', () => {
    // The engine formats these as `{code}: {sentence}`.
    expect(
      deviceRefusalOf('no_principal: this request mutates state and carried no credential.'),
    ).toBe('no_principal');
    expect(deviceRefusalOf('unknown_principal: that token belongs to no principal on this host')).toBe(
      'unknown_principal',
    );
    expect(
      deviceRefusalOf('principal_not_granted: this device is enrolled but was not granted that'),
    ).toBe('principal_not_granted');
  });

  it('reads a MANIFEST refusal as no device refusal at all', () => {
    // The ceiling's body is bare prose with no code prefix, and its remedy is
    // to edit `modules.local.toml` on the host — nothing a device can fix.
    // Misreading it as a device problem would send someone to re-enrol a phone
    // that is already enrolled.
    expect(
      deviceRefusalOf(
        'this workspace has not granted the engine authority to push. Add push = true under [router] in modules.local.toml, then retry.',
      ),
    ).toBeNull();
  });

  it('reads an unknown or absent body as no device refusal', () => {
    // An older engine, predating principals, can only ever have meant the
    // ceiling by a 403.
    expect(deviceRefusalOf(undefined)).toBeNull();
    expect(deviceRefusalOf('')).toBeNull();
    expect(deviceRefusalOf('turn_in_progress: a turn is already running')).toBeNull();
  });

  it('invalidates the stored token ONLY when the host does not recognise it', () => {
    // `unknown_principal` is the revoke case and the token must go.
    expect(invalidatesToken('unknown_principal')).toBe(true);
    // `principal_not_granted` means the token is fine and the grant is not —
    // discarding it would make the user re-paste a credential that still works
    // and was printed exactly once.
    expect(invalidatesToken('principal_not_granted')).toBe(false);
    expect(invalidatesToken('no_principal')).toBe(false);
  });

  it('gives every refusal a reason aimed at the phone, not the host terminal', () => {
    for (const reason of Object.values(REFUSAL_REASON)) {
      expect(reason).not.toMatch(/armillary-engine/);
      expect(reason).toMatch(/Settings|host/);
    }
  });
});
