import type { EventEnvelope, Instance } from './events';

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
