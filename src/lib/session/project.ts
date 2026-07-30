// Pure, total reducer from durable events (+ transients + pending sends) to
// renderable rows. No React, no side effects — Task 4's hook drives this with
// live data; Task 5's screen renders whatever comes out.
//
// Design: repos/armillary-expo/.superpowers/sdd/2026-07-27-sprint-2-sessionapi-plan/task-3-brief.md

import type {
  ActorRole,
  AssistantDeltaData,
  AssistantMessageData,
  ContextEvictData,
  DispatchData,
  EventEnvelope,
  ReturnData,
  ToolResultData,
  ToolUseData,
  UserMessageData,
} from './events';

export type SessionRow =
  | {
      kind: 'message';
      id: string;
      seq: number;
      role: ActorRole;
      text: string;
      interrupted?: boolean;
      evicted?: boolean;
      /** The engine's machine code for a failed turn (see events.ts's
       *  AssistantMessageData comment). Set only for a failure-shaped
       *  assistant_message — never derived from `text`, so an empty-but-not-
       *  failed message (were one ever to exist) would not be mistaken for one. */
      error?: string;
    }
  | { kind: 'streaming'; generation: string; text: string }
  | { kind: 'pending'; clientKey: string; text: string }
  | { kind: 'system'; id: string; seq: number; label: string }
  | { kind: 'gap'; label: string };

/** A send the UI has optimistically echoed but the durable log hasn't confirmed yet. */
export type PendingSend = { clientKey: string; text: string; at: string };

/** `instance_created` has no dedicated payload type in the design — see mock.ts. */
type InstanceCreatedData = { operator: string | null };

function systemRow(e: EventEnvelope, label: string): SessionRow {
  return { kind: 'system', id: e.id, seq: e.seq, label };
}

/**
 * The one argument worth a glance on a phone.
 *
 * `input` is whatever the model sent and is bounded by nothing, so it is never
 * dumped into a label. `path` is the argument every read tool shares and the
 * only one that answers "what did it just look at" — anything else is detail
 * for a screen that can afford it.
 */
function toolArgLabel(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const path = (input as { path?: unknown }).path;
  if (typeof path !== 'string' || path.length === 0 || path.length > 120) return undefined;
  return path;
}

type MessageRow = Extract<SessionRow, { kind: 'message' }>;

export function projectSession(
  durable: EventEnvelope[],
  transients: Map<string, AssistantDeltaData>,
  pending: PendingSend[],
): SessionRow[] {
  const sorted = [...durable].sort((a, b) => a.seq - b.seq);

  // First pass: gather what later suppresses/marks other rows, independent of
  // event order (an evict targeting an earlier event is the common case, but
  // nothing here depends on that).
  const evictedIds = new Set<string>();
  const durableGenerations = new Set<string>();
  const durableClientKeys = new Set<string>();
  /** tool_use id → the tool's name, so a result can say what it answered. */
  const toolNames = new Map<string, string>();
  for (const e of sorted) {
    switch (e.type) {
      case 'tool_use': {
        const data = e.data as ToolUseData;
        toolNames.set(data.id, data.name);
        break;
      }
      case 'context_evict':
        evictedIds.add((e.data as ContextEvictData).target);
        break;
      case 'assistant_message':
        durableGenerations.add((e.data as AssistantMessageData).generation);
        break;
      case 'user_message': {
        const clientKey = (e.data as UserMessageData).clientKey;
        if (clientKey) durableClientKeys.add(clientKey);
        break;
      }
      default:
        break;
    }
  }

  const rows: SessionRow[] = [];

  for (const e of sorted) {
    switch (e.type) {
      case 'user_message': {
        const data = e.data as UserMessageData;
        const row: MessageRow = { kind: 'message', id: e.id, seq: e.seq, role: e.actor.role, text: data.text };
        if (evictedIds.has(e.id)) row.evicted = true;
        rows.push(row);
        break;
      }
      case 'assistant_message': {
        const data = e.data as AssistantMessageData;
        const row: MessageRow = { kind: 'message', id: e.id, seq: e.seq, role: e.actor.role, text: data.text };
        if (data.interrupted) row.interrupted = true;
        if (data.error) row.error = data.error;
        if (evictedIds.has(e.id)) row.evicted = true;
        rows.push(row);
        break;
      }
      case 'instance_created': {
        const data = e.data as InstanceCreatedData;
        rows.push(systemRow(e, `instance started: ${data.operator ?? 'dispatcher'}`));
        break;
      }
      case 'boot': {
        rows.push(systemRow(e, 'boot'));
        break;
      }
      case 'interrupt': {
        rows.push(systemRow(e, 'stopped'));
        break;
      }
      case 'context_evict': {
        rows.push(systemRow(e, 'removed from context'));
        break;
      }
      case 'dispatch': {
        const data = e.data as DispatchData;
        rows.push(systemRow(e, `dispatched to ${data.child}`));
        break;
      }
      case 'return': {
        const data = e.data as ReturnData;
        rows.push(systemRow(e, `returned from ${data.child}`));
        break;
      }
      case 'tool_use': {
        const data = e.data as ToolUseData;
        const arg = toolArgLabel(data.input);
        rows.push(systemRow(e, arg ? `${data.name}: ${arg}` : data.name));
        break;
      }
      case 'tool_result': {
        const data = e.data as ToolResultData;
        // The name comes from the batch's `tool_use`. It can be absent — the
        // pair may have been split by an eviction, or the log replayed from a
        // point after the call — so this reads as "a tool" rather than
        // crashing on a lookup the client cannot guarantee.
        const name = toolNames.get(data.toolUseId) ?? 'tool';
        // `status` verbatim, never a paraphrase, and `content` by size only:
        // one result can be 64 KiB and this label is a glance.
        rows.push(
          systemRow(
            e,
            data.isError
              ? `${name} refused: ${data.status}`
              : `${name} answered (${data.content.length} chars)`,
          ),
        );
        break;
      }
      default: {
        // Honest-failure house rule: an unrecognized durable type (e.g. a
        // schema addition this reducer hasn't been taught yet) must stay
        // visible, never silently vanish and never throw.
        rows.push(systemRow(e, `unhandled event type: ${e.type}`));
        break;
      }
    }
  }

  for (const [generation, data] of transients) {
    if (durableGenerations.has(generation)) continue;
    rows.push({ kind: 'streaming', generation, text: data.textSoFar });
  }

  for (const p of pending) {
    if (durableClientKeys.has(p.clientKey)) continue;
    rows.push({ kind: 'pending', clientKey: p.clientKey, text: p.text });
  }

  return rows;
}
