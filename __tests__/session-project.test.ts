import { projectSession } from '../src/lib/session/project';
import type { PendingSend, SessionRow } from '../src/lib/session/project';
import { DURABLE_TYPES } from '../src/lib/session/events';
import type {
  Actor,
  AssistantDeltaData,
  AssistantMessageData,
  BootData,
  CompositionData,
  ContextEvictData,
  DurableType,
  ThinkingBlock,
  ToolResultData,
  EventEnvelope,
  UserMessageData,
} from '../src/lib/session/events';

const t = '2026-07-28T00:00:00.000Z';

let counter = 0;

function makeEnvelope<T>(
  type: string,
  data: T,
  overrides: Partial<EventEnvelope<T>> = {},
): EventEnvelope<T> {
  counter += 1;
  return {
    stream: 'inst-1',
    id: `evt-${counter}`,
    seq: counter,
    ts: t,
    actor: { role: 'user' },
    type,
    version: 1,
    data,
    ...overrides,
  };
}

function userMessage(opts: { text: string; clientKey?: string; seq?: number; id?: string }): EventEnvelope<UserMessageData> {
  return makeEnvelope(
    'user_message',
    { text: opts.text, clientKey: opts.clientKey },
    { seq: opts.seq, id: opts.id },
  );
}

const operatorActor: Actor = { role: 'operator', instance: 'tycho' };

function assistantMessage(opts: {
  text: string;
  generation: string;
  interrupted?: boolean;
  error?: string;
  thinking?: ThinkingBlock[];
  seq?: number;
  id?: string;
}): EventEnvelope<AssistantMessageData> {
  return makeEnvelope(
    'assistant_message',
    {
      text: opts.text,
      generation: opts.generation,
      interrupted: opts.interrupted,
      error: opts.error,
      thinking: opts.thinking,
    },
    { seq: opts.seq, id: opts.id, actor: operatorActor },
  );
}

function contextEvict(opts: { target: string; seq?: number }): EventEnvelope<ContextEvictData> {
  return makeEnvelope('context_evict', { target: opts.target }, { seq: opts.seq });
}

/**
 * Plausible payload per durable type — enough to satisfy each type's data shape.
 *
 * **The return type is `object`, not `unknown`, and that is the whole point.**
 * With `unknown`, a new member of `DURABLE_TYPES` fell through every case and
 * returned `undefined`, which type-checked; the reducer's default arm then kept
 * the row count non-zero and this guard passed. Two types were added with no
 * payload and no reducer arm and neither `tsc` nor jest said a word. Now a
 * missing case is a compile error here, and the assertion below is a jest
 * failure there — the two halves of what `handled_types_cover_every_durable_type`
 * does on the Rust side.
 */
function plausibleDataFor(type: DurableType): object {
  switch (type) {
    case 'instance_created':
      return { operator: 'tycho' };
    case 'boot':
      return { path: 'operators/tycho/CLAUDE.md', sha256: 'deadbeef' };
    case 'user_message':
      return { text: 'hello', clientKey: 'ck-1' };
    case 'assistant_message':
      return { text: 'hi', generation: 'gen-1' };
    case 'interrupt':
      return {};
    case 'context_evict':
      return { target: 'evt-target-1' };
    case 'dispatch':
      return { child: 'child-1', childStream: 'child-1-stream', operator: 'kepler' };
    case 'return':
      return { child: 'child-1', summary: 'done' };
    case 'composition':
      return {
        manifests: [{ path: 'modules.toml', sha256: 'deadbeef' }],
        composition: { operators: [{ name: 'tycho' }], commons: [], repos: [], protocols: [] },
      };
    case 'tool_use':
      return { id: 'toolu_01A', name: 'read_file', input: { path: 'CLAUDE.md' } };
    case 'tool_result':
      return { toolUseId: 'toolu_01A', status: 'ok', content: '# armillary', isError: false };
    case 'instance_archived':
      return {};
    case 'instance_unarchived':
      return {};
  }
}

function envelopeOf(type: DurableType): EventEnvelope {
  return makeEnvelope(type, plausibleDataFor(type), {
    actor: type === 'assistant_message' ? operatorActor : { role: 'user' },
  });
}

function isMessageRow(r: SessionRow): r is Extract<SessionRow, { kind: 'message' }> {
  return r.kind === 'message';
}
function isSystemRow(r: SessionRow): r is Extract<SessionRow, { kind: 'system' }> {
  return r.kind === 'system';
}

// Design 2026-08-11 D6: these two markers govern the Instances list, not the
// transcript — projectSession deliberately emits no row for them.
const NO_ROW_TYPES = new Set<DurableType>(['instance_archived', 'instance_unarchived']);

describe('projectSession', () => {
  it('is total over every durable type', () => {
    for (const type of DURABLE_TYPES) {
      let rows: SessionRow[] = [];
      expect(() => {
        rows = projectSession([envelopeOf(type)], new Map(), []);
      }).not.toThrow();
      if (NO_ROW_TYPES.has(type)) {
        expect(rows.length).toBe(0);
      } else {
        // no other durable type may vanish silently — each yields a visible row.
        expect(rows.length).toBeGreaterThan(0);
      }
    }
  });

  it('archive markers produce no rows — list-level metadata, not transcript', () => {
    const rows = projectSession(
      [
        makeEnvelope('user_message', { text: 'hi' }),
        makeEnvelope('instance_archived', {}),
        makeEnvelope('instance_unarchived', {}),
      ],
      new Map(),
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('message');
  });

  it('has a reducer arm for every type it claims to know', () => {
    // `DURABLE_TYPES` is this client's hand-copied claim about what it
    // understands. The default arm's `unhandled event type:` is the honest
    // degradation for a type from a NEWER engine — reaching it for a type
    // already on our own list is not degradation, it is the list lying.
    for (const type of DURABLE_TYPES) {
      const rows = projectSession([envelopeOf(type)], new Map(), []);
      const unhandled = rows.filter(
        (r) => r.kind === 'system' && r.label.startsWith('unhandled event type:'),
      );
      expect(unhandled).toHaveLength(0);
    }
  });

  describe('the composition event', () => {
    const composition = (over: Partial<CompositionData['composition']> = {}) =>
      makeEnvelope(
        'composition',
        {
          manifests: [{ path: 'modules.toml', sha256: 'abc' }],
          composition: { operators: [], commons: [], repos: [], protocols: [], ...over },
        },
        { actor: { role: 'system' } },
      );

    it('counts what is composed rather than pasting the manifest into a label', () => {
      const rows = projectSession(
        [
          composition({
            operators: [{ name: 'tycho' }, { name: 'kepler' }],
            repos: [{ name: 'kairos-engine' }],
            protocols: [{ name: 'board' }],
          }),
        ],
        new Map(),
        [],
      );
      const label = rows.find(isSystemRow)!.label;
      expect(label).toContain('2 operators');
      expect(label).toContain('1 repo');
      expect(label).toContain('1 protocol');
      expect(label).not.toContain('tycho');
    });

    it('says a bare workspace composes nothing rather than rendering an empty label', () => {
      const rows = projectSession([composition()], new Map(), []);
      const label = rows.find(isSystemRow)!.label;
      expect(label.trim().length).toBeGreaterThan(0);
      expect(label).toContain('nothing');
    });

    it('does not render as a message from the user', () => {
      // Engine-authored. It rides in a User-role turn at the model boundary
      // because the wire has two roles, but the transcript has more room than
      // that and must not blur who wrote it.
      const rows = projectSession([composition()], new Map(), []);
      expect(rows.filter(isMessageRow)).toHaveLength(0);
    });
  });

  describe('a tool round', () => {
    const toolUse = (id: string, name: string, input: unknown) =>
      makeEnvelope('tool_use', { id, name, input }, { actor: operatorActor });
    const toolResult = (toolUseId: string, over: Partial<ToolResultData> = {}) =>
      makeEnvelope(
        'tool_result',
        { toolUseId, status: 'ok', content: 'x'.repeat(412), isError: false, ...over },
        { actor: { role: 'tool' } },
      );

    it('names the tool and the path it was pointed at', () => {
      const rows = projectSession(
        [toolUse('t1', 'read_file', { path: 'notes/board.md' })],
        new Map(),
        [],
      );
      const row = rows.find(isSystemRow);
      expect(row?.label).toContain('read_file');
      expect(row?.label).toContain('notes/board.md');
    });

    it('reports a result by size, never by pasting it into the label', () => {
      // A tool result can be 64 KiB. The label is a glance on a phone.
      const rows = projectSession([toolUse('t1', 'read_file', {}), toolResult('t1')], new Map(), []);
      const label = rows.filter(isSystemRow)[1].label;
      expect(label).toContain('read_file');
      expect(label).toContain('412');
      expect(label).not.toContain('xxxxxxxxxx');
    });

    it('names a refusal by its machine code, never a paraphrase', () => {
      const rows = projectSession(
        [
          toolUse('t1', 'read_file', { path: 'repos/app/.env' }),
          toolResult('t1', { status: 'denied_credential', content: '', isError: true }),
        ],
        new Map(),
        [],
      );
      expect(rows.filter(isSystemRow)[1].label).toContain('denied_credential');
    });

    it('still renders a result whose tool_use was evicted out from under it', () => {
      // The engine evicts a batch atomically, but a client must not depend on
      // the engine being right — a lone result renders rather than crashing.
      const rows = projectSession([toolResult('t-gone')], new Map(), []);
      expect(rows.filter(isSystemRow)).toHaveLength(1);
    });

    it('does not put a tool result in the transcript as if the operator said it', () => {
      const rows = projectSession([toolUse('t1', 'read_file', {}), toolResult('t1')], new Map(), []);
      expect(rows.filter(isMessageRow)).toHaveLength(0);
    });
  });

  it('replaces a pending bubble when its clientKey echoes back', () => {
    const durable = [userMessage({ text: 'hello', clientKey: 'k1', seq: 2 })];
    const pending: PendingSend[] = [{ clientKey: 'k1', text: 'hello', at: t }];
    const rows = projectSession(durable, new Map(), pending);
    expect(rows.filter((r) => r.kind === 'pending')).toHaveLength(0);
    expect(rows.filter((r) => r.kind === 'message')).toHaveLength(1);
  });

  it('does not suppress a pending bubble whose clientKey has not echoed back yet', () => {
    const pending: PendingSend[] = [{ clientKey: 'k2', text: 'still waiting', at: t }];
    const rows = projectSession([], new Map(), pending);
    expect(rows.filter((r) => r.kind === 'pending')).toHaveLength(1);
  });

  it('drops the streaming row once the durable message with its generation lands', () => {
    const durable = [assistantMessage({ text: 'final answer', generation: 'gen-3', seq: 1 })];
    const transients = new Map<string, AssistantDeltaData>([
      ['gen-3', { textSoFar: 'partial', generation: 'gen-3' }],
    ]);
    const rows = projectSession(durable, transients, []);
    expect(rows.filter((r) => r.kind === 'streaming')).toHaveLength(0);
    expect(rows.filter((r) => r.kind === 'message')).toHaveLength(1);
  });

  it('keeps a streaming row whose generation has no durable message yet', () => {
    const transients = new Map<string, AssistantDeltaData>([
      ['gen-4', { textSoFar: 'still typing', generation: 'gen-4' }],
    ]);
    const rows = projectSession([], transients, []);
    expect(rows.filter((r) => r.kind === 'streaming')).toHaveLength(1);
  });

  it('marks evicted rows instead of removing them', () => {
    const target = userMessage({ text: 'secret', clientKey: 'k9', seq: 1 });
    const evict = contextEvict({ target: target.id, seq: 2 });
    const rows = projectSession([target, evict], new Map(), []);

    const messageRow = rows.find(isMessageRow);
    expect(messageRow).toBeDefined();
    expect(messageRow?.evicted).toBe(true);

    const systemRows = rows.filter(isSystemRow);
    expect(systemRows).toHaveLength(1);
    expect(systemRows[0].label).toBe('removed from context');
  });

  it('gives interrupt a "stopped" system row', () => {
    const rows = projectSession([envelopeOf('interrupt')], new Map(), []);
    const systemRow = rows.find(isSystemRow);
    expect(systemRow?.label).toBe('stopped');
  });

  it('names the operator on instance_created, or dispatcher when none', () => {
    const withOperator = makeEnvelope('instance_created', { operator: 'tycho' }, { seq: 1 });
    const withoutOperator = makeEnvelope('instance_created', { operator: null }, { seq: 1 });

    const rows1 = projectSession([withOperator], new Map(), []);
    const rows2 = projectSession([withoutOperator], new Map(), []);

    const row1 = rows1.find(isSystemRow);
    const row2 = rows2.find(isSystemRow);
    expect(row1?.label).toContain('tycho');
    expect(row2?.label).toContain('dispatcher');
  });

  it('names the child on dispatch and return rows', () => {
    const dispatch = makeEnvelope(
      'dispatch',
      { child: 'child-9', childStream: 'child-9-stream', operator: 'kepler' },
      { seq: 1 },
    );
    const ret = makeEnvelope('return', { child: 'child-9', summary: 'ok' }, { seq: 2 });
    const rows = projectSession([dispatch, ret], new Map(), []).filter(isSystemRow);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.label.includes('child-9'))).toBe(true);
  });

  it('marks an interrupted assistant_message row', () => {
    const msg = assistantMessage({ text: 'partial reply', generation: 'gen-7', interrupted: true, seq: 1 });
    const rows = projectSession([msg], new Map(), []);
    const row = rows.find(isMessageRow);
    expect(row?.interrupted).toBe(true);
  });

  it('carries the machine code onto the row for a failure-shaped assistant_message, and never blanks it', () => {
    // Matches the engine's `fail_turn` shape (loop_.rs): text is always "",
    // interrupted is always true, and error is the machine code verbatim.
    const msg = assistantMessage({
      text: '',
      generation: 'gen-fail',
      interrupted: true,
      error: 'no_api_key',
      seq: 1,
    });
    const rows = projectSession([msg], new Map(), []);
    const row = rows.find(isMessageRow);
    expect(row?.error).toBe('no_api_key');
    expect(row?.text).toBe('');
  });

  it('leaves error undefined on an ordinary assistant_message', () => {
    const msg = assistantMessage({ text: 'all good', generation: 'gen-ok', seq: 1 });
    const rows = projectSession([msg], new Map(), []);
    const row = rows.find(isMessageRow);
    expect(row?.error).toBeUndefined();
  });

  it('carries thinking blocks onto the message row', () => {
    const msg = assistantMessage({
      text: 'Here.',
      generation: 'g1',
      thinking: [{ type: 'thinking', thinking: 'let me look', signature: 's' }],
    });
    const rows = projectSession([msg], new Map(), []);
    const row = rows.find(isMessageRow);
    expect(row).toMatchObject({ thinking: [{ type: 'thinking', thinking: 'let me look' }] });
  });

  it('leaves thinking undefined when the round persisted none', () => {
    // The common case — `persist_thinking` requires text or tool calls
    // alongside, so most rounds carry nothing. Undefined, never an empty
    // array: an empty array would render an accordion with nothing in it.
    const msg = assistantMessage({ text: 'Here.', generation: 'g1' });
    const rows = projectSession([msg], new Map(), []);
    const row = rows.find(isMessageRow);
    expect(row).not.toHaveProperty('thinking');
  });

  it('never drops an unrecognized durable type — surfaces it as a visible system row', () => {
    const mystery = makeEnvelope('some_future_event', { anything: true }, { seq: 1 });
    const rows = projectSession([mystery], new Map(), []);
    expect(rows).toHaveLength(1);
    const row = rows.find(isSystemRow);
    expect(row?.label).toBe('unhandled event type: some_future_event');
  });

  it('orders durable rows by seq ascending, then streaming, then pending', () => {
    const first = userMessage({ text: 'first', clientKey: 'a', seq: 5 });
    const second = assistantMessage({ text: 'second', generation: 'gen-x', seq: 3 });
    const transients = new Map<string, AssistantDeltaData>([
      ['gen-y', { textSoFar: 'streaming...', generation: 'gen-y' }],
    ]);
    const pending: PendingSend[] = [{ clientKey: 'b', text: 'pending text', at: t }];

    const rows = projectSession([first, second], transients, pending);

    expect(rows.map((r) => r.kind)).toEqual(['message', 'message', 'streaming', 'pending']);
    const messageRows = rows.filter(isMessageRow);
    expect(messageRows.map((r) => r.seq)).toEqual([3, 5]);
  });

  describe('the boot row', () => {
    const boot = (files: BootData['files']) =>
      makeEnvelope('boot', { files }, { actor: { role: 'system' } });

    it('says how many files an operator booted with', () => {
      const rows = projectSession(
        [
          boot([
            { path: 'operators/tycho/self.md', sha256: 'a', present: true },
            { path: 'operators/tycho/voice.md', sha256: 'b', present: true },
          ]),
        ],
        new Map(),
        [],
      );
      expect(rows.find(isSystemRow)!.label).toBe('booted 2 files');
    });

    it('is loud about a declared file that did not load', () => {
      // The whole reason `present` is recorded. A boot that quietly loads two
      // of three files is the failure this flag exists to catch, and a row
      // reading "booted 2 files" would hide it perfectly.
      const rows = projectSession(
        [
          boot([
            { path: 'operators/tycho/self.md', sha256: 'a', present: true },
            { path: 'operators/tycho/voice.md', present: false },
          ]),
        ],
        new Map(),
        [],
      );
      // Asserted whole, not by `toContain`. Mutation-found gap: with only
      // "contains 1 missing" and "contains voice.md", counting the absent file
      // as loaded — "booted 2 files · 1 missing: voice.md" — passed cleanly,
      // and the count is the number a glance actually reads.
      expect(rows.find(isSystemRow)!.label).toBe(
        'booted 1 file · 1 missing: operators/tycho/voice.md',
      );
    });

    it('names every missing file, not just the first', () => {
      const rows = projectSession(
        [
          boot([
            { path: 'a.md', present: false },
            { path: 'b.md', present: false },
          ]),
        ],
        new Map(),
        [],
      );
      const label = rows.find(isSystemRow)!.label;
      expect(label).toContain('a.md');
      expect(label).toContain('b.md');
    });

    it('still renders a boot event written before files existed', () => {
      // Streams predating B-2 carry `{path, sha256}` and no `files` array.
      const rows = projectSession(
        [makeEnvelope('boot', { path: 'getting-started.md', sha256: 'a' })],
        new Map(),
        [],
      );
      expect(rows.find(isSystemRow)!.label).toBe('booted 1 file');
    });
  });

  it('does not produce gap rows itself', () => {
    const rows = projectSession([envelopeOf('boot')], new Map(), []);
    expect(rows.filter((r) => r.kind === 'gap')).toHaveLength(0);
  });
});
