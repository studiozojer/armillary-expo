import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { SessionAPI } from '../src/lib/session/api';
import type {
  AttachInfo,
  EventEnvelope,
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
  };

  function resolveAttach(overrides: Partial<AttachInfo> = {}) {
    attachDeferred.resolve({
      instance: { id: 'inst-1', operator: null, stream, startedAt: '2026-07-28T00:00:00.000Z', lastSeq: 0 },
      earliestSeq: 1,
      headSeq: 0,
      ...overrides,
    });
  }

  return { api, attachDeferred, subscribeCalls, unsubscribes, sendMock, resolveAttach };
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
}: {
  api: SessionAPI;
  instanceId: string;
  enabled?: boolean;
  capture: (r: UseSessionResult) => void;
}) {
  const result = useSession(api, instanceId, enabled);
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
      resolveAttach();
    });
    await waitFor(() => expect(screen.getByText(/msg:user:cached hello/)).toBeTruthy());
    expect(current.rows.some((r) => r.kind === 'message' && r.text === 'cached hello')).toBe(true);
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
      resolveAttach();
    });
    await waitFor(() => expect(subscribeCalls.length).toBe(1));
    expect(subscribeCalls[0].fromSeq).toBe(5);
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
