import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The device's enrollment token, per host.
 *
 * # Why per host, and not one token
 *
 * The engine's principal registry is HOST-LOCAL by construction —
 * `~/.config/armillary/devices/`, deliberately somewhere the synced commons
 * cannot reach. A token minted on benatky is meaningless on stjerneborg: it
 * authenticates against a registry that machine does not have. Since this app
 * ships a host switcher (`KNOWN_HOSTS`), the credential has to switch with the
 * host, so this is a map keyed by host id rather than the single value the
 * design's § 3.3 describes.
 *
 * # Why Keychain and not AsyncStorage
 *
 * The token is a BEARER token (design residual R2): whoever can read it on the
 * device is the principal, and it authorizes a push under David's own git
 * credential with no undo. AsyncStorage is unencrypted — on iOS it is a plain
 * file in the app container. `SecureStore` is the Keychain, which is the
 * boundary the design named.
 *
 * # Web
 *
 * `SecureStore` has no web implementation, and `app.json` leaves `platforms`
 * unset, so web is a configured target. Rather than let every call throw at
 * runtime, web reads as "no token, and cannot hold one" — the app degrades to
 * the same read-only surface an unenrolled device gets, and
 * `secureStorageAvailable` lets the enrollment UI say so instead of offering a
 * field that cannot persist. Silently falling back to `localStorage` was the
 * alternative and is rejected: it would put a bearer token somewhere any script
 * on the origin can read, while the UI went on claiming Keychain.
 */

const KEY_PREFIX = 'armillary.deviceToken.';

/** Whether this platform can hold a token at all. */
export const secureStorageAvailable = Platform.OS !== 'web';

/**
 * The in-memory mirror, and the reason it exists.
 *
 * `sessionAPIFor` memoizes ONE client per host for the life of the app, and
 * both clients take their `fetch` by injection. If a token were captured when
 * that fetcher was built, enrolling a device would not reach the client that
 * had already been constructed — pushes would keep failing until an app
 * restart, which is precisely the kind of defect that looks like "enrollment
 * didn't work" and is actually a stale closure.
 *
 * So the header is attached from THIS cache, read at request time. That gives
 * the client the same property the engine gives itself: the registry there is
 * read per request so a `revoke` lands on the next call with no restart, and
 * the token here is read per request so an `enroll` does too.
 *
 * Keychain reads are async and a `fetch` wrapper cannot await one without
 * making every request pay a Keychain round trip, which is why this is a cache
 * and not a direct read.
 */
const memory = new Map<string, string | null>();

/**
 * The token for this host as of the last hydrate/save, synchronously.
 *
 * `null` for a host never hydrated — which fails CLOSED: the request goes out
 * unauthenticated and the engine refuses it with `no_principal`, rather than
 * the app inventing a credential or blocking on storage.
 */
export function cachedToken(hostId: string): string | null {
  return memory.get(hostId) ?? null;
}

/**
 * `SecureStore` keys accept only `[A-Za-z0-9._-]`. Host ids are ours and
 * already conform, but they come from a list a future edit can extend — so
 * this normalizes rather than trusting, and a host id that needed normalizing
 * still maps to one stable key.
 */
function keyFor(hostId: string): string {
  return `${KEY_PREFIX}${hostId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export async function loadToken(hostId: string): Promise<string | null> {
  if (!secureStorageAvailable) {
    memory.set(hostId, null);
    return null;
  }
  try {
    const value = await SecureStore.getItemAsync(keyFor(hostId));
    // An empty string is not a token. It is what a cleared field or a
    // half-finished write leaves behind, and treating it as one would send an
    // `Authorization: Bearer ` header the engine answers with 401
    // `unknown_principal` — a confusing refusal for a device that would more
    // honestly report itself unenrolled.
    const token = value && value.length > 0 ? value : null;
    memory.set(hostId, token);
    return token;
  } catch {
    // A Keychain read can fail (locked device, entitlement change). Unenrolled
    // is the honest degrade: it holds every verb closed and names a remedy,
    // where throwing would take down the screen that was only asking.
    memory.set(hostId, null);
    return null;
  }
}

export async function saveToken(hostId: string, token: string): Promise<void> {
  if (!secureStorageAvailable) {
    throw new Error('This platform cannot store a device token securely.');
  }
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new Error('That is not a token.');
  }
  await SecureStore.setItemAsync(keyFor(hostId), trimmed);
  // Cache AFTER the write lands. Setting it first would leave the app
  // believing it is enrolled on a host whose Keychain write threw — enrolled
  // until relaunch, unenrolled after, with nothing on screen to explain the
  // difference.
  memory.set(hostId, trimmed);
}

export async function clearToken(hostId: string): Promise<void> {
  memory.set(hostId, null);
  if (!secureStorageAvailable) return;
  await SecureStore.deleteItemAsync(keyFor(hostId));
}

/** Test seam only — the module-level cache outlives a test file otherwise. */
export function __resetTokenCache(): void {
  memory.clear();
}
