/**
 * Telling the engine's refusals apart, because their remedies differ.
 *
 * Three things can refuse a mutating request, and the engine checks them in
 * this order (design § 3.2, and the ordering is load-bearing there): the
 * device's credential, then the device's grant in the host-local registry,
 * then the workspace manifest's ceiling. Effective authority is
 * `registry ∧ manifest`.
 *
 * The remedies have nothing to do with each other:
 *
 * - no credential / unknown credential → **enroll this device** (paste a token)
 * - enrolled but ungranted → **re-enroll with the grant**
 * - manifest ceiling → **edit `modules.local.toml` on the host**
 *
 * Showing the manifest remedy for a device refusal sends someone to edit a
 * file that is already correct — the same defect `GateState`'s `'unknown'`
 * exists to prevent one layer up, arriving through a different door.
 *
 * # Parsing
 *
 * The engine formats a device refusal's body as `"{code}: {sentence}"`, where
 * the code is documented as a stable machine-readable string. The manifest
 * ceiling's body is bare prose with NO code prefix. So a known code wins, and
 * anything else falls through to the ceiling reading — which is also the right
 * degrade for an older engine that predates principals entirely, where a 403
 * can only ever have been the ceiling.
 */

export type DeviceRefusal =
  /** No `Authorization` header reached the engine. */
  | 'no_principal'
  /** The token we hold belongs to no principal here — revoked, or minted on another host. */
  | 'unknown_principal'
  /** Enrolled, but this grant was not among the ones minted. */
  | 'principal_not_granted';

const DEVICE_REFUSALS: readonly DeviceRefusal[] = [
  'no_principal',
  'unknown_principal',
  'principal_not_granted',
];

/**
 * The device-side refusal a response body names, or `null` when it names none
 * — which includes every manifest-ceiling refusal and every response from an
 * engine built before this gate existed.
 */
export function deviceRefusalOf(body: string | undefined): DeviceRefusal | null {
  if (!body) return null;
  const code = body.split(':', 1)[0]?.trim();
  return DEVICE_REFUSALS.find((c) => c === code) ?? null;
}

/**
 * Whether a refusal means the stored token is no good — as opposed to merely
 * insufficient.
 *
 * `unknown_principal` is the revoke case: the registry is read per request, so
 * a `revoke` on the host takes effect on the very next call with no restart,
 * and a device holding a revoked token must stop claiming to be enrolled. A
 * `principal_not_granted` is the opposite — the token is fine and the device
 * genuinely is enrolled; it simply lacks that one grant, and discarding the
 * token over it would make the user re-paste a credential that still works.
 */
export function invalidatesToken(refusal: DeviceRefusal): boolean {
  return refusal === 'unknown_principal';
}

/** The sentence to show. The engine's own text is prose for a terminal user
 *  ("run `armillary-engine enroll --name <name> --grants sync,push`"), which
 *  is the right instruction for the host and the wrong one to render on a
 *  phone that cannot run it — so the phone-side half of the remedy is named
 *  here, and the host-side command is left where it can actually be typed. */
export const REFUSAL_REASON: Record<DeviceRefusal, string> = {
  no_principal:
    'This device isn’t enrolled on this host. Enroll it in Settings with a token minted there.',
  unknown_principal:
    'This host no longer recognises this device’s token — it may have been revoked. Re-enroll in Settings.',
  principal_not_granted:
    'This device is enrolled but wasn’t granted that authority. Re-enroll it on the host with the grant it needs.',
};
