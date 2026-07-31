import { DaemonClient } from '../src/lib/daemon/client';
import { DaemonError } from '../src/lib/daemon/types';

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

describe('sync', () => {
  const report = {
    enabled: true,
    fetched: true,
    repos: [
      { name: 'zojercommons', path: 'zojercommons', branch: 'main', status: 'synced', commits: 3 },
    ],
    not_composed: [],
  };

  // Uses the file's existing `mockFetch(status, body)` / `clientWith(fetcher)`
  // helpers rather than hand-rolled mock objects. Amended 2026-07-31: the
  // original code here rolled its own, which contradicted this plan's own
  // Global Constraint to follow the existing file's patterns — and the ad hoc
  // objects were inconsistent with each other (one omitted `status`, another
  // omitted `json`), which is exactly the drift a shared helper prevents.

  it('reads status with GET', async () => {
    const fetcher = mockFetch(200, { ...report, fetched: false });
    const got = await clientWith(fetcher).getSyncStatus();

    // Strict deep-equality: a POST would add a `method` key and fail here.
    expect(fetcher).toHaveBeenCalledWith('http://host:7778/sync', { signal: undefined });
    expect(got.fetched).toBe(false);
  });

  it('runs a sweep with POST', async () => {
    const fetcher = mockFetch(200, report);
    const got = await clientWith(fetcher).runSync();

    expect(fetcher).toHaveBeenCalledWith('http://host:7778/sync', {
      method: 'POST',
      signal: undefined,
    });
    expect(got.repos[0].status).toBe('synced');
  });

  it('surfaces a refused sweep as a 403 the UI can branch on', async () => {
    // The engine refuses an ungated host with a message naming the key. The
    // status is what the screen branches on, so it must survive the client.
    // Both assertions, matching the file's established pattern: without the
    // instanceof check this would also pass against a plain `{status: 403}`.
    const client = clientWith(mockFetch(403, 'this workspace has not granted…'));

    await expect(client.runSync()).rejects.toBeInstanceOf(DaemonError);
    await expect(client.runSync()).rejects.toMatchObject({ status: 403 });
  });
});
