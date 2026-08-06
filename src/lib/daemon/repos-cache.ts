import type { ReposResponse } from './types';

/**
 * A host-scoped, short-TTL cache for `GET /repos` — shared by `composition.tsx`
 * (which genuinely needs the whole sweep, to render one status row per
 * composed repo) and the repo page (which needs only two booleans,
 * `enabled`/`push_enabled`, off the same response).
 *
 * # Why this exists
 *
 * `GET /repos` runs one `git status` fork PER COMPOSED REPO on the engine —
 * ~24 on this workspace. Before this cache, the repo page fired that whole
 * sweep on every visit just to read its two gate booleans, so a repo-page
 * round trip cost "1 + N forks" on a branch whose entire premise is that a
 * single repo's read costs one. Sharing what `composition.tsx` already
 * fetched — or letting the repo page's own read be reused if it lands
 * first — makes back-and-forth navigation between the two screens free.
 *
 * # The TTL, and why it is short rather than absent or infinite
 *
 * Caching keyed on host id + generation ALONE (no TTL) would hold the first
 * read's gates until the next host switch — but a manifest is a file David
 * edits directly (the literal case: adding `push = true` to a repo), and the
 * whole point of a live "not granted" reading is that it reflects a manifest
 * edit without an app restart or a host switch to force a refetch. Thirty
 * seconds is the accepted trade: navigation within one task (composition ->
 * a repo page -> back) is free, while a manifest edit is visible again well
 * within the time it takes to make the edit and return to the app. This is a
 * DELIBERATE staleness window, not an oversight — a caller that needs a
 * guaranteed-fresh read (pull-to-refresh) passes `force: true` and bypasses
 * it entirely.
 *
 * # Keying
 *
 * `${hostId}:${generation}` — `generation` (from `useHost()`) is bumped on
 * every host change, so a stale response from the PREVIOUS host can never
 * be served under a key the new host also matches; `hostId` is redundant
 * with a monotonic global `generation` today but is included anyway so the
 * key stays correct if `generation` is ever scoped per-host instead of
 * globally.
 */
const TTL_MS = 30_000;

type CacheEntry = { response: ReposResponse; fetchedAt: number };

const cache = new Map<string, CacheEntry>();

export interface ReposClient {
  getRepos(signal?: AbortSignal): Promise<ReposResponse>;
}

export function getCachedRepos(
  client: ReposClient,
  hostId: string,
  generation: number,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<ReposResponse> {
  const key = `${hostId}:${generation}`;

  if (!options.force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
      return Promise.resolve(hit.response);
    }
  }

  return client.getRepos(options.signal).then((response) => {
    // Stamped on ARRIVAL, not on call — a slow sweep stamped at call time
    // would already read partway-stale the moment it lands, and with no
    // in-flight dedup (a known, documented gap — see `repos-cache.test.ts`)
    // two overlapping calls could otherwise land last-writer-wins with the
    // OLDER body's timestamp winning over the newer body it overwrote.
    const fetchedAt = Date.now();
    // One entry per HOST, not one per host+generation ever seen — a
    // generation the caller no longer holds can never be served again (the
    // TTL check above only matches TODAY's key), so keeping its entry around
    // is pure growth with no reachable read. Delete every other entry for
    // this host before writing the new one.
    for (const existingKey of cache.keys()) {
      if (existingKey !== key && existingKey.startsWith(`${hostId}:`)) cache.delete(existingKey);
    }
    cache.set(key, { response, fetchedAt });
    return response;
  });
}

/** Test-only: the cache is module-level state, so tests that share a host id
 *  and generation (the common case — most tests never touch `useHost`'s
 *  default) must clear it between runs or silently read a PRIOR test's
 *  mocked response. */
export function __clearReposCacheForTests(): void {
  cache.clear();
}

/** Test-only: proves the cache stays bounded — see the eviction above. */
export function __reposCacheSizeForTests(): number {
  return cache.size;
}

/**
 * A 403 on a write verb is proof the cached grant was wrong, not a reason to
 * keep serving it for up to `TTL_MS` more. Callers that catch a 403 from
 * `fetchRepo`/`pullRepo`/`pushRepo` call this before re-reading the gates, so
 * the next read is a real network call rather than the same stale `enabled`/
 * `push_enabled` that just got refused.
 */
export function invalidateReposCache(hostId: string, generation: number): void {
  cache.delete(`${hostId}:${generation}`);
}
