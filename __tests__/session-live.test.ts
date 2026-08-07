import { LiveSessionAPI } from '../src/lib/session/live';
import { SessionError } from '../src/lib/session/events';
import type { EventEnvelope, SubscriptionHandler } from '../src/lib/session/events';

const BASE = 'http://host:9999';

/** A minimal Response-shaped object for the non-streaming methods. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

/** Real Response over a real ReadableStream — both are natively available in
 *  this jest environment (Node 22 / @react-native/jest-preset's env), so the
 *  SSE tests exercise the actual `getReader()` + `TextDecoder` path rather
 *  than a hand-rolled shape. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function client(fetcher: jest.Mock) {
  return new LiveSessionAPI(BASE, fetcher as unknown as typeof fetch);
}

function collectingHandler(): SubscriptionHandler & {
  events: EventEnvelope[];
  statuses: string[];
  gaps: unknown[];
} {
  const events: EventEnvelope[] = [];
  const statuses: string[] = [];
  const gaps: unknown[] = [];
  return {
    events,
    statuses,
    gaps,
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    onGap: (g) => gaps.push(g),
  };
}

/** Waits a tick so the subscribe() microtask/async loop can run before assertions. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LiveSessionAPI', () => {
  describe('non-streaming methods', () => {
    it('create() POSTs {operator, model} and returns the Instance', async () => {
      const instance = {
        id: 'inst-1',
        operator: 'tycho',
        stream: 'inst-1',
        startedAt: '2026-07-28T00:00:00Z',
        lastSeq: 1,
        model: null,
      };
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(201, instance));

      // Called with just an operator, as every pre-Task-6 call site does —
      // `model` defaults to null (see api.ts's optional-param comment).
      const result = await client(fetcher).create('tycho');

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'tycho', model: null }),
      });
      expect(result).toEqual(instance);
    });

    it('sends the chosen model in the create body', async () => {
      const instance = {
        id: 'i1',
        operator: 'tycho',
        stream: 'i1',
        startedAt: '2026-08-07T00:00:00.000Z',
        lastSeq: 1,
        model: 'zen/deepseek-v4-flash',
      };
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(201, instance));

      const result = await client(fetcher).create('tycho', 'zen/deepseek-v4-flash');

      const [, init] = fetcher.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ operator: 'tycho', model: 'zen/deepseek-v4-flash' });
      expect(result.model).toBe('zen/deepseek-v4-flash');
    });

    it('sends a null model when none was chosen, so the engine default pilots', async () => {
      const instance = {
        id: 'i1',
        operator: null,
        stream: 'i1',
        startedAt: '2026-08-07T00:00:00.000Z',
        lastSeq: 1,
        model: null,
      };
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(201, instance));

      await client(fetcher).create(null, null);

      const [, init] = fetcher.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ operator: null, model: null });
    });

    it('list() GETs /instances and returns the array', async () => {
      const instances = [
        { id: 'inst-1', operator: null, stream: 'inst-1', startedAt: 't', lastSeq: 0 },
      ];
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, instances));

      const result = await client(fetcher).list();

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances`, undefined);
      expect(result).toEqual(instances);
    });

    it('attach() GETs /instances/{id} with the id encoded and returns AttachInfo', async () => {
      const attachInfo = {
        instance: { id: 'a b', operator: null, stream: 'a b', startedAt: 't', lastSeq: 3 },
        earliestSeq: 1,
        headSeq: 3,
      };
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, attachInfo));

      const result = await client(fetcher).attach('a b');

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances/a%20b`, undefined);
      expect(result).toEqual(attachInfo);
    });

    it('send() POSTs {text, clientKey} and returns the SendReceipt', async () => {
      const receipt = { id: 'evt-1', seq: 5 };
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(201, receipt));

      const result = await client(fetcher).send('inst-1', 'hello', 'ck-1');

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances/inst-1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', clientKey: 'ck-1' }),
      });
      expect(result).toEqual(receipt);
    });

    it('interrupt() POSTs /instances/{id}/interrupt and resolves on 204', async () => {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(204, ''));

      await expect(client(fetcher).interrupt('inst-1')).resolves.toBeUndefined();

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances/inst-1/interrupt`, { method: 'POST' });
    });

    it('evict() POSTs {eventId} and resolves on 204', async () => {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(204, ''));

      await expect(client(fetcher).evict('inst-1', 'evt-1')).resolves.toBeUndefined();

      expect(fetcher).toHaveBeenCalledWith(`${BASE}/instances/inst-1/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: 'evt-1' }),
      });
    });

    it('throws SessionError preserving the machine-code body, so turn_in_progress reaches the UI nameable', async () => {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(409, 'turn_in_progress'));

      const promise = client(fetcher).send('inst-1', 'hi', 'ck-1');

      await expect(promise).rejects.toBeInstanceOf(SessionError);
      await expect(client(fetcher).send('inst-1', 'hi', 'ck-1')).rejects.toMatchObject({
        status: 409,
        message: 'turn_in_progress',
      });
    });

    it('throws SessionError for a 404 unknown_instance', async () => {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(404, 'unknown_instance'));

      await expect(client(fetcher).attach('nope')).rejects.toMatchObject({
        status: 404,
        message: 'unknown_instance',
      });
    });
  });

  describe('subscribe()', () => {
    it('GETs the stream URL with the from cursor', async () => {
      const fetcher = jest.fn().mockResolvedValue(sseResponse(['event: caught-up\ndata: {"headSeq":0}\n\n']));
      const handler = collectingHandler();

      client(fetcher).subscribe('inst-1', 7, handler);
      await flush();

      expect(fetcher).toHaveBeenCalledWith(
        `${BASE}/streams/inst-1/events?from=7`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('emits replaying on connect, then delivers envelope frames, then gap, then live on caught-up', async () => {
      const envelope: EventEnvelope = {
        stream: 'inst-1',
        id: 'inst-1:1:abc',
        seq: 1,
        ts: '2026-07-28T00:00:00Z',
        actor: { role: 'user' },
        type: 'user_message',
        version: 1,
        data: { text: 'hi' },
      };
      const chunks = [
        `event: envelope\ndata: ${JSON.stringify(envelope)}\n\n`,
        'event: gap\ndata: {"requestedFrom":0,"earliestAvailable":1}\n\n',
        'event: caught-up\ndata: {"headSeq":1}\n\n',
      ];
      const fetcher = jest.fn().mockResolvedValue(sseResponse(chunks));
      const handler = collectingHandler();

      client(fetcher).subscribe('inst-1', 0, handler);
      await flush();

      expect(handler.statuses[0]).toBe('replaying');
      expect(handler.events).toEqual([envelope]);
      expect(handler.gaps).toEqual([{ requestedFrom: 0, earliestAvailable: 1 }]);
      expect(handler.statuses).toContain('live');
      // live must come after replaying
      expect(handler.statuses.indexOf('live')).toBeGreaterThan(handler.statuses.indexOf('replaying'));
    });

    it('delivers both transient (seq 0) and durable envelopes to onEvent', async () => {
      const transient: EventEnvelope = {
        stream: 'inst-1',
        id: 'inst-1:0:xyz',
        seq: 0,
        ts: '2026-07-28T00:00:00Z',
        actor: { role: 'operator' },
        type: 'assistant_delta',
        version: 1,
        data: { textSoFar: 'h', generation: 'gen-1' },
      };
      const durableEvt: EventEnvelope = {
        stream: 'inst-1',
        id: 'inst-1:2:def',
        seq: 2,
        ts: '2026-07-28T00:00:01Z',
        actor: { role: 'operator' },
        type: 'assistant_message',
        version: 1,
        data: { text: 'hi', generation: 'gen-1' },
      };
      const chunks = [
        `event: envelope\ndata: ${JSON.stringify(transient)}\n\n`,
        `event: envelope\ndata: ${JSON.stringify(durableEvt)}\n\n`,
      ];
      const fetcher = jest.fn().mockResolvedValue(sseResponse(chunks));
      const handler = collectingHandler();

      client(fetcher).subscribe('inst-1', 0, handler);
      await flush();

      expect(handler.events).toEqual([transient, durableEvt]);
    });

    it('fires closed exactly once when the stream ends', async () => {
      const fetcher = jest.fn().mockResolvedValue(sseResponse(['event: caught-up\ndata: {"headSeq":0}\n\n']));
      const handler = collectingHandler();

      client(fetcher).subscribe('inst-1', 0, handler);
      await flush();
      await flush();

      const closedCount = handler.statuses.filter((s) => s === 'closed').length;
      expect(closedCount).toBe(1);
    });

    it('unsubscribe aborts the fetch signal', async () => {
      let capturedSignal: AbortSignal | undefined;
      const fetcher = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return sseResponse(['event: caught-up\ndata: {"headSeq":0}\n\n']);
      });
      const handler = collectingHandler();

      const unsubscribe = client(fetcher).subscribe('inst-1', 0, handler);
      await flush();
      unsubscribe();

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('mid-stream unsubscribe terminates a blocked read and fires closed exactly once', async () => {
      // A stream that never closes: after the first chunk, `reader.read()`
      // would block forever on its own. The double wires the injected signal
      // itself (real fetch does this internally; a scripted fetcher has to
      // do it by hand) — aborting rejects the pending read with an
      // AbortError, which is the only thing that can end this loop.
      const handler = collectingHandler();
      const fetcher = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: envelope\ndata: {"stream":"inst-1","id":"inst-1:1:a","seq":1,"ts":"t",' +
                  '"actor":{"role":"user"},"type":"user_message","version":1,"data":{}}\n\n',
              ),
            );
            // Deliberately no controller.close() — proving abort (not
            // end-of-stream) is what terminates the read loop below.
            signal?.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
            });
          },
        });
        return new Response(stream, { status: 200 });
      });

      const rejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandledRejection);

      try {
        const unsubscribe = client(fetcher).subscribe('inst-1', 0, handler);
        await flush();
        expect(handler.events).toHaveLength(1); // the first frame arrived before we abort

        unsubscribe();
        await flush();
        await flush();

        expect(handler.statuses.filter((s) => s === 'closed')).toHaveLength(1);
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(rejections).toEqual([]);
    });

    it('warns naming the status and closes once when the subscribe response is not ok', async () => {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(404, 'unknown_stream'));
      const handler = collectingHandler();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      client(fetcher).subscribe('nope', 0, handler);
      await flush();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toEqual(expect.stringContaining('404'));
      expect(handler.statuses).toEqual(['closed']);

      warnSpy.mockRestore();
    });

    it('skips a malformed envelope frame without killing the subscription; the next valid frame still arrives', async () => {
      const good: EventEnvelope = {
        stream: 'inst-1',
        id: 'inst-1:1:abc',
        seq: 1,
        ts: '2026-07-28T00:00:00Z',
        actor: { role: 'user' },
        type: 'user_message',
        version: 1,
        data: { text: 'hi' },
      };
      const chunks = [
        'event: envelope\ndata: {not valid json\n\n',
        `event: envelope\ndata: ${JSON.stringify(good)}\n\n`,
      ];
      const fetcher = jest.fn().mockResolvedValue(sseResponse(chunks));
      const handler = collectingHandler();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      client(fetcher).subscribe('inst-1', 0, handler);
      await flush();

      expect(handler.events).toEqual([good]);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });
  });
});
