import { cachedToken } from './token-store';

/**
 * A `fetch` that presents this host's device token.
 *
 * Both clients already take their fetcher by injection — `DaemonClient`'s doc
 * says so, and `live.ts` says the composition root is where `expo/fetch` gets
 * layered in. The credential belongs in that same seam rather than in a new
 * constructor parameter: it composes (`authedFetch(id, streamingFetch)`), it
 * needs no change to either client's signature, and it keeps both classes
 * transport-dumb, which is what their own docs claim they are.
 *
 * The token is read **per request**, never captured. `sessionAPIFor` memoizes
 * one client per host for the life of the app, so a token captured at
 * construction would leave a device enrolled-but-still-refused until relaunch.
 *
 * # It goes on reads too
 *
 * Reads are unauthenticated by design (residual R1) and the engine ignores the
 * header on them. Sending it anyway costs nothing on a tailnet, keeps ONE
 * fetcher per client rather than two, and means the day R1 is revisited — when
 * a second person or a non-David device is enrolled — the reads are already
 * carrying a credential rather than needing a second pass over every call site.
 */
export function authedFetch(hostId: string, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const token = cachedToken(hostId);
    if (!token) return base(input, init);

    // `Headers` rather than a spread: `init.headers` may arrive as a Headers
    // instance, a plain object, or an array of pairs (the session client
    // passes an object, `expo/fetch` may hand back a Headers), and a spread
    // silently produces `{}` for the first of those — dropping the caller's
    // own Content-Type while appearing to work.
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return base(input, { ...init, headers });
  };
}
