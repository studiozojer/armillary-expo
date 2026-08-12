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
  /** Pinned at creation; null when the engine's default pilots. */
  model: string | null;
  /** WD-9 — the per-session manifest-write grant. Served by the engine all
   *  along; modeled here 2026-08-11 (the standing type drift, fixed in the
   *  archive pass). */
  mayWriteComposition: boolean;
  /** Latest lifecycle marker wins; false for anything recorded before the
   *  archive verbs existed (instance-archive design, 2026-08-11). */
  archived: boolean;
  /**
   * Whether a turn is running for this instance right now.
   *
   * The one field here that is NOT log-derived — the engine reads it from
   * its in-memory turn slot at request time. An engine restarted mid-turn
   * reports `false`, correctly: that turn died with the process.
   *
   * Optional-with-default is deliberate: an engine built before this field
   * existed omits it, and the app must attach against that engine rather
   * than fail to parse. Read it as `instance.turnInProgress ?? false`.
   */
  turnInProgress?: boolean;
};

export const DURABLE_TYPES = [
  'instance_created', 'boot', 'composition', 'user_message', 'assistant_message',
  'interrupt', 'context_evict', 'dispatch', 'return',
  'tool_use', 'tool_result',
  'instance_archived', 'instance_unarchived',
] as const;
export type DurableType = (typeof DURABLE_TYPES)[number];

/** Transient (seq 0). data is a SNAPSHOT of text so far — never a delta (I-4). */
export const ASSISTANT_DELTA = 'assistant_delta';

/** Transient (seq 0) turn-lifecycle markers. The engine broadcasts these from
 *  `Sessions::begin_turn` / `end_turn`, so a claim without a signal is
 *  structurally impossible. Never durable — a client that was not connected
 *  learns turn state from `attach`'s `turnInProgress` instead. */
export const TURN_STARTED = 'turn_started';
export const TURN_ENDED = 'turn_ended';
export type TurnLifecycleData = { generation: string };

/**
 * One block of the model's reasoning, in the exact wire shape the engine
 * persisted (it re-uses the same encoder that builds the request body — one
 * encoding, two readers).
 *
 * `redacted_thinking` arrives ENCRYPTED from the API and can never be
 * displayed at any position. It is modeled rather than dropped so the UI can
 * say "some reasoning was redacted" instead of rendering a blank that reads
 * as broken.
 */
export type ThinkingBlock =
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'redacted_thinking'; data: string };

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
  /**
   * The round's reasoning, when the engine persisted any.
   *
   * **Optional, and absence is the common case** — the engine's
   * `persist_thinking` requires the round to have also produced text or tool
   * calls, so a thinking-only cut round persists none. Never render absence
   * as a loading state.
   */
  thinking?: ThinkingBlock[];
};
export type AssistantDeltaData = { textSoFar: string; generation: string };
/**
 * The files pushed into the session's system prompt at instance creation —
 * the router's own, plus the summoned operator's declared list (B-2).
 *
 * `files` is the current shape; `path`/`sha256` is what streams written before
 * B-2 carry, and both must render, because a client that cannot read the log's
 * own history is not reading the log.
 *
 * `present: false` means the file was declared and did not load. It is recorded
 * rather than dropped precisely so it can be SEEN — a boot that quietly loads
 * two of three identity files is the failure the flag exists to catch.
 */
export type BootData = {
  files?: { path: string; sha256?: string; present: boolean }[];
  path?: string;
  sha256?: string;
};
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
