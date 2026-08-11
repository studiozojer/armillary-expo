import { MockSessionAPI } from '../src/lib/session/mock';
import { ASSISTANT_DELTA } from '../src/lib/session/events';
import type {
  AssistantDeltaData,
  AssistantMessageData,
  ContextEvictData,
  EventEnvelope,
  GapInfo,
  SubscriptionHandler,
  SubscriptionStatus,
  UserMessageData,
} from '../src/lib/session/events';

const handlerCollecting = (seen: EventEnvelope[]): SubscriptionHandler => ({
  onEvent: (e) => seen.push(e),
  onStatus: () => {},
  onGap: () => {},
});

describe('MockSessionAPI honesty obligations', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits snapshot transients that a durable event with the same generation supersedes', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);
    const seen: EventEnvelope[] = [];
    api.subscribe(inst.stream, 0, handlerCollecting(seen));
    await api.send(inst.id, 'hi', 'k');
    await jest.advanceTimersByTimeAsync(500);

    const transients = seen.filter((e) => e.type === ASSISTANT_DELTA);
    const finals = seen.filter((e) => e.type === 'assistant_message');
    expect(transients.length).toBeGreaterThan(1);
    // snapshots, not increments: each textSoFar contains the previous one
    for (let i = 1; i < transients.length; i++)
      expect((transients[i].data as AssistantDeltaData).textSoFar)
        .toContain((transients[i - 1].data as AssistantDeltaData).textSoFar);
    expect(finals).toHaveLength(1);
    expect((finals[0].data as AssistantMessageData).generation)
      .toBe((transients[0].data as AssistantDeltaData).generation);
    expect(transients.every((e) => e.seq === 0)).toBe(true);
  });

  it('pins the chosen model on the instance and on instance_created, and null when none was chosen', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI();
    const seen: EventEnvelope[] = [];

    const withModel = await api.create('tycho', 'zen/deepseek-v4-flash');
    api.subscribe(withModel.stream, 0, handlerCollecting(seen));
    await jest.advanceTimersByTimeAsync(0);

    expect(withModel.model).toBe('zen/deepseek-v4-flash');
    const created = seen.find((e) => e.type === 'instance_created' && e.stream === withModel.stream);
    expect((created!.data as { model: string | null }).model).toBe('zen/deepseek-v4-flash');

    const withoutModel = await api.create('tycho', null);
    expect(withoutModel.model).toBeNull();
  });

  it('never fires the gap signal for a fresh subscribe at the default earliestSeq', async () => {
    jest.useFakeTimers();
    // Default earliestSeq (1): a from=0 subscribe on a brand-new session has
    // nothing missing between the cursor and what's available — the engine
    // itself only fires when `from + 1 < earliest_seq`, and 0 + 1 is not < 1.
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);

    const gaps: GapInfo[] = [];
    api.subscribe(inst.stream, 0, {
      onEvent: () => {},
      onStatus: () => {},
      onGap: (g) => gaps.push(g),
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(gaps).toEqual([]);
  });

  it('fires the gap signal when the cursor predates earliestSeq', async () => {
    jest.useFakeTimers();
    // Fake timers + never advancing them: the canned generation's setTimeout
    // chain never fires, so it can't add events to this test's window.
    const api = new MockSessionAPI({ earliestSeq: 5 });
    const inst = await api.create('tycho', null);
    for (let i = 0; i < 8; i++) await api.send(inst.id, `msg-${i}`, `k${i}`);
    // instance_created (seq 1) + 8 user_message (seq 2..9) = 9 durable events.

    const seen: EventEnvelope[] = [];
    const gaps: GapInfo[] = [];
    api.subscribe(inst.stream, 2, {
      onEvent: (e) => seen.push(e),
      onStatus: () => {},
      onGap: (g) => gaps.push(g),
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(gaps).toEqual([{ requestedFrom: 2, earliestAvailable: 5 }]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((e) => e.seq >= 5)).toBe(true);
  });

  it('interrupt mid-generation lands a durable partial marked incomplete', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI({ fragmentDelayMs: 25 });
    const inst = await api.create('tycho', null);
    const seen: EventEnvelope[] = [];
    api.subscribe(inst.stream, 0, handlerCollecting(seen));
    await api.send(inst.id, 'hi', 'k');

    // advance past (at least) 2 fragments
    await jest.advanceTimersByTimeAsync(60);
    const transientsSoFar = seen.filter((e) => e.type === ASSISTANT_DELTA);
    expect(transientsSoFar.length).toBeGreaterThanOrEqual(2);
    const lastTextSoFar = (transientsSoFar[transientsSoFar.length - 1].data as AssistantDeltaData).textSoFar;

    await api.interrupt(inst.id);
    // advance well past when the rest of the canned reply would have streamed
    await jest.advanceTimersByTimeAsync(1000);

    const finals = seen.filter((e) => e.type === 'assistant_message');
    const interrupts = seen.filter((e) => e.type === 'interrupt');
    expect(finals).toHaveLength(1);
    expect((finals[0].data as AssistantMessageData).interrupted).toBe(true);
    expect((finals[0].data as AssistantMessageData).text).toBe(lastTextSoFar);
    expect(interrupts).toHaveLength(1);
    // durable interrupt event is user-authored (D3).
    expect(interrupts[0].actor.role).toBe('user');

    // idempotent: interrupting again with no generation running resolves without error, appends nothing.
    await expect(api.interrupt(inst.id)).resolves.toBeUndefined();
    expect(seen.filter((e) => e.type === 'interrupt')).toHaveLength(1);
    expect(seen.filter((e) => e.type === 'assistant_message')).toHaveLength(1);
  });

  it('evict appends context_evict and never removes the target', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);
    const receipt = await api.send(inst.id, 'hi', 'k');

    await api.evict(inst.id, receipt.id);

    const seen: EventEnvelope[] = [];
    api.subscribe(inst.stream, 0, handlerCollecting(seen));
    await jest.advanceTimersByTimeAsync(0);

    const target = seen.find((e) => e.id === receipt.id);
    expect(target).toBeDefined();
    expect((target!.data as UserMessageData).text).toBe('hi');

    const evictEvent = seen.find((e) => e.type === 'context_evict');
    expect(evictEvent).toBeDefined();
    expect((evictEvent!.data as ContextEvictData).target).toBe(receipt.id);
    expect(evictEvent!.actor.role).toBe('user');

    await expect(api.evict(inst.id, 'nonexistent-id')).rejects.toThrow('unknown_event');
  });

  it('buffers a tail event that lands between subscribe and its replay tick, delivering it once and in order', async () => {
    jest.useFakeTimers();
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);
    await api.send(inst.id, 'seed', 'k0'); // durable, present before subscribe

    const seen: EventEnvelope[] = [];
    const statuses: SubscriptionStatus[] = [];
    api.subscribe(inst.stream, 0, {
      onEvent: (e) => seen.push(e),
      onStatus: (s) => statuses.push(s),
      onGap: () => {},
    });
    // Synchronous send between subscribe() and its deferred replay tick.
    await api.send(inst.id, 'race', 'k1');

    await jest.advanceTimersByTimeAsync(0);

    const messages = seen.filter((e) => e.type === 'user_message');
    expect(messages.map((e) => (e.data as UserMessageData).text)).toEqual(['seed', 'race']);
    expect(seen.filter((e) => (e.data as Partial<UserMessageData>).text === 'race')).toHaveLength(1);
    expect(statuses).toEqual(['replaying', 'live']);
  });

  it('archive appends the marker and flips the listing flag; unarchive restores it', async () => {
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);
    const seen: EventEnvelope[] = [];
    api.subscribe(inst.stream, 0, handlerCollecting(seen));

    await api.archive(inst.id);
    expect((await api.list())[0].archived).toBe(true);

    await api.unarchive(inst.id);
    expect((await api.list())[0].archived).toBe(false);

    // P-1 shape: state changed by APPENDING, never by rewriting — both
    // markers are durable events in the stream, in order.
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    const markers = seen.filter((e) => e.type.startsWith('instance_') && e.type !== 'instance_created');
    expect(markers.map((e) => e.type)).toEqual(['instance_archived', 'instance_unarchived']);
  });

  it('archive on an unknown instance throws unknown_instance', async () => {
    const api = new MockSessionAPI();
    await expect(api.archive('nope')).rejects.toThrow('unknown_instance');
  });
});
