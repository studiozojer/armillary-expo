import type { SessionAPI } from './api';
import type {
  AttachInfo,
  DurableType,
  EventEnvelope,
  Instance,
  SendReceipt,
  SubscriptionHandler,
  Unsubscribe,
  UserMessageData,
} from './events';

/** `instance_created` has no dedicated payload type in the design — it just names who started. */
type InstanceCreatedData = { operator: string | null };

export class MockSessionAPI implements SessionAPI {
  private instances = new Map<string, Instance>();
  /** Keyed by stream. Only durable events (seq > 0) live here — invariant iii's ledger. */
  private events = new Map<string, EventEnvelope[]>();
  private listeners = new Map<string, SubscriptionHandler[]>();
  private counter = 0;
  private readonly earliestSeq: number;
  private readonly fragmentDelayMs: number;

  constructor(opts?: { earliestSeq?: number; fragmentDelayMs?: number }) {
    this.earliestSeq = opts?.earliestSeq ?? 1;
    this.fragmentDelayMs = opts?.fragmentDelayMs ?? 0;
  }

  private append<T>(stream: string, type: DurableType, data: T): EventEnvelope<T> {
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
      actor: { role: 'user' },
      type,
      version: 1,
      data,
    };
    list.push(event);
    this.events.set(stream, list);

    for (const handler of this.listeners.get(stream) ?? []) handler.onEvent(event);

    return event;
  }

  private headSeq(stream: string): number {
    const list = this.events.get(stream) ?? [];
    return list[list.length - 1]?.seq ?? 0;
  }

  async create(operator: string | null): Promise<Instance> {
    const id = `inst-mock-${++this.counter}`;
    const instance: Instance = {
      id,
      operator,
      stream: id,
      startedAt: new Date().toISOString(),
      lastSeq: 0,
    };
    this.instances.set(id, instance);

    const created = this.append<InstanceCreatedData>(id, 'instance_created', { operator });
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
    const list = this.listeners.get(stream) ?? [];
    list.push(handler);
    this.listeners.set(stream, list);

    handler.onStatus('replaying');
    queueMicrotask(() => {
      const durable = (this.events.get(stream) ?? []).filter(
        (e) => e.seq > fromSeq && e.seq >= this.earliestSeq,
      );
      for (const event of durable) handler.onEvent(event);
      handler.onStatus('live');
    });

    return () => {
      this.listeners.set(
        stream,
        (this.listeners.get(stream) ?? []).filter((h) => h !== handler),
      );
    };
  }

  async send(instanceId: string, text: string, clientKey: string): Promise<SendReceipt> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`no such instance: ${instanceId}`);

    const event = this.append<UserMessageData>(instance.stream, 'user_message', { text, clientKey });
    instance.lastSeq = event.seq;

    return { id: event.id, seq: event.seq };
  }

  async interrupt(_instanceId: string): Promise<void> {
    throw new Error('unimplemented');
  }

  async evict(_instanceId: string, _eventId: string): Promise<void> {
    throw new Error('unimplemented');
  }
}
