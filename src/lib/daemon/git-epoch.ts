/**
 * The action-epoch (git-ux-polish design D5/D6): one per-host monotonic
 * counter, bumped by every SUCCESSFUL mutating git verb (fetch, pull, push,
 * commit, fetch-all). Explorer screens stamp the epoch their data was loaded
 * at and silently revalidate on focus only when behind. The counter never
 * resets or expires — a monotonic comparison replaces every "when does the
 * check unload" question: a screen is stale iff its stamp < the current
 * value, which costs one integer compare and zero network.
 *
 * Keyed by hostId ALONE, not hostId:generation — a host switch already
 * re-keys every loader (generation is in every `useLoader` key), so the
 * epoch only ever answers "did an action happen on THIS host".
 *
 * Module-level state, same idiom as `repos-cache.ts`, with the same
 * test-reset escape hatch for the same reason.
 */
const epochs = new Map<string, number>();

export function gitEpochOf(hostId: string): number {
  return epochs.get(hostId) ?? 0;
}

export function bumpGitEpoch(hostId: string): void {
  epochs.set(hostId, gitEpochOf(hostId) + 1);
}

/** Test-only — see `repos-cache.ts`'s `__clearReposCacheForTests`. */
export function __clearGitEpochForTests(): void {
  epochs.clear();
}
