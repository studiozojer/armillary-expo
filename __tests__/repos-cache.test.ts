import { __clearReposCacheForTests, getCachedRepos } from '../src/lib/daemon/repos-cache';
import type { ReposResponse } from '../src/lib/daemon/types';

function response(overrides: Partial<ReposResponse> = {}): ReposResponse {
  return { enabled: true, push_enabled: true, repos: [], not_composed: [], ...overrides };
}

function clientReturning(...responses: ReposResponse[]) {
  let call = 0;
  const getRepos = jest.fn(() => Promise.resolve(responses[Math.min(call++, responses.length - 1)]));
  return { getRepos };
}

describe('getCachedRepos', () => {
  beforeEach(() => {
    __clearReposCacheForTests();
    jest.restoreAllMocks();
  });

  it('serves a second caller from the cache — one network call for two readers', async () => {
    const client = clientReturning(response({ push_enabled: false }));
    const a = await getCachedRepos(client, 'benatky', 0);
    const b = await getCachedRepos(client, 'benatky', 0);
    expect(a).toBe(b); // same object — served from cache, not re-parsed
    expect(client.getRepos).toHaveBeenCalledTimes(1);
  });

  it('keys separately per host id, even at the same generation', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    const benatky = await getCachedRepos(client, 'benatky', 0);
    const stjerneborg = await getCachedRepos(client, 'stjerneborg', 0);
    expect(benatky.push_enabled).toBe(false);
    expect(stjerneborg.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });

  it('keys separately per generation, even at the same host id — a host switch invalidates it', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    const before = await getCachedRepos(client, 'benatky', 0);
    const after = await getCachedRepos(client, 'benatky', 1);
    expect(before.push_enabled).toBe(false);
    expect(after.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });

  it('re-fetches once the TTL has elapsed', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    await getCachedRepos(client, 'benatky', 0);

    // Just under 30s: still cached.
    nowSpy.mockReturnValue(1_000_000 + 29_000);
    const stillCached = await getCachedRepos(client, 'benatky', 0);
    expect(stillCached.push_enabled).toBe(false);
    expect(client.getRepos).toHaveBeenCalledTimes(1);

    // Just over 30s: the TTL this test exists to pin.
    nowSpy.mockReturnValue(1_000_000 + 31_000);
    const refetched = await getCachedRepos(client, 'benatky', 0);
    expect(refetched.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });

  it('force bypasses the cache even when the TTL has not elapsed — pull-to-refresh must never do nothing', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    await getCachedRepos(client, 'benatky', 0);
    const forced = await getCachedRepos(client, 'benatky', 0, { force: true });
    expect(forced.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });

  it('a forced read still refreshes the cache for the next ordinary reader', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    await getCachedRepos(client, 'benatky', 0);
    await getCachedRepos(client, 'benatky', 0, { force: true });
    const next = await getCachedRepos(client, 'benatky', 0);
    expect(next.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });
});
