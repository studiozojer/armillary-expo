import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: unknown };

/**
 * One async load, tied to a key, with cancellation and stale-write protection.
 *
 * # The bug this exists to prevent
 *
 * Every screen previously did bare `useEffect` + `setState` with no
 * cancellation and no guard. That produces a specific and nasty failure: you
 * are on a slow host, switch to a fast one, the fast response renders — and
 * then the slow host's original response finally resolves and calls `setState`
 * from a closure whose effect is long gone. You are now looking at **benatky's
 * modules under a header that reads stjerneborg**, and tapping one navigates to
 * a benatky path against stjerneborg.
 *
 * Silent wrong-machine data, in the feature whose entire purpose is knowing
 * which machine you are looking at.
 *
 * # Two guards, deliberately both
 *
 * - **abort** stops the wasted request, and
 * - **epoch** stops the stale write even if the abort lands too late to matter.
 *
 * The epoch check is the one that actually prevents the bug; abort is what
 * stops us doing work nobody wants. Keeping only the first would be relying on
 * a race to win.
 */
export function useLoader<T>(
  /** Changing this reloads. Include every input the loader closes over. */
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  /** Hold off until inputs are known — e.g. the stored host has hydrated. */
  enabled = true,
) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const epoch = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (isRefresh: boolean, keepOnError = false): Promise<boolean> => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const mine = ++epoch.current;

    // A refresh keeps the current content on screen; a key change does not,
    // because that content belongs to a different thing.
    if (!isRefresh) setState({ status: 'loading' });

    try {
      const data = await loaderRef.current(controller.signal);
      if (epoch.current !== mine) return false;
      setState({ status: 'ok', data });
      return true;
    } catch (error) {
      if (epoch.current !== mine || controller.signal.aborted) return false;
      // `keepOnError` is the revalidate mode (git-ux-polish design D7): a
      // focus-triggered re-read nobody asked for out loud must not replace
      // good content with an error flash. It still surfaces the error when
      // there is no good content to keep — retrying out of an error state
      // should update the error, not hide it.
      if (keepOnError) {
        setState((prev) => (prev.status === 'ok' ? prev : { status: 'error', error }));
      } else {
        setState({ status: 'error', error });
      }
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run(false);
    return () => inflight.current?.abort();
  }, [key, enabled, run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  const retry = useCallback(() => {
    void run(false);
  }, [run]);

  /** Silent re-read: content-preserving, spinner-free (design D7). Resolves
   *  `true` iff the fresh read landed. */
  const revalidate = useCallback(() => run(true, true), [run]);

  return { state, refreshing, refresh, retry, revalidate };
}
