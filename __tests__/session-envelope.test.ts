// The envelope declares $schema draft 2020-12; ajv's default export is
// draft-07 and refuses it outright.
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import schema from '../../../repos/armillary-core/schema/event.schema.json';
import { MockSessionAPI } from '../src/lib/session/mock';
import type { EventEnvelope } from '../src/lib/session/events';

describe('MockSessionAPI', () => {
  it('emits events that validate against the constitution envelope schema', async () => {
    // Validated against armillary-core's own schema rather than a hand-written
    // type, so the stub cannot drift from the envelope it claims to implement.
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const api = new MockSessionAPI();
    const instance = await api.create('tycho');

    const seen: EventEnvelope[] = [];
    const unsubscribe = api.subscribe(instance.id, 0, (event) => seen.push(event));
    await api.send(instance.id, 'hello');
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
    const instance = await api.create('tycho');

    const seen: EventEnvelope[] = [];
    api.subscribe(instance.id, 0, (event) => seen.push(event));
    await api.send(instance.id, 'one');
    await api.send(instance.id, 'two');

    expect(seen[0].id).toBe(`${instance.stream}:1`);
    expect(seen[1].id).toBe(`${instance.stream}:2`);
    expect(seen[0].id).not.toBe('0');
  });

  it('advances seq monotonically within the stream (invariant iii)', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create(null);
    const seen: EventEnvelope[] = [];
    api.subscribe(instance.id, 0, (e) => seen.push(e));

    await api.send(instance.id, 'a');
    await api.send(instance.id, 'b');

    expect(seen.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('lists fixture instances including a dispatcher-level one', async () => {
    const instances = await new MockSessionAPI().list();
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.some((i) => i.operator === null)).toBe(true);
  });

  it('unsubscribe stops delivery', async () => {
    const api = new MockSessionAPI();
    const instance = await api.create('tycho');
    const seen: EventEnvelope[] = [];
    const off = api.subscribe(instance.id, 0, (e) => seen.push(e));
    off();
    await api.send(instance.id, 'ignored');
    expect(seen).toHaveLength(0);
  });
});
