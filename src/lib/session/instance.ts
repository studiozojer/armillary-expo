import { authedFetch } from '../auth/authed-fetch';
import type { Host } from '../hosts';
import type { SessionAPI } from './api';
import { LiveSessionAPI } from './live';
import { MockSessionAPI } from './mock';

/**
 * Streaming-capable fetch, for `subscribe()`'s SSE reads.
 *
 * RN's global `fetch` doesn't expose `response.body` as a readable stream
 * (see `live.ts`'s comment) — `expo/fetch` does. The import is wrapped in a
 * `require` + try/catch rather than a static `import`: verified directly that
 * `require('expo/fetch')` resolves cleanly under this repo's jest setup (SDK
 * 57 / jest-expo), but the module reaches for a native binding underneath,
 * and a future SDK bump or a different test environment could still choke on
 * it. Falling back to the global `fetch` keeps that non-fatal — streaming
 * just degrades to whatever the global implementation offers, same as
 * `live.ts`'s own default parameter.
 */
function resolveStreamingFetch(): typeof fetch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above: require + try/catch is the point, not a static import.
    return (require('expo/fetch') as { fetch: typeof fetch }).fetch;
  } catch {
    return fetch;
  }
}

const instances = new Map<string, SessionAPI>();

/**
 * One `SessionAPI` per (mock-flag, host) pair, memoized for the life of the
 * app.
 *
 * Both instances screens call this rather than constructing their own
 * client, so they share one object — an instance created on the list screen
 * is the same one the session screen attaches to (Task 5's shared-store
 * requirement, now host-aware: switching hosts gets its own client and,
 * for the mock, its own store).
 *
 * `EXPO_PUBLIC_SESSION_MOCK=1` selects the in-memory mock (dev/demo without a
 * reachable engine); otherwise this returns a `LiveSessionAPI` talking HTTP +
 * SSE to `host.daemonUrl`.
 */
export function sessionAPIFor(host: Host): SessionAPI {
  const mock = process.env.EXPO_PUBLIC_SESSION_MOCK === '1';
  const key = `${mock ? '1' : '0'}:${host.id}:${host.daemonUrl}`;

  const existing = instances.get(key);
  if (existing) return existing;

  const created: SessionAPI = mock
    ? new MockSessionAPI()
    : // The credential is layered onto the streaming fetch rather than passed
      // to the client, which is what keeps `LiveSessionAPI` transport-dumb as
      // its own doc claims. `authedFetch` reads the token PER REQUEST — this
      // map memoizes one client per host for the life of the app, so a token
      // captured here instead would leave a device enrolled-but-refused until
      // relaunch.
      new LiveSessionAPI(host.daemonUrl, authedFetch(host.id, resolveStreamingFetch()));
  instances.set(key, created);
  return created;
}
