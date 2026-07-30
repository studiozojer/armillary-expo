// Mirrors repos/armillary-core/schema/event.schema.json (envelope v0.1).
// The mock is validated against that schema in __tests__/session-envelope.test.ts,
// so this file cannot quietly drift from the constitution's shape.

export type ActorRole = 'user' | 'operator' | 'system' | 'tool' | 'machine';

export type Actor = {
  role: ActorRole;
  instance?: string;
};

export type EventEnvelope<T = unknown> = {
  /** Explicit on every event even when storage implies it (invariant i). */
  stream: string;
  /** Event identity — MUST NOT be position-in-file (invariant ii). */
  id: string;
  /** Monotonic within its stream (invariant iii). 0 = transient, never persisted. */
  seq: number;
  /** RFC 3339. */
  ts: string;
  actor: Actor;
  /** Sovereign types (e.g. machine_verdict) confer authority a model cannot overwrite. */
  type: string;
  /** First-class, optional, MAY span streams (invariant iv). Threads are concurrent. */
  thread?: string;
  /** Reserved fork seam. Not a feature in v0.1. */
  parent?: string;
  version: number;
  cost?: { bytes?: number; tokens?: number };
  data: T;
};

export type Instance = {
  id: string;
  /** null for a dispatcher-level instance — no operator summoned. */
  operator: string | null;
  stream: string;
  startedAt: string;
  lastSeq: number;
};

export const DURABLE_TYPES = [
  'instance_created', 'boot', 'composition', 'user_message', 'assistant_message',
  'interrupt', 'context_evict', 'dispatch', 'return',
  'tool_use', 'tool_result',
] as const;
export type DurableType = (typeof DURABLE_TYPES)[number];

/** Transient (seq 0). data is a SNAPSHOT of text so far — never a delta (I-4). */
export const ASSISTANT_DELTA = 'assistant_delta';

export type UserMessageData = { text: string; clientKey?: string };
/**
 * `error`: the engine's machine code for a failed turn (e.g. `no_api_key`,
 * `provider_api_400` — `armillary-engine`'s `fail_turn` in `loop_.rs`), paired
 * with `text: ""` and `interrupted: true` on that same failure-shaped
 * envelope. Never a human sentence — the house rule is to name the refusal
 * verbatim, not paraphrase it.
 */
export type AssistantMessageData = {
  text: string;
  generation: string;
  interrupted?: boolean;
  model?: string;
  error?: string;
};
export type AssistantDeltaData = { textSoFar: string; generation: string };
export type BootData = { path: string; sha256: string };
/** The model asked for a tool. `parent` on the envelope links a whole batch. */
export type ToolUseData = { id: string; name: string; input: unknown };
/**
 * The tool answered. `status` is the machine code and it is **sovereign** —
 * the engine, this client and conformance all read it, and it is never derived
 * from `content`. `ok` on success; otherwise the guard's or the tool's own
 * code (`denied_credential`, `not_openable`, `bound_reached`, …). Same house
 * rule as `AssistantMessageData.error`: name the refusal verbatim, never
 * paraphrase it.
 *
 * The wire has no slot for `status` inside a `tool_result` block (a `status`
 * key there is a 400), so at the model boundary it renders into `content`
 * alongside `isError` — but in the log, and here, it stays typed.
 */
export type ToolResultData = {
  toolUseId: string;
  status: string;
  content: string;
  isError: boolean;
};
/**
 * **DD-1** — what the engine determined the workspace is composed of, recorded
 * at instance creation and re-derived when a manifest changes under the
 * session.
 *
 * `manifests` carries the sha256 digests the engine re-checks for drift; they
 * are not this client's business, but they are part of the event and typing
 * them as absent would be a lie. `composition` is the parsed manifest — modules
 * carry more fields than `name`, which is all any label here needs.
 */
export type CompositionData = {
  manifests: { path: string; sha256: string }[];
  composition: {
    operators?: { name: string }[];
    commons?: { name: string }[];
    repos?: { name: string }[];
    protocols?: { name: string }[];
  };
};
export type ContextEvictData = { target: string };
export type DispatchData = { child: string; childStream: string; operator: string | null };
export type ReturnData = { child: string; summary?: string };

export type AttachInfo = { instance: Instance; earliestSeq: number; headSeq: number };
export type SendReceipt = { id: string; seq: number };
export type GapInfo = { requestedFrom: number; earliestAvailable: number };
export type SubscriptionStatus = 'replaying' | 'live' | 'reconnecting' | 'closed';
export type SubscriptionHandler = {
  onEvent(e: EventEnvelope): void;
  onStatus(s: SubscriptionStatus): void;
  onGap(g: GapInfo): void;
};
export type Unsubscribe = () => void;

/**
 * Thrown by `LiveSessionAPI` on a non-OK HTTP response. Lives here (not in
 * `live.ts`) to mirror `daemon/types.ts`'s `DaemonError`: the session
 * contract's error shape belongs with the other session types, not buried in
 * one transport's implementation file — a future second HTTP-backed
 * implementation (or a test double) can import it without importing
 * `LiveSessionAPI` itself.
 */
export class SessionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SessionError';
    this.status = status;
  }
}
