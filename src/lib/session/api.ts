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
  /**
   * `model` pins which model pilots this instance, for its whole life —
   * there is no changing it afterwards (design decision 1). `null` means the
   * engine's own default pilots, which is what an app talking to an engine
   * with no catalog sends.
   *
   * Required, not optional: an omitted argument here would compile silently
   * and fall back to the engine default even where a caller meant to pass a
   * real selection — Task 7's picker is exactly the call site where that
   * silent fallback would be a bad failure (an instance piloted by a model
   * the user never chose, with nothing surfacing the mismatch). Making it
   * required turns a dropped argument into a compile error at that one call
   * site instead.
   */
  create(operator: string | null, model: string | null): Promise<Instance>;
  list(): Promise<Instance[]>;
  attach(instanceId: string): Promise<AttachInfo>;
  /** Returns an unsubscribe function. `stream` and `fromSeq` are the cursor pair, per invariant (iii). */
  subscribe(stream: string, fromSeq: number, handler: SubscriptionHandler): Unsubscribe;
  send(instanceId: string, text: string, clientKey: string): Promise<SendReceipt>;
  interrupt(instanceId: string): Promise<void>;
  evict(instanceId: string, eventId: string): Promise<void>;
  /**
   * Appends `instance_archived` to the instance's own stream. Hides it from
   * the default list and bars NOTHING — send/attach/subscribe still work
   * (design 2026-08-11 D1, constitution A-3). Reversed by `unarchive`;
   * sending does not unarchive (D5).
   */
  archive(instanceId: string): Promise<void>;
  unarchive(instanceId: string): Promise<void>;
}
