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
  'instance_created', 'boot', 'user_message', 'assistant_message',
  'interrupt', 'context_evict', 'dispatch', 'return',
] as const;
export type DurableType = (typeof DURABLE_TYPES)[number];

/** Transient (seq 0). data is a SNAPSHOT of text so far — never a delta (I-4). */
export const ASSISTANT_DELTA = 'assistant_delta';

export type UserMessageData = { text: string; clientKey?: string };
export type AssistantMessageData = { text: string; generation: string; interrupted?: boolean; model?: string };
export type AssistantDeltaData = { textSoFar: string; generation: string };
export type BootData = { path: string; sha256: string };
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
