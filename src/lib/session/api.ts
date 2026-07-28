import type { Instance } from './events';
import type { AttachInfo, SendReceipt, SubscriptionHandler, Unsubscribe } from './events';

/**
 * The session surface.
 *
 * The gate (`zojercommons/athanor/sessions-and-the-sessionapi-gate.md`) is satisfied.
 * This is the ratified interface — design at
 * `zojercommons/projects/harness/specs/2026-07-27-sprint-2-sessionapi-design.md`,
 * decisions D1–D10.
 */
export interface SessionAPI {
  create(operator: string | null): Promise<Instance>;
  list(): Promise<Instance[]>;
  attach(instanceId: string): Promise<AttachInfo>;
  /** Returns an unsubscribe function. `stream` and `fromSeq` are the cursor pair, per invariant (iii). */
  subscribe(stream: string, fromSeq: number, handler: SubscriptionHandler): Unsubscribe;
  send(instanceId: string, text: string, clientKey: string): Promise<SendReceipt>;
  interrupt(instanceId: string): Promise<void>;
  evict(instanceId: string, eventId: string): Promise<void>;
}
