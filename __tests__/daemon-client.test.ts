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
});
