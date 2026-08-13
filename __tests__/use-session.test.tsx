import type { DeviceRefusal } from '../src/lib/auth/refusal';
import { SessionError } from '../src/lib/session/events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { SessionAPI } from '../src/lib/session/api';
import { ASSISTANT_DELTA } from '../src/lib/session/events';
import type {
  AttachInfo,
  EventEnvelope,
  Instance,
  SubscriptionHandler,
} from '../src/lib/session/events';
import type { SessionRow } from '../src/lib/session/project';
import { useSession } from '../src/lib/session/use-session';
import type { UseSessionResult } from '../src/lib/session/use-session';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A hand-rolled SessionAPI double with attach() controllable via a deferred and
 *  subscribe() calls captured so a test can drive the handler directly — the
 *  precision MockSessionAPI's real timing can't give us. */
function scriptedApi(stream: string) {
  const attachDeferred = deferred<AttachInfo>();
  const subscribeCalls: { stream: string; fromSeq: number; handler: SubscriptionHandler }[] = [];
  const unsubscribes: jest.Mock[] = [];
  const sendMock = jest.fn(() => Promise.resolve({ id: 'evt-send', seq: 0 }));

  const api: SessionAPI = {
    create: jest.fn(),
    list: jest.fn(),
    attach: jest.fn(() => attachDeferred.promise),
    subscribe: jest.fn((s: string, fromSeq: number, handler: SubscriptionHandler) => {
      subscribeCalls.push({ stream: s, fromSeq, handler });
      const unsub = jest.fn();
      unsubscribes.push(unsub);
      return unsub;
    }),
    send: sendMock,
    interrupt: jest.fn(() => Promise.resolve()),
    evict: jest.fn(() => Promise.resolve()),
    archive: jest.fn(() => Promise.resolve()),
    unarchive: jest.fn(() => Promise.resolve()),
  };

  function resolveAttach(overrides: Partial<AttachInfo> = {}) {
    attachDeferred.resolve({
      instance: {
        id: 'inst-1',
        operator: null,
        stream,
        startedAt: '2026-07-28T00:00:00.000Z',
        lastSeq: 0,
        model: null,
        mayWriteComposition: false,
        archived: false,
      },
      earliestSeq: 1,
      headSeq: 0,
      ...overrides,
    });
  }

  return { api, attachDeferred, subscribeCalls, unsubscribes, sendMock, resolveAttach };
}

/**
 * A `SessionAPI` double whose `attach()` resolves immediately (no `scriptedApi`
 * deferred to drive by hand) and can answer differently on its SECOND call —
 * the seam `turnInFlight`'s attach→subscribe gap test needs. A counter, not a
 * timer: deterministic regardless of how many microtask ticks the fake needs.
 *
 * Mounts, waits for the subscription AND the post-subscribe re-read (attach's
 * second call) to settle, then hands back `result.current` (always fresh) and
 * `emit` to drive the live handler — so a caller's own assertions are never
 * racing this mount's internal bookkeeping.
 */
async function mountSessionOnFakeApi(
  opts: {
    instance?: Partial<Instance>;
    /** Makes attach()'s SECOND call answer with this `turnInProgress`,
     *  standing in for a turn that began during the attach→subscribe window. */
    turnInProgressAfterFirstAttach?: boolean;
  } = {},
) {
  const stream = 's1';
  const baseInstance: Instance = {
    id: 'inst-1',
    operator: null,
    stream,
    startedAt: '2026-07-28T00:00:00.000Z',
    lastSeq: 0,
    model: null,
    mayWriteComposition: false,
    archived: false,
    turnInProgress: false,
    ...opts.instance,
  };

  const subscribeCalls: { stream: string; fromSeq: number; handler: SubscriptionHandler }[] = [];
  const attachMock = jest.fn(() => {
    const callNumber = attachMock.mock.calls.length; // 1-indexed: counted before this call returns
    const turnInProgress =
      callNumber >= 2 && opts.turnInProgressAfterFirstAttach !== undefined
        ? opts.turnInProgressAfterFirstAttach
        : baseInstance.turnInProgress;
    const attachInfo: AttachInfo = {
      instance: { ...baseInstance, turnInProgress },
      earliestSeq: 1,
      headSeq: 0,
    };
    return Promise.resolve(attachInfo);
  });

  const api: SessionAPI = {
    create: jest.fn(),
    list: jest.fn(),
    attach: attachMock,
    subscribe: jest.fn((s: string, fromSeq: number, handler: SubscriptionHandler) => {
      subscribeCalls.push({ stream: s, fromSeq, handler });
      return jest.fn();
    }),
    send: jest.fn(() => Promise.resolve({ id: 'evt-send', seq: 0 })),
    interrupt: jest.fn(() => Promise.resolve()),
    evict: jest.fn(() => Promise.resolve()),
    archive: jest.fn(() => Promise.resolve()),
    unarchive: jest.fn(() => Promise.resolve()),
  };

  let current!: UseSessionResult;
  await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);
  await waitFor(() => expect(subscribeCalls.length).toBe(1));
  // Let the post-subscribe re-read settle before handing control back — a
  // caller's own assertions must not race a fake network response that, in
  // production, always beats human-scale test code.
  await waitFor(() => expect(attachMock.mock.calls.length).toBeGreaterThanOrEqual(2));

  // Serialized behind a queue, not fired directly: the brief's own test
  // bodies call `emit` back-to-back without awaiting each one (e.g. a tool
  // round's `tool_use` immediately followed by `tool_result`), and firing
  // React's async `act()` twice without awaiting the first triggers "You seem
  // to have overlapping act() calls" — which doesn't just warn, it corrupts
  // `act()`'s bookkeeping badly enough to silently swallow state updates in
  // whatever test runs next in this file. Chaining onto one promise keeps
  // every dispatch inside its own, non-overlapping `act()`.
  let emitQueue = Promise.resolve();
  function emit(partial: { type: string; seq: number; data: unknown }): void {
    const handler = subscribeCalls[0].handler;
    emitQueue = emitQueue.then(() =>
      act(async () => {
        handler.onEvent(envelope(partial.type, partial.data, partial.seq, stream));
      }),
    );
  }

  return {
    result: {
      get current(): UseSessionResult {
        return current;
      },
    },
    emit,
  };
}

function envelope<T>(type: string, data: T, seq: number, stream = 's1'): EventEnvelope<T> {
  return {
    stream,
    id: `evt-${stream}-${seq}`,
    seq,
    ts: '2026-07-28T00:00:00.000Z',
    actor: { role: 'user' },
    type,
    version: 1,
    data,
  };
}

function rowLabel(r: SessionRow): string {
  switch (r.kind) {
    case 'message':
      return `msg:${r.role}:${r.text}`;
    case 'streaming':
      return `stream:${r.generation}:${r.text}`;
    case 'pending':
      return `pending:${r.clientKey}:${r.text}`;
    case 'system':
      return `sys:${r.label}`;
    case 'gap':
      return `gaprow:${r.label}`;
  }
}

function Harness({
  api,
  instanceId,
  enabled = true,
  capture,
  onDeviceRefusal,
}: {
  api: SessionAPI;
  instanceId: string;
  enabled?: boolean;
  capture: (r: UseSessionResult) => void;
  onDeviceRefusal?: (r: DeviceRefusal) => void;
}) {
  const result = useSession(api, instanceId, enabled, onDeviceRefusal);
  capture(result);
  return (
    <>
      <Text>{`status:${result.status}`}</Text>
      <Text>{result.gap ? `gap:${result.gap.requestedFrom}:${result.gap.earliestAvailable}` : 'no-gap'}</Text>
      {result.rows.map((r, i) => (
        <Text key={i}>{rowLabel(r)}</Text>
      ))}
    </>
  );
}

describe('useSession', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders cached rows once attach resolves and the cache hydrates, ahead of any live delivery', async () => {
    await AsyncStorage.setItem(
      'armillary.scrollback.s1',
      JSON.stringify([envelope('user_message', { text: 'cached hello', clientKey: 'ck0' }, 2)]),
    );

    const { api, resolveAttach } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    expect(screen.queryByText('cached hello')).toBeNull();

    await act(async () => {
      resolveAttach({ headSeq: 2 });
    });
    await waitFor(() => expect(screen.getByText(/msg:user:cached hello/)).toBeTruthy());
    expect(current.rows.some((r) => r.kind === 'message' && r.text === 'cached hello')).toBe(true);
  });

  it('exposes the attached instance once attach() resolves, and null beforehand', async () => {
    const { api, resolveAttach } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    expect(current.instance).toBeNull();

    await act(async () => {
      resolveAttach();
    });
    await waitFor(() => expect(current.instance).not.toBeNull());
    expect(current.instance?.id).toBe('inst-1');
    expect(current.instance?.operator).toBeNull();
  });

  it('subscribes from the cached cursor, not 0', async () => {
    await AsyncStorage.setItem(
      'armillary.scrollback.s1',
      JSON.stringify([
        envelope('user_message', { text: 'one' }, 3),
        envelope('user_message', { text: 'two' }, 5),
      ]),
    );

    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    await render(<Harness api={api} instanceId="inst-1" capture={() => {}} />);

    await act(async () => {
      resolveAttach({ headSeq: 5 });
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));
    expect(subscribeCalls[0].fromSeq).toBe(5);
  });

  it('discards a scrollback cache whose cursor exceeds the attached head (mock id reuse, wiped data dir, log reset)', async () => {
    await AsyncStorage.setItem(
      'armillary.scrollback.s1',
      JSON.stringify([
        envelope('user_message', { text: 'stale one' }, 40),
        envelope('user_message', { text: 'stale two' }, 41),
      ]),
    );

    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    // headSeq (5) is below the cached cursor (41) — the log has moved
    // backwards relative to what the cache remembers.
    await act(async () => {
      resolveAttach({ headSeq: 5 });
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));

    expect(current.rows.some((r) => r.kind === 'message')).toBe(false);
    expect(subscribeCalls[0].fromSeq).toBe(0);
    expect(await AsyncStorage.getItem('armillary.scrollback.s1')).toBeNull();
  });

  it('send inserts a pending row immediately and reconciles once the echo lands durably', async () => {
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);
    await act(async () => {
      resolveAttach();
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));

    await act(async () => {
      await current.send('hello there');
    });

    expect(current.rows.some((r) => r.kind === 'pending' && r.text === 'hello there')).toBe(true);
    const pendingRow = current.rows.find((r) => r.kind === 'pending' && r.text === 'hello there');
    expect(pendingRow).toBeDefined();
    const clientKey = (pendingRow as Extract<SessionRow, { kind: 'pending' }>).clientKey;

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onEvent(envelope('user_message', { text: 'hello there', clientKey }, 1));
    });

    expect(current.rows.some((r) => r.kind === 'pending')).toBe(false);
    expect(current.rows.some((r) => r.kind === 'message' && r.text === 'hello there')).toBe(true);
  });

  it('on a closed status, reconnects after 1s from the cursor advanced by events received before the drop', async () => {
    jest.useFakeTimers();
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    await render(<Harness api={api} instanceId="inst-1" capture={() => {}} />);

    await act(async () => {
      resolveAttach();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(subscribeCalls.length).toBe(1);

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onEvent(envelope('user_message', { text: 'one' }, 1));
      handler.onEvent(envelope('user_message', { text: 'two' }, 2));
    });

    await act(async () => {
      handler.onStatus('closed');
    });
    await waitFor(() => expect(screen.getByText('status:reconnecting')).toBeTruthy());

    expect(subscribeCalls.length).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(subscribeCalls.length).toBe(2);
    expect(subscribeCalls[1].fromSeq).toBe(2);
  });

  it('ignores a transient it does not understand rather than keying a phantom on undefined', async () => {
    // `seq === 0` meant "assistant_delta" and nothing else, so ANY other
    // transient was blind-cast: `data.generation` came back `undefined`, keyed
    // a streaming row under that key, and no `assistant_message` could ever
    // clear it. A permanent frozen bubble, from one event the client was never
    // taught. The invariant is D12′'s: a transient's scope equals the durable
    // event it previews — one it cannot name previews nothing.
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    await act(async () => {
      resolveAttach();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onEvent(envelope('some_future_transient', { whatever: true }, 0));
    });

    expect(current.rows.some((r) => r.kind === 'streaming')).toBe(false);
  });

  it('holds turnInFlight across a tool round, when no deltas are arriving', async () => {
    const { result, emit } = await mountSessionOnFakeApi();

    emit({ type: 'turn_started', seq: 0, data: { generation: 'g1' } });
    await waitFor(() => expect(result.current.turnInFlight).toBe(true));

    // A tool round: durable events land, no assistant_delta anywhere. This is
    // exactly the window where the old `streaming` flag went false and the
    // Stop button vanished.
    emit({ type: 'tool_use', seq: 5, data: { id: 't1', name: 'read_file', input: { path: 'a.md' } } });
    emit({ type: 'tool_result', seq: 6, data: { toolUseId: 't1', status: 'ok', content: 'x', isError: false } });

    expect(result.current.turnInFlight).toBe(true);

    emit({ type: 'turn_ended', seq: 0, data: { generation: 'g1' } });
    await waitFor(() => expect(result.current.turnInFlight).toBe(false));
  });

  it('reports turnInFlight from attach, for a session opened mid-turn', async () => {
    // The case a client-side inference cannot reconstruct: this app was not
    // connected when the turn started, so no turn_started transient will ever
    // arrive for it.
    const { result } = await mountSessionOnFakeApi({ instance: { turnInProgress: true } });
    await waitFor(() => expect(result.current.turnInFlight).toBe(true));
  });

  it('drops an unrecognized transient without touching turnInFlight', async () => {
    const { result, emit } = await mountSessionOnFakeApi();
    emit({ type: 'some_future_transient', seq: 0, data: {} });
    expect(result.current.turnInFlight).toBe(false);
  });

  it('catches a turn that started during the attach→subscribe window', async () => {
    // The engine review's Important 1, as a test. The first attach answers
    // false; the turn begins before the subscription exists, so its
    // `turn_started` is broadcast into a void and this client will NEVER
    // receive it. Only the post-subscribe re-read can see it.
    //
    // Without the second read this test fails and the app ships the exact
    // defect the engine work exists to remove — an idle-looking UI, and no
    // Stop button, for a whole real turn.
    const { result } = await mountSessionOnFakeApi({
      instance: { turnInProgress: false },
      // The fake API flips its answer after the first attach resolves,
      // standing in for a turn that began in the gap.
      turnInProgressAfterFirstAttach: true,
    });

    await waitFor(() => expect(result.current.turnInFlight).toBe(true));
  });

  it('discards a stale post-subscribe re-read that resolves after a turn_started arrived while it was in flight', async () => {
    // Narrower sibling of the attach→subscribe gap test above: this time the
    // subscription is already live, so the transient DOES arrive — but the
    // re-read that was already in flight when it arrived is a separate
    // channel (HTTP) with no ordering guarantee against the stream, and it
    // still resolves with the answer it computed before the turn started. A
    // client that trusts every resolved read equally clobbers the transient's
    // `true` back to this stale `false` the moment it lands.
    const stream = 's1';
    const baseInstance: Instance = {
      id: 'inst-1',
      operator: null,
      stream,
      startedAt: '2026-07-28T00:00:00.000Z',
      lastSeq: 0,
      model: null,
      mayWriteComposition: false,
      archived: false,
      turnInProgress: false,
    };

    // The second attach() (the post-subscribe re-read) is resolved by hand,
    // from this test, not by a timer — the brief's own requirement for
    // proving this ordering without relying on real elapsed time.
    const secondAttach = deferred<AttachInfo>();
    let attachCalls = 0;
    const subscribeCalls: { stream: string; fromSeq: number; handler: SubscriptionHandler }[] = [];

    const api: SessionAPI = {
      create: jest.fn(),
      list: jest.fn(),
      attach: jest.fn(() => {
        attachCalls++;
        if (attachCalls === 1) {
          return Promise.resolve<AttachInfo>({ instance: { ...baseInstance }, earliestSeq: 1, headSeq: 0 });
        }
        return secondAttach.promise;
      }),
      subscribe: jest.fn((s: string, fromSeq: number, handler: SubscriptionHandler) => {
        subscribeCalls.push({ stream: s, fromSeq, handler });
        return jest.fn();
      }),
      send: jest.fn(() => Promise.resolve({ id: 'evt-send', seq: 0 })),
      interrupt: jest.fn(() => Promise.resolve()),
      evict: jest.fn(() => Promise.resolve()),
      archive: jest.fn(() => Promise.resolve()),
      unarchive: jest.fn(() => Promise.resolve()),
    };

    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);
    await waitFor(() => expect(subscribeCalls.length).toBe(1));
    // The re-read has been issued (attach's second call) but is deliberately
    // left unresolved — this is the "in flight" window the test is probing.
    await waitFor(() => expect(attachCalls).toBe(2));

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onEvent(envelope('turn_started', { generation: 'g1' }, 0, stream));
    });
    expect(current.turnInFlight).toBe(true);

    // The stale read resolves now, after the transient — still reporting the
    // `false` it computed before the turn started.
    await act(async () => {
      secondAttach.resolve({ instance: { ...baseInstance, turnInProgress: false }, earliestSeq: 1, headSeq: 0 });
    });

    expect(current.turnInFlight).toBe(true);
  });

  it('clears a frozen mid-generation transient on a closed status, and renders the durable finalizer exactly once on reconnect', async () => {
    jest.useFakeTimers();
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    await act(async () => {
      resolveAttach();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(subscribeCalls.length).toBe(1);

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onEvent(envelope(ASSISTANT_DELTA, { textSoFar: 'the log', generation: 'gen-1' }, 0));
    });
    expect(current.rows.some((r) => r.kind === 'streaming')).toBe(true);

    // Connection drops mid-generation: the transient must not survive as a
    // permanently-frozen streaming row.
    await act(async () => {
      handler.onStatus('closed');
    });
    expect(current.rows.some((r) => r.kind === 'streaming')).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(subscribeCalls.length).toBe(2);

    // The generation had in fact completed before the drop — its durable
    // finalizer arrives via replay on reconnect, and renders exactly once.
    const reconnectHandler = subscribeCalls[1].handler;
    await act(async () => {
      reconnectHandler.onEvent(
        envelope('assistant_message', { text: 'the log remembers', generation: 'gen-1' }, 1),
      );
    });

    const finals = current.rows.filter((r) => r.kind === 'message' && r.text === 'the log remembers');
    expect(finals).toHaveLength(1);
    expect(current.rows.some((r) => r.kind === 'streaming')).toBe(false);
  });

  it('persists a bounded window of at most 200 durable events', async () => {
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    await render(<Harness api={api} instanceId="inst-1" capture={() => {}} />);
    await act(async () => {
      resolveAttach();
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      for (let seq = 1; seq <= 250; seq++) {
        handler.onEvent(envelope('user_message', { text: `msg-${seq}` }, seq));
      }
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem('armillary.scrollback.s1');
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw as string) as EventEnvelope[];
      expect(stored.length).toBe(200);
      expect(stored[0].seq).toBe(51);
      expect(stored[stored.length - 1].seq).toBe(250);
    });
  });

  it('surfaces a gap reported by the handler', async () => {
    const { api, resolveAttach, subscribeCalls } = scriptedApi('s1');
    await render(<Harness api={api} instanceId="inst-1" capture={() => {}} />);
    await act(async () => {
      resolveAttach();
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));

    const handler = subscribeCalls[0].handler;
    await act(async () => {
      handler.onGap({ requestedFrom: 0, earliestAvailable: 5 });
    });

    expect(screen.getByText('gap:0:5')).toBeTruthy();
  });

  it('removes the pending row and surfaces sendError when send() rejects', async () => {
    const { api, resolveAttach, subscribeCalls, sendMock } = scriptedApi('s1');
    sendMock.mockImplementationOnce(() => Promise.reject(new Error('refused: instance busy')));
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);
    await act(async () => {
      resolveAttach();
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));

    await act(async () => {
      await current.send('doomed');
    });

    expect(current.rows.some((r) => r.kind === 'pending')).toBe(false);
    expect(current.sendError).toMatch(/refused: instance busy/);
  });

  it('does not attach or subscribe while disabled', async () => {
    const { api } = scriptedApi('s1');
    await render(<Harness api={api} instanceId="inst-1" enabled={false} capture={() => {}} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(api.attach).not.toHaveBeenCalled();
    expect(api.subscribe).not.toHaveBeenCalled();
  });

  it('flips disabled to enabled and attaches against whichever api is current at that point — never a stale one seen while disabled', async () => {
    // Models the cold-launch case: `api` is the fallback host's client while
    // the stored host is still hydrating (`enabled=false`); once the real
    // host resolves, both `api` and `enabled` flip together in the same
    // render. This must never fire attach() against the fallback client.
    const wrongHost = scriptedApi('wrong-stream');
    const rightHost = scriptedApi('right-stream');

    const { rerender } = await render(
      <Harness api={wrongHost.api} instanceId="inst-1" enabled={false} capture={() => {}} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(wrongHost.api.attach).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<Harness api={rightHost.api} instanceId="inst-1" enabled={true} capture={() => {}} />);
      await Promise.resolve();
    });

    expect(rightHost.api.attach).toHaveBeenCalledTimes(1);
    expect(wrongHost.api.attach).not.toHaveBeenCalled();
  });

  it('surfaces an attach() rejection rather than leaving the screen stuck loading (and does not throw unhandled)', async () => {
    const { api, attachDeferred } = scriptedApi('s1');
    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);

    expect(current.status).toBe('replaying');

    await act(async () => {
      attachDeferred.reject(new Error('unknown_instance'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 'closed' rather than stuck on 'replaying' forever — the screen renders
    // anything other than 'live'/'replaying' as a status line, so this at
    // least stops reading as an infinite spinner.
    expect(current.status).toBe('closed');
    // Reusing sendError (rather than a dedicated field) — see use-session.ts's
    // comment on why.
    expect(current.sendError).toMatch(/unknown_instance/);
  });
});

describe('useSession — a gated mutation that is refused', () => {
  /** The engine's refusal body format: `{code}: {sentence}`. */
  function refusal(code: string) {
    return new SessionError(code === 'principal_not_granted' ? 403 : 401, `${code}: refused by the host`);
  }

  /**
   * All THREE mutations, not just `send`.
   *
   * `send` was given refusal handling and its two siblings four lines below it
   * were missed — both were called as `void interrupt()` from the screen, so a
   * rejection was swallowed as an unhandled promise rejection: the control did
   * nothing, said nothing, and left the app still believing it was enrolled.
   * Enumerated rather than sampled, because sampling is exactly how the gap
   * happened.
   */
  const mutations = [
    { name: 'send', run: (r: UseSessionResult) => r.send('hello') },
    { name: 'interrupt', run: (r: UseSessionResult) => r.interrupt() },
    { name: 'evict', run: (r: UseSessionResult) => r.evict('evt-1') },
  ] as const;

  it.each(mutations)('$name reports a device refusal in the phone’s own words', async ({ name, run }) => {
    const { api, resolveAttach } = scriptedApi('s1');
    (api[name] as jest.Mock).mockRejectedValue(refusal('no_principal'));

    let current!: UseSessionResult;
    const noteRefusal = jest.fn();
    await render(
      <Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} onDeviceRefusal={noteRefusal} />,
    );
    await act(async () => resolveAttach());
    await act(async () => {
      await run(current);
    });

    expect(noteRefusal).toHaveBeenCalledWith('no_principal');
    // The engine's own sentence names a command for the host's terminal; what
    // reaches the screen must name what can be done from here.
    expect(current.sendError).toMatch(/Settings/);
    expect(current.sendError).not.toMatch(/armillary-engine/);
  });

  it.each(mutations)('$name keeps a non-refusal failure verbatim', async ({ name, run }) => {
    // `turn_in_progress` and `unknown_instance` are readable as they stand —
    // translating everything would lose the engine's own precise vocabulary.
    const { api, resolveAttach } = scriptedApi('s1');
    (api[name] as jest.Mock).mockRejectedValue(new SessionError(409, 'turn_in_progress: a turn is already running'));

    let current!: UseSessionResult;
    const noteRefusal = jest.fn();
    await render(
      <Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} onDeviceRefusal={noteRefusal} />,
    );
    await act(async () => resolveAttach());
    await act(async () => {
      await run(current);
    });

    expect(noteRefusal).not.toHaveBeenCalled();
    expect(current.sendError).toMatch(/turn_in_progress/);
  });

  it('does not let a rejected interrupt escape as an unhandled rejection', async () => {
    // The screen calls `void interrupt()`. Before this, the rejection had
    // nowhere to go — which is why the failure was invisible rather than loud.
    const { api, resolveAttach } = scriptedApi('s1');
    (api.interrupt as jest.Mock).mockRejectedValue(new SessionError(401, 'no_principal: nope'));

    let current!: UseSessionResult;
    await render(<Harness api={api} instanceId="inst-1" capture={(r) => (current = r)} />);
    await act(async () => resolveAttach());
    await act(async () => {
      await expect(current.interrupt()).resolves.toBeUndefined();
    });
  });
});
