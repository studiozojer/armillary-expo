import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { gitEpochOf } from './daemon/git-epoch';

/**
 * The navigation half of the action-epoch design (git-ux-polish D5–D7): on
 * regaining focus, compare the epoch this screen's data was loaded at against
 * the host's current one, and silently revalidate only when behind. The first
 * focus is skipped — it coincides with mount, whose own load effect already
 * fetched (the same skip, for the same reason, as the Instances list's
 * focus-refetch).
 *
 * The stamp moves only on a SUCCESSFUL revalidate, so a failed silent re-read
 * retries on the next focus instead of being forgotten. `markFresh` is for
 * screens whose own actions bump the epoch and fold the result themselves —
 * without it, a screen's own pull would read as someone else's staleness on
 * the next focus and trigger a redundant re-read.
 *
 * A host switch resets the stamp to the new host's current epoch: the
 * switch already reloads every screen through its loader key, so pre-switch
 * staleness bookkeeping has nothing left to say.
 */
export function useGitEpochFocusRefresh(
  hostId: string,
  revalidate: () => Promise<boolean>,
): { markFresh: () => void } {
  const stamp = useRef({ hostId, epoch: gitEpochOf(hostId) });
  // eslint-disable-next-line react-hooks/refs -- idempotent reset keyed on hostId change: once stamp.current.hostId matches, this stops writing, so it cannot loop.
  if (stamp.current.hostId !== hostId) stamp.current = { hostId, epoch: gitEpochOf(hostId) };
  const hasFocusedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      const current = gitEpochOf(hostId);
      if (stamp.current.epoch >= current) return;
      void revalidate().then((ok) => {
        if (ok) stamp.current = { hostId, epoch: current };
      });
    }, [hostId, revalidate]),
  );

  const markFresh = useCallback(() => {
    stamp.current = { hostId, epoch: gitEpochOf(hostId) };
  }, [hostId]);

  return { markFresh };
}
