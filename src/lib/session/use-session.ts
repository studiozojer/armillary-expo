import { deviceRefusalOf, REFUSAL_REASON, type DeviceRefusal } from '../auth/refusal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SessionAPI } from './api';
import type {
  AssistantDeltaData,
  AssistantMessageData,
  EventEnvelope,
  GapInfo,
  Instance,
  SubscriptionHandler,
  SubscriptionStatus,
} from './events';
import { ASSISTANT_DELTA, TURN_ENDED, TURN_STARTED } from './events';
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
  /** The attached instance — its `id`, `operator`, `stream`. `null` before
   *  attach() resolves (or if it never does); set from the attach result,
   *  same source `streamRef` and `headSeq` already come from. */
  instance: Instance | null;
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
  /**
   * Whether a turn is running on the host — thinking, calling tools, or
   * writing, all of it.
   *
   * **Distinct from a `streaming` row, and that distinction is the point.**
   * A streaming row means text is arriving *right now*; it goes false at
   * every round boundary and during every tool call. Using it as "is the
   * agent working" is what made the Stop button disappear mid-turn.
   */
  turnInFlight: boolean;
  /**
   * `true` when the attached host's `attach` payload omitted `turnInProgress`
   * entirely — an engine built before core#30 (see `Instance.turnInProgress`'s
   * doc comment in `events.ts`). Such a host also never broadcasts
   * `turn_started`/`turn_ended`, so `turnInFlight` would sit permanently
   * `false` against it and Stop would never appear.
   *
   * **A compatibility shim for a host behind this app, not a second source of
   * truth.** The caller (the session screen) is expected to fall back to a
   * streaming-derived binding only while this is `true`; when it's `false` —
   * every current host — `turnInFlight` is the only signal and the
   * two-signals-two-jobs design is untouched. Delete this field, and the
   * fallback it gates, once no engine predating core#30 is in service.
   */
  turnStateUnsupported: boolean;
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
/**
 * The message to show for a failed mutation.
 *
 * A device refusal gets the phone-side sentence rather than the engine's own,
 * which is written for whoever is at the host's terminal — it names a command
 * (`armillary-engine enroll`) that cannot be run from here and arrives with a
 * machine code glued to the front. Everything else keeps the engine's text
 * verbatim, which is what makes `turn_in_progress` and `unknown_instance`
 * readable today.
 */
function mutationErrorMessage(error: unknown, onRefusal: (r: DeviceRefusal) => void): string {
  const refusal = error instanceof Error ? deviceRefusalOf(error.message) : null;
  if (refusal) {
    onRefusal(refusal);
    return REFUSAL_REASON[refusal];
  }
  return error instanceof Error ? error.message : String(error);
}

export function useSession(
  api: SessionAPI,
  instanceId: string,
  enabled = true,
  /**
   * Told when the engine refuses a mutation on device grounds.
   *
   * INJECTED rather than read from `useAuth()` here, deliberately. This is a
   * library hook and `api` is already injected for the same reason — reaching
   * for a provider would make it untestable without one and couple the session
   * layer to the app's context tree. The screen supplies `noteRefusal`; a
   * caller that has no auth context (the mock, a test) supplies nothing.
   */
  onDeviceRefusal: (r: DeviceRefusal) => void = () => {},
): UseSessionResult {
  const [durable, setDurable] = useState<EventEnvelope[]>([]);
  const [transients, setTransients] = useState<Map<string, AssistantDeltaData>>(new Map());
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus>('replaying');
  const [gap, setGap] = useState<GapInfo | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [turnInFlight, setTurnInFlight] = useState(false);
  const [turnStateUnsupported, setTurnStateUnsupported] = useState(false);

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
  // Bumped by every turn-lifecycle transient (TURN_STARTED and TURN_ENDED
  // alike — direction doesn't matter, only recency). A re-read `attach()`
  // captures this value before it fires and compares on return: if it moved,
  // the live channel said something about `turnInFlight` more recently than
  // this HTTP response can possibly know about, and the read is stale by
  // construction — apply it anyway and a `turn_started` that arrived while
  // the read was in flight gets silently overwritten back to the read's
  // (already outdated) `false`. Same failure shape as the primary
  // attach→subscribe gap this task exists to close, just narrower: two
  // channels (stream vs. HTTP) with no ordering guarantee between them.
  const turnSignalSeq = useRef(0);

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
    // Fires the guarded turnInFlight re-read once for THIS subscription (not
    // once per epoch — a reconnect calls makeHandler again and owns its own
    // fresh window). See `rereadTurnState`'s comment for why it's gated on
    // the first non-`closed` status rather than on `subscribe()` returning.
    let rereadTriggered = false;
    return {
      onEvent: (e) => {
        if (epoch.current !== mine) return;
        if (e.seq === 0) {
          // Transient: seq 0, never persisted (invariant iii).
          //
          // Turn lifecycle markers, ahead of the drop-unknown-transients guard
          // below: they govern `turnInFlight`, not the transcript, so they
          // never reach `projectSession`.
          if (e.type === TURN_STARTED) {
            turnSignalSeq.current++;
            setTurnInFlight(true);
            return;
          }
          if (e.type === TURN_ENDED) {
            turnSignalSeq.current++;
            setTurnInFlight(false);
            // A turn's end also retires any transient it left behind. Without
            // this, an interrupted turn whose last delta never got a matching
            // durable assistant_message would keep a streaming row alive
            // indefinitely.
            setTransients(new Map());
            return;
          }
          // **The type check is not redundant with the seq check.** `seq === 0`
          // alone meant every transient was cast to a delta, so an unrecognized
          // one keyed the map under `undefined` and no `assistant_message`
          // could ever clear it — a permanently frozen streaming bubble from
          // one event this client was never taught. A transient's scope equals
          // the durable event it previews; one we cannot name previews nothing,
          // and dropping it loses no record, because the record is the log.
          if (e.type !== ASSISTANT_DELTA) return;
          // Keyed by generation, snapshot semantics (I-4) — data is the text so
          // far, never a delta to append.
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
        // The lifecycle markers govern the instance RECORD, not the transcript.
        // `projectSession` deliberately renders no row for them (design
        // 2026-08-11 D6) — that decision was about this chat's rows, and it
        // stands. But `instance` here is set once by attach() and never again,
        // so without this the panel's verb goes stale the moment it is used:
        // archive from the panel, and it still offers "Archive".
        if (e.type === 'instance_archived' || e.type === 'instance_unarchived') {
          const archived = e.type === 'instance_archived';
          setInstance((prev) => (prev ? { ...prev, archived } : prev));
        }
        // The title daemon's output is the same shape of problem, one turn
        // later: `instance_renamed` lands as a durable event on the open
        // subscription (the daemon appends it before the operator's model call
        // each turn), but `instance.title` was frozen at attach() — so a
        // freshly-named instance kept showing the model fallback in the header
        // forever. Same fix as `archived` above: fold the event into the record
        // so the header re-renders with the live title.
        if (e.type === 'instance_renamed') {
          const data = e.data as { title?: unknown };
          if (typeof data.title === 'string') {
            setInstance((prev) => (prev ? { ...prev, title: data.title } : prev));
          }
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
          // A dropped connection tells us nothing about whether the turn is
          // still running on the host. Held rather than cleared: the
          // reconnect re-attaches, and attach's `turnInProgress` is
          // authoritative. Clearing here would show idle for the reconnect
          // window on a turn that is still going.
          scheduleReconnect(mine);
          return;
        }
        // First non-closed status this subscription has produced — the
        // earliest point a `fetch` dispatch can possibly be a genuine
        // happens-after signal that the subscription actually exists server-
        // side. See `rereadTurnState`.
        if (!rereadTriggered) {
          rereadTriggered = true;
          rereadTurnState(mine);
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
      // Same hazard as the initial attach→subscribe gap, on reconnect:
      // `tail_envelopes` ends the stream on `Lagged`, transients are never in
      // the log, so a `turn_ended` missed during the drop can never be
      // replayed — a client that only replays from its cursor would stay
      // "working" forever. The fresh handler this call creates owns its own
      // `rereadTriggered` flag, so its first non-closed status re-runs the
      // same guarded re-read as the initial subscribe — one mechanism, both
      // sites.
      unsubscribeRef.current = apiRef.current.subscribe(stream, fromSeq, makeHandler(mine));
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Re-reads `attach()` and applies its `turnInProgress`, guarded against a
   * live channel that has since spoken more recently (`turnSignalSeq`) and
   * against a stale epoch. Three call sites share this: the first non-closed
   * status a subscription produces (initial and every reconnect, via
   * `makeHandler`'s `onStatus`), and after `interrupt()` resolves.
   *
   * **Why gated on a status, not on `subscribe()` returning.**
   * `LiveSessionAPI.subscribe()` (`live.ts`) registers nothing synchronously
   * — it dispatches a `fetch` and returns an abort closure. Server-side,
   * `routes/subscribe.rs` does a blocking filesystem existence check BEFORE
   * `subscribe_live()` creates the broadcast receiver, so the receiver exists
   * one dispatch plus one FS call later than `subscribe()` returns. A turn
   * starting in that window broadcasts `turn_started` to zero receivers, and
   * a re-read fired right after `subscribe()` returns (a separate connection,
   * no ordering guarantee against the server-side timeline) can be evaluated
   * before the receiver exists — stuck idle for a whole real turn, or stuck
   * `true` with Stop replacing Send and no way to send at all. The engine
   * cannot emit a `'replaying'`/`'live'` status before `subscribe_live` has
   * actually run, so the first such status this handler receives IS a
   * genuine happens-after signal; `subscribe()` returning is not.
   *
   * **The retry.** A failed re-read is not evidence the turn ended — but
   * silently keeping whatever `turnInFlight` already held is only safe if
   * something will correct it later, and nothing will: transients are
   * unreplayable by design, so a turn that ended during the failure's window
   * has no second chance to say so. One guarded retry after
   * `RECONNECT_DELAY_MS`, not a loop — cheap, and enough to ride out a
   * transient blip without hammering a host that's actually down.
   */
  function rereadTurnState(mine: number, isRetry = false): void {
    const signalBeforeRead = turnSignalSeq.current;
    void (async () => {
      try {
        const fresh = await apiRef.current.attach(instanceId);
        if (epoch.current === mine && turnSignalSeq.current === signalBeforeRead) {
          setTurnInFlight(fresh.instance.turnInProgress ?? false);
        }
      } catch {
        if (isRetry || epoch.current !== mine) return;
        setTimeout(() => {
          if (epoch.current === mine) rereadTurnState(mine, true);
        }, RECONNECT_DELAY_MS);
      }
    })();
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
    setInstance(null);
    setTurnInFlight(false);
    setTurnStateUnsupported(false);
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
      setInstance(attachInfo.instance);
      // The mid-turn case: no `turn_started` will ever arrive for a turn that
      // began before this client connected, so the attach payload is the only
      // source. `?? false` because an engine built before this field omits it.
      setTurnInFlight(attachInfo.instance.turnInProgress ?? false);
      // Fix 4: distinguish "the field says false" from "the field is absent" —
      // only the latter means the host predates core#30 and needs the
      // streaming-derived fallback (see `UseSessionResult.turnStateUnsupported`).
      setTurnStateUnsupported(attachInfo.instance.turnInProgress === undefined);

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
      // A turn that began during the attach→subscribe window broadcasts its
      // `turn_started` into a void — the fresh handler's first non-closed
      // status re-reads `attach` to catch it (`rereadTurnState`, triggered
      // from `makeHandler`'s `onStatus`). Ordering is the whole point: once
      // the subscription genuinely exists, any LATER turn arrives as a
      // transient, and any EARLIER one is visible in that read — together
      // they cover the line.
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
        setSendError(mutationErrorMessage(error, onDeviceRefusal));
        return false;
      }
    },
    [instanceId, onDeviceRefusal],
  );

  // `interrupt` and `evict` are gated mutations like `send`, and both are
  // called as `void interrupt()` from the screen — so a rejection was
  // swallowed as an unhandled promise rejection: Stop did nothing, said
  // nothing, and (after a revoke) left the app still believing it was
  // enrolled. `send` was given this treatment and its two siblings four lines
  // below were missed.
  //
  // Every failure surfaces, not only a refusal: a Stop that quietly fails is
  // the "quietly broken" shape regardless of why it failed. Reuses
  // `sendError`, which already documents itself as the channel for the most
  // recent rejected mutation.
  const interrupt = useCallback(async (): Promise<void> => {
    const mine = epoch.current;
    try {
      await apiRef.current.interrupt(instanceId);
      // Fix 6: the user's only escape from a wrongly-stuck `true` — since
      // Stop wholly replaces Send, a wedge here otherwise has no way out
      // short of unmounting. An interrupt against a turn already gone is a
      // 204 no-op, and this re-read then self-heals the wedge; against a
      // genuinely running turn it just re-confirms `true`. Same guarded
      // mechanism as the post-subscribe re-read (Fix 1) and its retry
      // (Fix 3) — harmless either way.
      rereadTurnState(mine);
    } catch (error) {
      setSendError(mutationErrorMessage(error, onDeviceRefusal));
    }
    // rereadTurnState, like makeHandler/scheduleReconnect above, is a plain
    // hoisted function closing only over refs — deliberately excluded from
    // this list for the same reason the main effect excludes them (see its
    // own eslint-disable comment below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, onDeviceRefusal]);

  const evict = useCallback(
    async (eventId: string): Promise<void> => {
      try {
        await apiRef.current.evict(instanceId, eventId);
      } catch (error) {
        setSendError(mutationErrorMessage(error, onDeviceRefusal));
      }
    },
    [instanceId, onDeviceRefusal],
  );

  const rows = useMemo(() => projectSession(durable, transients, pending), [durable, transients, pending]);

  return {
    rows,
    status,
    gap,
    send,
    interrupt,
    evict,
    sendError,
    instance,
    turnInFlight,
    turnStateUnsupported,
  };
}
