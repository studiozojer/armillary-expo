import type { SessionAPI } from './api';
import type {
  Actor,
  AssistantDeltaData,
  AssistantMessageData,
  AttachInfo,
  ContextEvictData,
  DurableType,
  EventEnvelope,
  Instance,
  SendReceipt,
  SubscriptionHandler,
  TurnLifecycleData,
  Unsubscribe,
  UserMessageData,
} from './events';
import { ASSISTANT_DELTA, TURN_ENDED, TURN_STARTED } from './events';

/** `instance_created` has no dedicated payload type in the design — it just names who started
 *  and, since Task 6, which model was pinned (null when the engine's default pilots). Duplicated
 *  in `project.ts` (a known deferred item) — keep the two in step. */
type InstanceCreatedData = { operator: string | null; model: string | null };
/** `interrupt` has no dedicated payload in the design — the event *type* + actor carries the meaning. */
type InterruptData = Record<string, never>;

/** Built cumulatively word-by-word into each transient snapshot (I-4: snapshot, never delta). */
const CANNED_REPLY = 'the log remembers what actually happened here, not what was meant.'.split(' ');

/** A subscription's tail-delivery state, tracked apart from the raw handler so a
 *  synchronous append during replay can be buffered instead of delivered early
 *  (see `subscribe`). */
type ListenerEntry = {
  handler: SubscriptionHandler;
  replaying: boolean;
  buffer: EventEnvelope[];
};

/** Tracks the in-flight canned generation for an instance, so `interrupt` has
 *  something concrete to cancel and a last snapshot to keep. */
type PendingGeneration = {
  timer: ReturnType<typeof setTimeout>;
  generation: string;
  textSoFar: string;
  actor: Actor;
};

export class MockSessionAPI implements SessionAPI {
  private instances = new Map<string, Instance>();
  /** Keyed by stream. Only durable events (seq > 0) live here — invariant iii's ledger. */
  private events = new Map<string, EventEnvelope[]>();
  private listeners = new Map<string, ListenerEntry[]>();
  private pendingGenerations = new Map<string, PendingGeneration>();
  private counter = 0;
  private readonly earliestSeq: number;
  private readonly fragmentDelayMs: number;

  constructor(opts?: { earliestSeq?: number; fragmentDelayMs?: number }) {
    this.earliestSeq = opts?.earliestSeq ?? 1;
    this.fragmentDelayMs = opts?.fragmentDelayMs ?? 25;
  }

  private append<T>(
    stream: string,
    type: DurableType,
    data: T,
    actor: Actor = { role: 'user' },
  ): EventEnvelope<T> {
    const list = this.events.get(stream) ?? [];
    const seq = (list[list.length - 1]?.seq ?? 0) + 1;
    const event: EventEnvelope<T> = {
      stream,
      // `stream:seq:random`, not an array index. Invariant (ii) forbids
      // position-as-identity, and a mock should not teach a shape the real log
      // rejects — the stub is what the next implementer reads first.
      id: `${stream}:${seq}:${Math.random().toString(36).slice(2, 8)}`,
      seq,
      ts: new Date().toISOString(),
      actor,
      type,
      version: 1,
      data,
    };
    list.push(event);
    this.events.set(stream, list);

    for (const entry of this.listeners.get(stream) ?? []) {
      if (entry.replaying) entry.buffer.push(event);
      else entry.handler.onEvent(event);
    }

    return event;
  }

  /** Transients: seq 0, never stored, never replayed (I-4). Delivered straight to
   *  whoever's listening now — they're not part of the replay/buffer ordering
   *  problem `subscribe` solves for durable events. */
  private emitTransient<T>(stream: string, type: string, data: T, actor: Actor): void {
    const event: EventEnvelope<T> = {
      stream,
      id: `${stream}:0:${Math.random().toString(36).slice(2, 8)}`,
      seq: 0,
      ts: new Date().toISOString(),
      actor,
      type,
      version: 1,
      data,
    };
    for (const entry of this.listeners.get(stream) ?? []) entry.handler.onEvent(event);
  }

  private startGeneration(instance: Instance, generation: string): void {
    const actor: Actor = { role: 'operator', instance: instance.operator ?? 'dispatcher' };
    let index = 0;
    // Mirrors the engine's `begin_turn`/`end_turn`: this mock models a turn's
    // full lifetime (fragmented deltas, then a durable finalizer or an
    // interrupt), so `turnInProgress` tracks it the same way a real engine's
    // in-memory turn slot would — true from here until the generation ends,
    // one way or the other.
    instance.turnInProgress = true;
    // Broadcast, not just recorded on the instance: a client already attached
    // and subscribed learns of this turn from the live channel, the same way
    // it would from the real engine's `begin_turn` — mirroring `turnInProgress`
    // as a field alone only covers a client that attaches (or re-attaches)
    // after the fact.
    this.emitTransient<TurnLifecycleData>(instance.stream, TURN_STARTED, { generation }, actor);

    const step = () => {
      index++;
      const textSoFar = CANNED_REPLY.slice(0, index).join(' ');
      this.emitTransient<AssistantDeltaData>(instance.stream, ASSISTANT_DELTA, { textSoFar, generation }, actor);

      if (index < CANNED_REPLY.length) {
        const timer = setTimeout(step, this.fragmentDelayMs);
        this.pendingGenerations.set(instance.id, { timer, generation, textSoFar, actor });
      } else {
        this.pendingGenerations.delete(instance.id);
        instance.turnInProgress = false;
        // Ordering mirrors the engine: `EndTurnGuard` drops `turn_ended` AFTER
        // the final `assistant_message` append, never before, so a consumer
        // reading "the newest event while a turn is in flight" sees the
        // durable finalizer first.
        this.append<AssistantMessageData>(
          instance.stream,
          'assistant_message',
          { text: textSoFar, generation },
          actor,
        );
        this.emitTransient<TurnLifecycleData>(instance.stream, TURN_ENDED, { generation }, actor);
      }
    };

    const timer = setTimeout(step, this.fragmentDelayMs);
    this.pendingGenerations.set(instance.id, { timer, generation, textSoFar: '', actor });
  }

  private headSeq(stream: string): number {
    const list = this.events.get(stream) ?? [];
    return list[list.length - 1]?.seq ?? 0;
  }

  async create(operator: string | null, model: string | null): Promise<Instance> {
    const id = `inst-mock-${++this.counter}`;
    const instance: Instance = {
      id,
      operator,
      stream: id,
      startedAt: new Date().toISOString(),
      lastSeq: 0,
      model,
      mayWriteComposition: false,
      archived: false,
      turnInProgress: false,
    };
    this.instances.set(id, instance);

    const created = this.append<InstanceCreatedData>(id, 'instance_created', { operator, model });
    instance.lastSeq = created.seq;

    return { ...instance };
  }

  async list(): Promise<Instance[]> {
    return [...this.instances.values()].map((i) => ({ ...i, lastSeq: this.headSeq(i.stream) }));
  }

  async attach(instanceId: string): Promise<AttachInfo> {
    const found = this.instances.get(instanceId);
    if (!found) throw new Error(`no such instance: ${instanceId}`);
    return {
      instance: { ...found, lastSeq: this.headSeq(found.stream) },
      earliestSeq: this.earliestSeq,
      headSeq: this.headSeq(found.stream),
    };
  }

  subscribe(stream: string, fromSeq: number, handler: SubscriptionHandler): Unsubscribe {
    const entry: ListenerEntry = { handler, replaying: true, buffer: [] };
    const list = this.listeners.get(stream) ?? [];
    list.push(entry);
    this.listeners.set(stream, list);

    handler.onStatus('replaying');

    // The engine fires iff `from + 1 < earliest_seq` — i.e. there's at least
    // one seq strictly between the cursor and what's available. `fromSeq <
    // earliestSeq` alone over-fires: a fresh subscribe (fromSeq 0, default
    // earliestSeq 1) has nothing missing between them, yet that looser
    // check would still call onGap.
    if (fromSeq + 1 < this.earliestSeq) {
      handler.onGap({ requestedFrom: fromSeq, earliestAvailable: this.earliestSeq });
    }

    queueMicrotask(() => {
      const durable = (this.events.get(stream) ?? []).filter(
        (e) => e.seq > fromSeq && e.seq >= this.earliestSeq,
      );
      const deliveredSeqs = new Set<number>();
      for (const event of durable) {
        handler.onEvent(event);
        deliveredSeqs.add(event.seq);
      }

      // Ordering hole: a send() landing synchronously between subscribe() and
      // this tick appends via the live path above (`append`'s notify loop),
      // which — before this fix — called handler.onEvent immediately, ahead of
      // the replay batch that (moments later) contains that same event again.
      // `append` now buffers instead of delivering while `entry.replaying` is
      // true, so anything that arrived during replay is here, in arrival
      // order; drop what the replay batch already covered and flush the rest.
      entry.replaying = false;
      const tail = entry.buffer
        .filter((e) => !deliveredSeqs.has(e.seq))
        .sort((a, b) => a.seq - b.seq);
      entry.buffer = [];
      for (const event of tail) handler.onEvent(event);

      handler.onStatus('live');
    });

    return () => {
      this.listeners.set(
        stream,
        (this.listeners.get(stream) ?? []).filter((e) => e !== entry),
      );
    };
  }

  async send(instanceId: string, text: string, clientKey: string): Promise<SendReceipt> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`no such instance: ${instanceId}`);

    // Ordering mirrors the engine: `begin_turn` precedes the durable
    // `user_message` append, not the other way around. The generation label
    // is derived from the seq `append` is ABOUT to assign — exactly
    // `append`'s own `(list[list.length - 1]?.seq ?? 0) + 1` — so
    // `turn_started` can fire before that event exists in the log.
    const generation = `gen-${this.headSeq(instance.stream) + 1}`;
    this.startGeneration(instance, generation);

    const event = this.append<UserMessageData>(instance.stream, 'user_message', { text, clientKey });
    instance.lastSeq = event.seq;

    return { id: event.id, seq: event.seq };
  }

  async interrupt(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('unknown_instance');

    const pending = this.pendingGenerations.get(instanceId);
    if (!pending) return; // idempotent: nothing running, nothing appended.

    clearTimeout(pending.timer);
    this.pendingGenerations.delete(instanceId);
    instance.turnInProgress = false;

    this.append<InterruptData>(instance.stream, 'interrupt', {}, { role: 'user' });
    this.append<AssistantMessageData>(
      instance.stream,
      'assistant_message',
      { text: pending.textSoFar, generation: pending.generation, interrupted: true },
      pending.actor,
    );
    // `end_turn` is unconditional on the real engine — success, interruption,
    // or failure alike (see `startGeneration`'s comment) — so a client that
    // learned `turn_started` from the live channel needs the matching
    // `turn_ended` here too. Without it, a subscribed client's `turnInFlight`
    // (and therefore Stop/canInterrupt) would stay wedged true after the very
    // press meant to clear it, until the next attach re-read. Emitted AFTER
    // the final `assistant_message`, matching `EndTurnGuard`'s drop order on
    // the real engine (see `startGeneration`'s matching comment).
    this.emitTransient<TurnLifecycleData>(instance.stream, TURN_ENDED, { generation: pending.generation }, pending.actor);
  }

  async evict(instanceId: string, eventId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('unknown_instance');

    const target = (this.events.get(instance.stream) ?? []).find((e) => e.id === eventId);
    if (!target) throw new Error('unknown_event');

    // Evict never removes anything (P-1) — it appends a marker the context
    // reducer honors; the target stays in the stream untouched.
    this.append<ContextEvictData>(instance.stream, 'context_evict', { target: eventId }, { role: 'user' });
  }

  async archive(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('unknown_instance');

    // Like evict: state changes by APPENDING a marker, never by deleting
    // (P-1). The flag on the summary is the projection of the latest marker.
    instance.archived = true;
    this.append<Record<string, never>>(instance.stream, 'instance_archived', {}, { role: 'user' });
  }

  async unarchive(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('unknown_instance');

    instance.archived = false;
    this.append<Record<string, never>>(instance.stream, 'instance_unarchived', {}, { role: 'user' });
  }
}
