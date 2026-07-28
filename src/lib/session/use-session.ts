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

export type UseSessionResult = {
  rows: SessionRow[];
  status: SubscriptionStatus;
  gap: GapInfo | null;
  send(text: string): Promise<void>;
  interrupt(): Promise<void>;
  evict(eventId: string): Promise<void>;
  /** Set when the most recent send() was rejected; cleared by the next send(). */
  sendError: string | null;
};

/**
 * The subscription lifecycle: attach → hydrate scrollback cache → subscribe
 * from the cached cursor → live. Reconnects on `onStatus('closed')` with a
 * fixed 1s backoff, resubscribing from the current max durable seq so nothing
 * received before the drop is re-requested. Optimistic sends are echoed as
 * `pending` rows until a durable event with the same `clientKey` lands
 * (`projectSession` does the reconciling; this hook just feeds it state).
 */
export function useSession(api: SessionAPI, instanceId: string): UseSessionResult {
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
    const mine = ++epoch.current;

    // Reset: this instanceId owns a fresh cursor, cache, and connection.
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

    let cancelled = false;

    void (async () => {
      const attachInfo = await apiRef.current.attach(instanceId);
      if (cancelled || epoch.current !== mine) return;
      const stream = attachInfo.instance.stream;
      streamRef.current = stream;

      const cached = await readScrollback(stream);
      if (cancelled || epoch.current !== mine) return;
      if (cached.length > 0) {
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
  }, [instanceId]);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const mine = epoch.current;
      const clientKey = `ck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setSendError(null);
      setPending((prev) => [...prev, { clientKey, text, at: new Date().toISOString() }]);
      try {
        await apiRef.current.send(instanceId, text, clientKey);
      } catch (error) {
        if (epoch.current !== mine) return;
        setPending((prev) => prev.filter((p) => p.clientKey !== clientKey));
        setSendError(error instanceof Error ? error.message : String(error));
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
