// The envelope declares $schema draft 2020-12; ajv's default export is
// draft-07 and refuses it outright.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import schema from '../../../repos/armillary-core/schema/event.schema.json';
import { MockSessionAPI } from '../src/lib/session/mock';
import type { AssistantMessageData, EventEnvelope, SubscriptionStatus, UserMessageData, ThinkingBlock } from '../src/lib/session/events';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('MockSessionAPI', () => {
  it('emits events that validate against the constitution envelope schema', async () => {
    // Validated against armillary-core's own schema rather than a hand-written
    // type, so the stub cannot drift from the envelope it claims to implement.
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const api = new MockSessionAPI();
    const instance = await api.create('tycho', null);

    const seen: EventEnvelope[] = [];
    const unsubscribe = api.subscribe(instance.stream, 0, {
      onEvent: (event) => seen.push(event),
      onStatus: () => {},
      onGap: () => {},
    });
    await flush();
    await api.send(instance.id, 'hello', 'k1');
    unsubscribe();

    expect(seen.length).toBeGreaterThan(0);
    for (const event of seen) {
      if (!validate(event)) {
        throw new Error(`event failed schema: ${JSON.stringify(validate.errors)}`);
      }
    }
  });

  it('does not use position as event identity (invariant ii)', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create('tycho', null);

    const seen: EventEnvelope[] = [];
    api.subscribe(instance.stream, 0, { onEvent: (event) => seen.push(event), onStatus: () => {}, onGap: () => {} });
    await flush();
    await api.send(instance.id, 'one', 'k1');
    await api.send(instance.id, 'two', 'k2');

    // seen[0] is the instance_created replay event; sends follow it.
    const sent = seen.filter((e) => e.type === 'user_message');
    expect(sent[0].id).not.toBe('0');
    expect(sent[0].id).not.toBe(String(sent[0].seq));
  });

  it('advances seq monotonically within the stream (invariant iii)', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create(null, null);
    const seen: EventEnvelope[] = [];
    api.subscribe(instance.stream, 0, { onEvent: (e) => seen.push(e), onStatus: () => {}, onGap: () => {} });
    await flush();

    await api.send(instance.id, 'a', 'k1');
    await api.send(instance.id, 'b', 'k2');

    // Durable events only (I-4: a transient always carries seq 0, by design,
    // never stored or replayed) — `send()` now also broadcasts a synchronous
    // `turn_started` transient (mirroring the real engine's `begin_turn`),
    // and unfiltered `seen` would otherwise mix two seq-0 transients in among
    // the durable ordinals, which is not what invariant iii is a claim about.
    const seqs = seen.filter((e) => e.seq > 0).map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('lists created instances', async () => {
    const api = new MockSessionAPI();
    await api.create('tycho', null);
    await api.create(null, null);
    const instances = await api.list();
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.some((i) => i.operator === null)).toBe(true);
  });

  it('unsubscribe stops delivery', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create('tycho', null);
    const seen: EventEnvelope[] = [];
    const off = api.subscribe(instance.stream, 0, { onEvent: (e) => seen.push(e), onStatus: () => {}, onGap: () => {} });
    await flush();
    off();
    seen.length = 0;
    await api.send(instance.id, 'ignored', 'k1');
    expect(seen).toHaveLength(0);
  });

  it('attach returns instance, earliestSeq, and headSeq', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create('tycho', null);
    await api.send(instance.id, 'one', 'k1');
    const info = await api.attach(instance.id);
    expect(info.instance.id).toBe(instance.id);
    expect(info.earliestSeq).toBe(1);
    expect(info.headSeq).toBeGreaterThanOrEqual(2);
  });

  it('replays durable events past the cursor before going live', async () => {
    const api = new MockSessionAPI();
    const inst = await api.create('tycho', null);
    await api.send(inst.id, 'one', 'k1');
    await api.send(inst.id, 'two', 'k2');
    const seen: EventEnvelope[] = [];
    const statuses: SubscriptionStatus[] = [];
    api.subscribe(inst.stream, 2, { onEvent: (e) => seen.push(e), onStatus: (s) => statuses.push(s), onGap: () => {} });
    await flush();
    expect(seen.every((e) => e.seq === 0 || e.seq > 2)).toBe(true);
    expect(seen.some((e) => e.type === 'user_message' && (e.data as UserMessageData).text === 'two')).toBe(true);
    expect(statuses[0]).toBe('replaying');
    expect(statuses).toContain('live');
  });

  it('send returns the durable identity and echoes the clientKey', async () => {
    const api = new MockSessionAPI();
    const inst = await api.create(null, null);
    const receipt = await api.send(inst.id, 'hello', 'key-1');
    expect(receipt.seq).toBeGreaterThan(0);

    const seen: EventEnvelope[] = [];
    api.subscribe(inst.stream, 0, { onEvent: (e) => seen.push(e), onStatus: () => {}, onGap: () => {} });
    await flush();

    const echoed = seen.find((e) => e.id === receipt.id);
    expect(echoed).toBeDefined();
    expect((echoed!.data as UserMessageData).clientKey).toBe('key-1');
  });

  it('models thinking as an array of wire-shaped blocks hanging off the assistant message', () => {
    // The guarantee here is `tsc`, not the runtime expect below: jest-expo
    // transforms via Babel and strips types without checking them, so a
    // broken type fails `npx tsc --noEmit` and never reaches jest. The
    // assertion exists to give the compile-time check a home, not to verify
    // anything at runtime.
    //
    // Built as a full AssistantMessageData rather than a bare ThinkingBlock[]
    // deliberately: the earlier version typed the union in isolation, so
    // retyping `thinking` to string[] or dropping it entirely would have gone
    // uncaught — the exact regression this is meant to prevent.
    const message: AssistantMessageData = {
      text: 'Here.',
      generation: 'g1',
      thinking: [
        { type: 'thinking', thinking: 'let me look', signature: 'sig-1' },
        { type: 'redacted_thinking', data: 'opaque-bytes' },
      ],
    };
    expect(message.thinking).toHaveLength(2);
  });

  it('allows assistant messages with no thinking field — absence is the common case', () => {
    // This test verifies that `thinking` is genuinely optional on
    // AssistantMessageData. An engine persists thinking only when the round
    // also produced text or tool calls, so thinking-only cuts yield none. A
    // future regression making `thinking` required would break every ordinary
    // message. The compile-time guarantee is `tsc --noEmit`.
    const message: AssistantMessageData = {
      text: 'Done.',
      generation: 'g2',
    };
    expect(message.thinking).toBeUndefined();
  });
});
