import { authedFetch } from '../src/lib/auth/authed-fetch';
import { __resetTokenCache, saveToken } from '../src/lib/auth/token-store';
import { DaemonClient } from '../src/lib/daemon/client';
import { DaemonError, type Position } from '../src/lib/daemon/types';

function mockFetch(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

function clientWith(fetcher: jest.Mock) {
  return new DaemonClient('http://host:7778', fetcher as unknown as typeof fetch);
}

/**
 * Records every call's URL and `RequestInit` rather than only the last —
 * `commitRepo`'s body lives in `init`, and `toHaveBeenCalledWith` alone
 * can't distinguish "no Content-Type header" from "no body at all".
 */
function clientWithScriptedFetch(calls: { url: string; init?: RequestInit }[], body: unknown) {
  const fetcher = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  });
  return new DaemonClient('http://host', fetcher as unknown as typeof fetch);
}

describe('DaemonClient', () => {
  it('encodes the path so spaces and slashes survive the query string', async () => {
    const fetcher = mockFetch(200, { path: 'a b/c', entries: [] });
    await clientWith(fetcher).getTree('a b/c');
    expect(fetcher).toHaveBeenCalledWith('http://host:7778/tree?path=a%20b%2Fc', {
      signal: undefined,
    });
  });

  it('throws DaemonError carrying the status, so the UI can name the refusal', async () => {
    const fetcher = mockFetch(415, 'not UTF-8 text');
    const client = clientWith(fetcher);

    await expect(client.getFile('image.png')).rejects.toBeInstanceOf(DaemonError);
    await expect(client.getFile('image.png')).rejects.toMatchObject({ status: 415 });
  });

  it('distinguishes a refusal from a not-found', async () => {
    await expect(clientWith(mockFetch(403, 'Escaped')).getFile('../etc/passwd')).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(clientWith(mockFetch(404, 'not found')).getFile('nope.md')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('threads an AbortSignal through so a superseded request is cancelled', async () => {
    const fetcher = mockFetch(200, { path: '', entries: [] });
    const controller = new AbortController();
    await clientWith(fetcher).getTree('x', controller.signal);
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
  });

  it('returns the parsed composition', async () => {
    const fetcher = mockFetch(200, {
      operators: [{ name: 'tycho', path: 'operators/tycho' }],
      commons: [],
      repos: [],
      protocols: [],
      manifests: [],
      protocol_sources: [],
    });
    const composition = await clientWith(fetcher).getComposition();
    expect(composition.operators[0].name).toBe('tycho');
  });

  it('tolerates an unknown protocol load value (C-5)', async () => {
    const fetcher = mockFetch(200, {
      operators: [],
      commons: [],
      repos: [],
      protocols: [{ name: 'x', source: 'x.md', load: 'some-future-timing' }],
      manifests: [],
      protocol_sources: [],
    });
    const composition = await clientWith(fetcher).getComposition();
    expect(composition.protocols[0].load).toBe('some-future-timing');
  });

  it('fetches the voicenote index', async () => {
    const payload = {
      audio_root: 'local/inbox',
      transcript_roots: ['zojercommons/voicenotes'],
      entries: [
        { audio: 'local/inbox/a.m4a', bytes: 12, state: 'untranscribed' as const },
      ],
    };
    const fetcher = mockFetch(200, payload);
    const index = await clientWith(fetcher).getVoicenotes();

    expect(fetcher).toHaveBeenCalledWith('http://host:7778/voicenotes', { signal: undefined });
    expect(index.entries[0].state).toBe('untranscribed');
  });

  it('surfaces a workspace that does not compose voicenotes as a 404 DaemonError', async () => {
    // Presence-gating reaches the client as a status, not as an empty list —
    // "the feature is absent" and "there are no memos" are different sentences
    // and the UI says different things for each.
    const fetcher = mockFetch(404, 'not_composed');
    await expect(clientWith(fetcher).getVoicenotes()).rejects.toBeInstanceOf(DaemonError);
  });

  it('reads the model catalog', async () => {
    const fetcher = mockFetch(200, {
      default: 'claude-sonnet-5',
      models: [
        { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic', usable: true },
        { id: 'zen/deepseek-v4-flash', label: null, provider: 'zen', usable: false },
      ],
    });
    const catalog = await clientWith(fetcher).getModels();

    expect(fetcher).toHaveBeenCalledWith('http://host:7778/models', { signal: undefined });
    expect(catalog.default).toBe('claude-sonnet-5');
    expect(catalog.models[1].usable).toBe(false);
  });

  it('treats a host with no models.toml as an empty catalog, not an error', async () => {
    // The engine returns 200 with `{ default: null, models: [] }` here, never
    // a 500 — an absent catalog is a normal, empty state.
    const fetcher = mockFetch(200, { default: null, models: [] });
    const catalog = await clientWith(fetcher).getModels();

    expect(catalog.default).toBeNull();
    expect(catalog.models).toEqual([]);
  });
});

describe('whoami', () => {
  beforeEach(() => {
    __resetTokenCache();
  });

  it('rides authedFetch and carries the bearer token even though it is a GET', async () => {
    await saveToken('host-1', 'tok-abc');
    const calls: { url: string; init?: RequestInit }[] = [];
    const scripted = jest.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ name: 'iphone', grants: ['sync', 'push', 'commit'], minted: '2026-08-01T00:00:00Z' }),
        text: async () => '',
      });
    });
    const client = new DaemonClient('http://host', authedFetch('host-1', scripted as unknown as typeof fetch));

    const facts = await client.whoami();

    expect(calls[0].url).toBe('http://host/whoami');
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer tok-abc');
    expect(facts).toEqual({ name: 'iphone', grants: ['sync', 'push', 'commit'], minted: '2026-08-01T00:00:00Z' });
  });

  it('throws DaemonError on a 401, same contract as every other refused route', async () => {
    const client = clientWith(mockFetch(401, 'no_principal: no Authorization header'));

    await expect(client.whoami()).rejects.toBeInstanceOf(DaemonError);
    await expect(client.whoami()).rejects.toMatchObject({ status: 401 });
  });

  it('threads an AbortSignal through like every other read', async () => {
    const fetcher = mockFetch(200, { name: 'iphone', grants: [], minted: '2026-08-01T00:00:00Z' });
    const controller = new AbortController();
    await clientWith(fetcher).whoami(controller.signal);
    expect(fetcher).toHaveBeenCalledWith('http://host:7778/whoami', { signal: controller.signal });
  });
});

describe('per-repo git', () => {
  it('posts to the per-repo verb and returns the new state', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'jianyi',
        path: 'repos/jianyi',
        head: 'abc',
        branch: 'main',
        position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
        dirty_files: 0,
        worktrees: 0,
        submodules: false,
      }),
    });
    const client = new DaemonClient('http://host', fetcher as unknown as typeof fetch);
    const state = await client.pullRepo('jianyi');

    // Strict deep-equality: a GET would drop `method` and fail here.
    expect(fetcher).toHaveBeenCalledWith('http://host/repos/jianyi/pull', {
      method: 'POST',
      signal: undefined,
    });
    expect(state.position.kind).toBe('tracking');
  });

  it('encodes the repo name rather than interpolating it raw', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const client = new DaemonClient('http://host', fetcher as unknown as typeof fetch);
    await client.getRepo('a/b');
    expect(fetcher).toHaveBeenCalledWith('http://host/repos/a%2Fb', { signal: undefined });
  });

  it('carries not_composed as plain strings, matching the engine Vec<String>', async () => {
    // Regression guard: NotComposed (a {path} wrapper struct) died with
    // sync.rs, and the new /repos route serializes bare paths. A wrapper
    // shape here would compile cleanly against a `{}` fixture and only fail
    // once a real engine response landed, so this asserts against fixture
    // values shaped like the actual wire, not an empty array.
    const fetcher = mockFetch(200, {
      enabled: true,
      push_enabled: false,
      repos: [],
      not_composed: ['scratch/orphan-clone', 'vendor/stray'],
    });
    const result = await clientWith(fetcher).getRepos();

    expect(result.not_composed).toEqual(['scratch/orphan-clone', 'vendor/stray']);
    result.not_composed.forEach((entry) => expect(typeof entry).toBe('string'));
  });

  it('surfaces a refused verb as a 403 the UI can branch on', async () => {
    // Ungated `push` on a host that only granted `sync`: the engine refuses
    // before it ever runs git, and the status is what the screen branches on.
    const client = clientWith(mockFetch(403, 'this workspace has not granted push'));

    await expect(client.pushRepo('jianyi')).rejects.toBeInstanceOf(DaemonError);
    await expect(client.pushRepo('jianyi')).rejects.toMatchObject({ status: 403 });
  });

  const REPO_STATE = {
    name: 'zojercommons',
    path: 'zojercommons',
    head: 'abc',
    branch: 'main',
    position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
    dirty_files: 0,
    worktrees: 0,
    submodules: false,
  };

  it('commitRepo POSTs a JSON body with the message', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = clientWithScriptedFetch(calls, REPO_STATE);
    await client.commitRepo('zojercommons', 'test: subject');

    expect(calls[0].url).toContain('/repos/zojercommons/commit');
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ message: 'test: subject' });
  });

  it('bodyless verbs still send no body', async () => {
    // fetchRepo after the post() signature change: init.body must be undefined.
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = clientWithScriptedFetch(calls, REPO_STATE);
    await client.fetchRepo('zojercommons');

    expect(calls[0].init?.body).toBeUndefined();
  });
});

/**
 * `Record<Position['kind'], string>` on purpose, the same shape `SKIP_LABELS`
 * guards in `module-list.tsx`: a `Position` variant added without a label
 * here is a compile error, not a row rendering the enum spelling at runtime.
 * This is a type-level guard, so the meaningful proof is `tsc`, not `jest` —
 * adding a fifth `Position` member without extending this map fails
 * `tsc --noEmit` on this line before it fails anything at runtime.
 */
const POSITION_LABELS: Record<Position['kind'], string> = {
  tracking: 'tracking',
  'upstream-gone': 'upstream gone',
  'no-upstream': 'no upstream',
  detached: 'detached',
};

describe('Position exhaustiveness', () => {
  it('has a label for every kind the wire can send', () => {
    const kinds: Position['kind'][] = ['tracking', 'upstream-gone', 'no-upstream', 'detached'];
    for (const kind of kinds) {
      expect(POSITION_LABELS[kind]).toEqual(expect.any(String));
    }
  });
});
