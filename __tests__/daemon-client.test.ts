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
