import {
  __clearReposCacheForTests,
  __reposCacheSizeForTests,
  getCachedRepos,
  invalidateReposCache,
} from '../src/lib/daemon/repos-cache';
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

  it('serves a second SEQUENTIAL caller from the cache — one network call across two AWAITED reads', async () => {
    // Named precisely: this only exercises callers that await one call
    // before making the next. There is no in-flight dedup — two callers
    // that both fire before either resolves each pay their own network
    // call. Low real-world bite (Expo Router rarely mounts two competing
    // load effects in the same tick), but the name should not promise more
    // than the assertion.
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

  it('stamps fetchedAt on ARRIVAL, not on call — a slow request is not already stale the moment it lands', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    let resolveRequest: (r: ReposResponse) => void = () => {};
    const pending = new Promise<ReposResponse>((resolve) => {
      resolveRequest = resolve;
    });
    const client = { getRepos: jest.fn(() => pending) };

    const call = getCachedRepos(client, 'benatky', 0);
    // The request takes 10s to land. If `fetchedAt` were stamped at CALL
    // time (the bug), the cache would already read as 10s old the instant
    // it resolves.
    nowSpy.mockReturnValue(1_000_000 + 10_000);
    resolveRequest(response({ push_enabled: false }));
    await call;

    // 29s past ARRIVAL (1_010_000): still fresh only if `fetchedAt` was
    // stamped on arrival. Stamped at call time, this would already be 39s
    // stale and trigger a second network call.
    nowSpy.mockReturnValue(1_000_000 + 10_000 + 29_000);
    const stillCached = await getCachedRepos(client, 'benatky', 0);
    expect(stillCached.push_enabled).toBe(false);
    expect(client.getRepos).toHaveBeenCalledTimes(1);
  });

  it('evicts the previous generation for a host on write — the cache does not grow one entry per switch', async () => {
    const client = clientReturning(response(), response(), response());
    await getCachedRepos(client, 'benatky', 0);
    await getCachedRepos(client, 'benatky', 1);
    await getCachedRepos(client, 'benatky', 2);
    // Three generations read, one entry standing — the two superseded
    // generations can never be served again (the key includes generation),
    // so keeping them around is pure unbounded growth with no reachable read.
    expect(__reposCacheSizeForTests()).toBe(1);
  });

  it('eviction is scoped per host — a different host is never touched', async () => {
    const client = clientReturning(response(), response(), response());
    await getCachedRepos(client, 'benatky', 0);
    await getCachedRepos(client, 'stjerneborg', 0);
    await getCachedRepos(client, 'benatky', 1);
    expect(__reposCacheSizeForTests()).toBe(2); // benatky:1, stjerneborg:0
  });

  it('invalidateReposCache clears exactly the one key — a 403 on a write verb invalidates the grant it refused, not every host', async () => {
    const client = clientReturning(response({ push_enabled: false }), response({ push_enabled: true }));
    await getCachedRepos(client, 'benatky', 0);
    invalidateReposCache('benatky', 0);
    const refetched = await getCachedRepos(client, 'benatky', 0);
    expect(refetched.push_enabled).toBe(true);
    expect(client.getRepos).toHaveBeenCalledTimes(2);
  });
});
