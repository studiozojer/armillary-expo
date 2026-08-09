import * as SecureStore from 'expo-secure-store';

import { secureStorageAvailable } from './auth/token-store';

/**
 * Per-host consent for what an AGENT INSTANCE (not the device's own enrolled
 * grants) may reach for on this app — sync, push, and commit. Same storage
 * idiom as `auth/token-store.ts` — Keychain, keyed by host, because this sits
 * beside the device token as a second per-host fact about what this phone is
 * willing to let an instance do here.
 *
 * # D4 as amended — default ON, deliberately
 *
 * Every other toggle in this app defaults to the safe/off position. This one
 * is inverted on purpose: David amended D4 at ratification to read "absent
 * stored state reads as consented." The reasoning is that this store is a
 * REVOCATION surface layered UNDER the device's own grants — `/whoami`'s
 * `grants` already say what the host lets this device do at all, and that is
 * the real gate. This store only ever narrows further, for someone who wants
 * to say "yes the device may push, but not from an unattended instance
 * running here." Defaulting it off would make every fresh install silently
 * mute a device that the host already trusts, for a distinction most people
 * will never want to draw. Do not "fix" this to off-by-default; it is a
 * ratified call, not an oversight.
 *
 * # Why per host, and not one blob
 *
 * `KNOWN_HOSTS` lets one phone hold state for more than one engine, and a
 * revocation made against one host's agent must not leak onto another's —
 * the same reasoning `token-store.ts` gives for keying its own credential by
 * host id.
 */

const KEY_PREFIX = 'armillary.agentConsent.';

export type AgentConsentKey = 'sync' | 'push' | 'commit';

export type AgentConsent = {
  sync: boolean;
  push: boolean;
  commit: boolean;
};

const DEFAULT_CONSENT: AgentConsent = { sync: true, push: true, commit: true };

/** Mirrors `token-store.ts`'s `keyFor` — `SecureStore` keys accept only `[A-Za-z0-9._-]`. */
function keyFor(hostId: string): string {
  return `${KEY_PREFIX}${hostId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/**
 * This host's consent, all three keys. Cheap and side-effect-free by design —
 * a later task consults this at SEND TIME, on every turn an instance might
 * take an action, and it must never do more than answer the question asked.
 *
 * Absent storage (never touched, platform cannot hold one, or a Keychain
 * read that throws) all read the same way: fully consented. That is D4 as
 * amended, not a fallback-on-error convenience — see the module doc.
 */
export async function getAgentConsent(hostId: string): Promise<AgentConsent> {
  if (!secureStorageAvailable) return { ...DEFAULT_CONSENT };
  try {
    const raw = await SecureStore.getItemAsync(keyFor(hostId));
    if (!raw) return { ...DEFAULT_CONSENT };
    const parsed = JSON.parse(raw) as Partial<AgentConsent>;
    return {
      sync: parsed.sync ?? true,
      push: parsed.push ?? true,
      commit: parsed.commit ?? true,
    };
  } catch {
    // A locked/unavailable Keychain degrades to the same "consented" default
    // as never having written anything — never to "revoked", which would be
    // the app inventing a restriction the store was never told to hold.
    return { ...DEFAULT_CONSENT };
  }
}

/**
 * Flips one key and persists the resulting whole-record snapshot, so a
 * partial write can never resurrect a key that was previously revoked by
 * silently reverting it to the default on the next read.
 */
export async function setAgentConsent(hostId: string, key: AgentConsentKey, value: boolean): Promise<void> {
  const current = await getAgentConsent(hostId);
  const next = { ...current, [key]: value };
  if (!secureStorageAvailable) return;
  await SecureStore.setItemAsync(keyFor(hostId), JSON.stringify(next));
}
