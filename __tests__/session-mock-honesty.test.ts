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
    const inst = await api.create('tycho');
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

  it('never fires the gap signal for a fresh subscribe at the default earliestSeq', async () => {
    jest.useFakeTimers();
    // Default earliestSeq (1): a from=0 subscribe on a brand-new session has
    // nothing missing between the cursor and what's available — the engine
    // itself only fires when `from + 1 < earliest_seq`, and 0 + 1 is not < 1.
    const api = new MockSessionAPI();
    const inst = await api.create('tycho');

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
    const inst = await api.create('tycho');
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
    const inst = await api.create('tycho');
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
    const inst = await api.create('tycho');
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
    const inst = await api.create('tycho');
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
});
