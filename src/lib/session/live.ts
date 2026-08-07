import type { SessionAPI } from './api';
import type {
  AttachInfo,
  EventEnvelope,
  GapInfo,
  Instance,
  SendReceipt,
  SubscriptionHandler,
  Unsubscribe,
} from './events';
import { SessionError } from './events';
import { createSSEParser } from './sse';

/**
 * `LiveSessionAPI` — the seam's second implementation, over HTTP + SSE
 * against the real engine (the mock in `mock.ts` is the first).
 *
 * `fetch` is injected rather than imported, exactly like `DaemonClient`
 * (`src/lib/daemon/client.ts`): tests exercise this client against a scripted
 * fetcher, never the network.
 *
 * Streaming note (SDK 57 / `expo/fetch`): the plain global `fetch` in
 * React Native does not support reading `response.body` as a `ReadableStream`
 * — `subscribe()` needs that to read SSE frames incrementally. Rather than
 * import `expo/fetch` here, this class stays transport-dumb: the default
 * parameter is the global `fetch` (fine for Node/tests, where it already
 * streams), and the app's composition root (Task 15's factory) is the place
 * that injects `import { fetch as expoFetch } from 'expo/fetch'` for the
 * on-device instance. That keeps this file's only dependency on "fetch" the
 * shape of the Fetch API, not which implementation provides it.
 */
export class LiveSessionAPI implements SessionAPI {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      // Preserve the engine's machine-code body verbatim — `turn_in_progress`,
      // `unknown_instance` — so the UI can name the refusal instead of just
      // failing generically.
      throw new SessionError(response.status, await response.text());
    }
    // 204 No Content responses have no body to parse.
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  create(operator: string | null, model: string | null = null): Promise<Instance> {
    return this.request<Instance>('/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator, model }),
    });
  }

  list(): Promise<Instance[]> {
    return this.request<Instance[]>('/instances');
  }

  attach(instanceId: string): Promise<AttachInfo> {
    return this.request<AttachInfo>(`/instances/${encodeURIComponent(instanceId)}`);
  }

  send(instanceId: string, text: string, clientKey: string): Promise<SendReceipt> {
    return this.request<SendReceipt>(`/instances/${encodeURIComponent(instanceId)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, clientKey }),
    });
  }

  async interrupt(instanceId: string): Promise<void> {
    await this.request<void>(`/instances/${encodeURIComponent(instanceId)}/interrupt`, {
      method: 'POST',
    });
  }

  async evict(instanceId: string, eventId: string): Promise<void> {
    await this.request<void>(`/instances/${encodeURIComponent(instanceId)}/evict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
  }

  /**
   * Single-connection semantics: this method does not retry. A dropped
   * connection (server close, network error, or the returned unsubscribe
   * being called) always resolves to exactly one `onStatus('closed')`;
   * reconnecting from the last-seen seq is `useSession`'s job, not this
   * class's.
   */
  subscribe(stream: string, fromSeq: number, handler: SubscriptionHandler): Unsubscribe {
    const controller = new AbortController();
    let closed = false;
    let warnedMalformed = false;

    const emitClosedOnce = (): void => {
      if (closed) return;
      closed = true;
      handler.onStatus('closed');
    };

    const warnMalformedOnce = (frameEvent: string): void => {
      if (warnedMalformed) return;
      warnedMalformed = true;
      // eslint-disable-next-line no-console
      console.warn(`LiveSessionAPI: malformed JSON in a '${frameEvent}' SSE frame, skipping`);
    };

    void (async () => {
      const parser = createSSEParser();
      // Declared outside the try so the `finally` below can always release it
      // (cancel implicitly releases the lock too), rather than leaving lock
      // release to GC on whichever exit path happened to run.
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await this.fetcher(
          `${this.baseUrl}/streams/${encodeURIComponent(stream)}/events?from=${fromSeq}`,
          { signal: controller.signal },
        );

        if (!response.ok || !response.body) {
          // A non-OK response (e.g. an unknown stream) or a fetch
          // implementation that didn't hand back a streamable body ends the
          // subscription immediately, with no retry of its own — reconnect
          // is `useSession`'s job. Warn so this doesn't fail silently.
          // eslint-disable-next-line no-console
          console.warn(
            `LiveSessionAPI: subscribe to '${stream}' got status ${response.status}; closing without retry`,
          );
          emitClosedOnce();
          return;
        }

        handler.onStatus('replaying');

        reader = response.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const frame of parser.feed(chunk)) {
            if (frame.event === 'envelope') {
              try {
                handler.onEvent(JSON.parse(frame.data) as EventEnvelope);
              } catch {
                warnMalformedOnce(frame.event);
              }
            } else if (frame.event === 'gap') {
              try {
                handler.onGap(JSON.parse(frame.data) as GapInfo);
              } catch {
                warnMalformedOnce(frame.event);
              }
            } else if (frame.event === 'caught-up') {
              handler.onStatus('live');
            }
            // Unknown frame names (and keep-alive comments, already filtered
            // by the parser) are ignored rather than treated as errors.
          }
        }

        emitClosedOnce();
      } catch {
        // Read error or abort (including unsubscribe-triggered abort, mid-
        // stream or otherwise) — both land on 'closed'. The hook ignores
        // status after it has unsubscribed.
        emitClosedOnce();
      } finally {
        // Errored-by-abort or already-closed, cancel() is safe either way —
        // a rejection here (e.g. cancelling an already-errored reader) is
        // expected, not exceptional, so it's swallowed rather than rethrown.
        reader?.cancel().catch(() => {});
      }
    })();

    return () => {
      controller.abort();
    };
  }
}
