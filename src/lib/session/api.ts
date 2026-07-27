import type { EventEnvelope, Instance } from './events';

/* ============================================================================
 * GATE — do not implement this interface live before the design is held.
 *
 * David's standing instruction, 2026-07-27. The explainer and the open product
 * decisions are at `zojercommons/athanor/sessions-and-the-sessionapi-gate.md`.
 *
 * What is wrong with the shape below, briefly, so nobody has to take it on
 * faith: it models request/response for a problem that is mostly streaming.
 * There is no error channel, so a client can never show "disconnected". There
 * is no way to say "your cursor is too old, the earliest I have is N". There is
 * no contract for how two hundred transient token-deltas coalesce into the one
 * durable message that supersedes them. `send` returns void, so a locally
 * echoed bubble can never be matched to the durable event that comes back —
 * duplicate messages on screen, then a rewrite. And `fromSeq`, the parameter
 * the whole resume story rests on, is DISCARDED BY THE MOCK and asserted by no
 * test, so an implementation that ignores replay entirely passes everything.
 *
 * The seam is cheap to change now: one mock, no screens depending on its
 * behaviour. It stops being cheap the moment a session surface exists, because
 * then the interface and every screen above it get rewritten together.
 * ==========================================================================*/

/**
 * The session surface.
 *
 * Sprint 1 ships only `MockSessionAPI`, and the Instances tab says so on screen.
 * The seam exists now so that when the engine grows a loop and a log, a live
 * implementation replaces the mock and the tab becomes real without a redesign —
 * which is the entire reason to type it against the event envelope today rather
 * than inventing a shape and reconciling later.
 */
export interface SessionAPI {
  create(operator: string | null): Promise<Instance>;
  list(): Promise<Instance[]>;
  attach(instanceId: string): Promise<Instance>;
  /** Returns an unsubscribe function. `fromSeq` is the cursor, per invariant (iii). */
  subscribe(
    instanceId: string,
    fromSeq: number,
    onEvent: (event: EventEnvelope) => void,
  ): () => void;
  send(instanceId: string, text: string): Promise<void>;
}
