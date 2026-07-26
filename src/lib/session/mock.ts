import type { SessionAPI } from './api';
import type { EventEnvelope, Instance } from './events';

const FIXTURES: Instance[] = [
  {
    id: 'inst-tycho-01',
    operator: 'tycho',
    stream: 'inst-tycho-01',
    startedAt: '2026-07-26T09:12:00.000Z',
    lastSeq: 42,
  },
  {
    id: 'inst-dispatch-01',
    operator: null,
    stream: 'inst-dispatch-01',
    startedAt: '2026-07-26T11:03:00.000Z',
    lastSeq: 7,
  },
];

export class MockSessionAPI implements SessionAPI {
  private instances: Instance[] = FIXTURES.map((i) => ({ ...i }));
  private listeners = new Map<string, ((event: EventEnvelope) => void)[]>();
  private counter = 0;

  async create(operator: string | null): Promise<Instance> {
    const id = `inst-mock-${++this.counter}`;
    const instance: Instance = {
      id,
      operator,
      stream: id,
      startedAt: new Date().toISOString(),
      lastSeq: 0,
    };
    this.instances.push(instance);
    return instance;
  }

  async list(): Promise<Instance[]> {
    return this.instances.map((i) => ({ ...i }));
  }

  async attach(instanceId: string): Promise<Instance> {
    const found = this.instances.find((i) => i.id === instanceId);
    if (!found) throw new Error(`no such instance: ${instanceId}`);
    return found;
  }

  subscribe(
    instanceId: string,
    _fromSeq: number,
    onEvent: (event: EventEnvelope) => void,
  ): () => void {
    const list = this.listeners.get(instanceId) ?? [];
    list.push(onEvent);
    this.listeners.set(instanceId, list);
    return () => {
      this.listeners.set(
        instanceId,
        (this.listeners.get(instanceId) ?? []).filter((fn) => fn !== onEvent),
      );
    };
  }

  async send(instanceId: string, text: string): Promise<void> {
    const instance = await this.attach(instanceId);
    instance.lastSeq += 1;

    const event: EventEnvelope<{ text: string }> = {
      stream: instance.stream,
      // `stream:seq`, not an array index. Invariant (ii) forbids
      // position-as-identity, and a mock should not teach a shape the real log
      // rejects — the stub is what the next implementer reads first.
      id: `${instance.stream}:${instance.lastSeq}`,
      seq: instance.lastSeq,
      ts: new Date().toISOString(),
      actor: { role: 'user' },
      type: 'user_message',
      version: 1,
      data: { text },
    };

    for (const listener of this.listeners.get(instanceId) ?? []) listener(event);
  }
}
