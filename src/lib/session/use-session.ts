import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SessionAPI } from './api';
import type {
  AssistantDeltaData,
  AssistantMessageData,
  EventEnvelope,
  GapInfo,
  SubscriptionHandler,
  SubscriptionStatus,
} from './events';
import type { PendingSend, SessionRow } from './project';
import { projectSession } from './project';

/** Fixed backoff for a reconnect after `onStatus('closed')` — tuning is not
 *  architecture (task brief). */
const RECONNECT_DELAY_MS = 1000;

/** Scrollback cache is disposable (D7): bounded, best-effort, never load-bearing. */
const SCROLLBACK_LIMIT = 200;

function scrollbackKey(stream: string): string {
  return `armillary.scrollback.${stream}`;
}

/** AsyncStorage failures are swallowed — a cold cache just means an empty one. */
async function readScrollback(stream: string): Promise<EventEnvelope[]> {
  try {
    const raw = await AsyncStorage.getItem(scrollbackKey(stream));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EventEnvelope[]) : [];
  } catch {
    return [];
  }
}

/** Fire-and-forget: a failed write just means the next mount starts cold. */
function writeScrollback(stream: string, durable: EventEnvelope[]): void {
  const bounded = durable.slice(-SCROLLBACK_LIMIT);
  AsyncStorage.setItem(scrollbackKey(stream), JSON.stringify(bounded)).catch(() => {});
}

/** Fire-and-forget, same swallow-on-failure posture as `writeScrollback`. */
function clearScrollback(stream: string): void {
  AsyncStorage.removeItem(scrollbackKey(stream)).catch(() => {});
}

export type UseSessionResult = {
  rows: SessionRow[];
  status: SubscriptionStatus;
  gap: GapInfo | null;
  /** Resolves `true` if the send was accepted, `false` if it was rejected
   *  (in which case `sendError` is also set). */
  send(text: string): Promise<boolean>;
  interrupt(): Promise<void>;
  evict(eventId: string): Promise<void>;
  /**
   * Set when the most recent send() was rejected, or when attach() itself
   * failed (unknown instance, host unreachable, ...) — cleared by the next
   * send(). Reusing one field rather than adding a dedicated `attachError`:
   * both are "this session hit a server-side problem, and here's why",
   * rendered identically by the caption the session screen already puts near
   * the composer — a second field would need a second render site for no
   * behavioral difference.
   */
  sendError: string | null;
};

/**
 * The subscription lifecycle: attach → hydrate scrollback cache → subscribe
 * from the cached cursor → live. Reconnects on `onStatus('closed')` with a
 * fixed 1s backoff, resubscribing from the current max durable seq so nothing
 * received before the drop is re-requested. Optimistic sends are echoed as
 * `pending` rows until a durable event with the same `clientKey` lands
 * (`projectSession` does the reconciling; this hook just feeds it state).
 *
 * `enabled` (default true) gates the whole lifecycle, mirroring
 * `useLoader`'s `enabled` — pass `false` while the caller doesn't yet know
 * the right `api`/`instanceId` (e.g. a host still hydrating from storage).
 * While disabled, no attach/subscribe fires and nothing is scheduled; a
 * false→true flip starts the lifecycle fresh against whichever `api` is
 * current *at that render*, never one captured earlier while disabled.
 */
export function useSession(api: SessionAPI, instanceId: string, enabled = true): UseSessionResult {
  const [durable, setDurable] = useState<EventEnvelope[]>([]);
  const [transients, setTransients] = useState<Map<string, AssistantDeltaData>>(new Map());
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus>('replaying');
  const [gap, setGap] = useState<GapInfo | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Refs, not state: read synchronously by code that must not wait for a
  // render (the reconnect cursor, the cache key, dedup) and written from
  // event handlers that fire outside React's batching guarantees.
  const apiRef = useRef(api);
  apiRef.current = api;
  const epoch = useRef(0);
  const streamRef = useRef<string | null>(null);
  const durableRef = useRef<EventEnvelope[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const insertDurable = useCallback((event: EventEnvelope) => {
    if (durableRef.current.some((e) => e.id === event.id)) return;
    const next = [...durableRef.current, event].sort((a, b) => a.seq - b.seq);
    durableRef.current = next;
    setDurable(next);
    if (streamRef.current) writeScrollback(streamRef.current, next);
  }, []);

  // Plain function declarations (hoisted, mutually referencing each other) —
  // not useCallback, because scheduleReconnect and makeHandler are each
  // other's only caller and neither needs referential stability across
  // renders: they close only over refs, and the specific closure a running
  // effect captured at mount time is the one that keeps firing regardless of
  // what a later render recreates.
  function makeHandler(mine: number): SubscriptionHandler {
    return {
      onEvent: (e) => {
        if (epoch.current !== mine) return;
        if (e.seq === 0) {
          // Transient assistant_delta: keyed by generation, snapshot semantics (I-4).
          const data = e.data as AssistantDeltaData;
          setTransients((prev) => {
            const next = new Map(prev);
            next.set(data.generation, data);
            return next;
          });
          return;
        }
        if (e.type === 'assistant_message') {
          const data = e.data as AssistantMessageData;
          setTransients((prev) => {
            if (!prev.has(data.generation)) return prev;
            const next = new Map(prev);
            next.delete(data.generation);
            return next;
          });
        }
        insertDurable(e);
      },
      onStatus: (s) => {
        if (epoch.current !== mine) return;
        if (s === 'closed') {
          setStatus('reconnecting');
          // A connection drop mid-generation otherwise freezes the last
          // transient forever: a streaming row with no more deltas coming,
          // which pins the composer on Stop (an engine interrupt against a
          // generation that's already gone is a 204 no-op, so nothing ever
          // clears it). Post-drop transient snapshots are provably stale —
          // if the generation actually completed, the durable
          // assistant_message that supersedes it arrives via replay on
          // reconnect, same as any other durable event this cursor missed.
          setTransients(new Map());
          scheduleReconnect(mine);
          return;
        }
        setStatus(s);
      },
      onGap: (g) => {
        if (epoch.current !== mine) return;
        setGap(g);
      },
    };
  }

  function scheduleReconnect(mine: number): void {
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (epoch.current !== mine) return;
      const stream = streamRef.current;
      if (!stream) return;
      unsubscribeRef.current?.();
      const fromSeq = durableRef.current[durableRef.current.length - 1]?.seq ?? 0;
      unsubscribeRef.current = apiRef.current.subscribe(stream, fromSeq, makeHandler(mine));
    }, RECONNECT_DELAY_MS);
  }

  useEffect(() => {
    // Bumped on every run of this effect — an instanceId change and an
    // enabled flip both own a fresh cursor, cache, and connection, exactly
    // like each other.
    const mine = ++epoch.current;

    // Reset: this instanceId (or enabled-edge) owns a fresh cursor, cache,
    // and connection.
    setDurable([]);
    durableRef.current = [];
    setTransients(new Map());
    setPending([]);
    setStatus('replaying');
    setGap(null);
    setSendError(null);
    streamRef.current = null;
    clearReconnectTimer();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    // Disabled: reset above and stop — no attach, no subscribe, nothing
    // scheduled. `apiRef.current` may be a placeholder/fallback client at
    // this point (e.g. the default host while the stored one is still
    // hydrating); the whole point of `enabled` is that this effect never
    // touches it. A later flip to enabled re-runs this effect (it's in the
    // dependency array below) and reads `apiRef.current` fresh at that time.
    if (!enabled) return;

    let cancelled = false;

    void (async () => {
      let attachInfo;
      try {
        attachInfo = await apiRef.current.attach(instanceId);
      } catch (error) {
        if (cancelled || epoch.current !== mine) return;
        // Caught rather than left to reject unhandled: an unreachable host or
        // an unknown instance is a real, expected failure mode here, not a
        // programmer error. `closed` stops this from reading as an infinite
        // "Loading…" — see UseSessionResult.sendError's comment for why the
        // message rides that field rather than a dedicated one.
        setStatus('closed');
        setSendError(error instanceof Error ? error.message : String(error));
        return;
      }
      if (cancelled || epoch.current !== mine) return;
      const stream = attachInfo.instance.stream;
      streamRef.current = stream;

      let cached = await readScrollback(stream);
      if (cancelled || epoch.current !== mine) return;
      const cachedMax = cached[cached.length - 1]?.seq ?? 0;
      // The cache is disposable by design (D7) and the log is the truth
      // (D1) — so when the two disagree, the log wins outright rather than
      // being reconciled against. A cached cursor beyond what attach() just
      // reported as the log's head (mock id reuse across relaunches, a
      // wiped engine data dir, any log reset) means the cache describes a
      // log that no longer exists: trusting it would suppress all replay
      // (nothing before that cursor gets requested) and the tail dedup
      // would silently drop every live event at or below it — a frozen
      // ghost conversation. Discard rather than trim: cheap to rebuild from
      // seq 0, and no partial-trust reconciliation is honest here.
      if (cachedMax > attachInfo.headSeq) {
        cached = [];
        clearScrollback(stream);
      } else if (cached.length > 0) {
        durableRef.current = cached;
        setDurable(cached);
      }

      const fromSeq = Math.max(cached[cached.length - 1]?.seq ?? 0, 0);
      unsubscribeRef.current = apiRef.current.subscribe(stream, fromSeq, makeHandler(mine));
    })();

    return () => {
      cancelled = true;
      epoch.current++; // invalidate this mount's in-flight work and handler
      clearReconnectTimer();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, enabled]);

  const send = useCallback(
    // Returns whether the send was accepted, so the caller (the composer)
    // can restore the draft text it optimistically cleared — without this,
    // a rejected send silently loses whatever the user typed.
    async (text: string): Promise<boolean> => {
      const mine = epoch.current;
      const clientKey = `ck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setSendError(null);
      setPending((prev) => [...prev, { clientKey, text, at: new Date().toISOString() }]);
      try {
        await apiRef.current.send(instanceId, text, clientKey);
        return true;
      } catch (error) {
        if (epoch.current !== mine) return false;
        setPending((prev) => prev.filter((p) => p.clientKey !== clientKey));
        setSendError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [instanceId],
  );

  const interrupt = useCallback(async (): Promise<void> => {
    await apiRef.current.interrupt(instanceId);
  }, [instanceId]);

  const evict = useCallback(
    async (eventId: string): Promise<void> => {
      await apiRef.current.evict(instanceId, eventId);
    },
    [instanceId],
  );

  const rows = useMemo(() => projectSession(durable, transients, pending), [durable, transients, pending]);

  return { rows, status, gap, send, interrupt, evict, sendError };
}
