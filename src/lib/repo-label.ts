import type { ActionErrorKind, Position, RepoState } from './daemon/types';

/**
 * How urgently a row's label should read. `error` and `warn` both mean
 * "something to look at" — the split exists because a REFUSAL (git declined
 * on purpose: a dirty tree, diverged history) is quieter news than a FAILURE
 * (the engine couldn't even ask: a timeout, an unreachable remote). `muted`
 * is the resting state — nothing to act on, just a timestamp.
 */
export type Tone = 'error' | 'warn' | 'muted';

export type Label = { text: string; tone: Tone };

/**
 * What a row says about itself, and how loudly. This is a pure function —
 * same `RepoState` in, same `Label` out, no model anywhere in the path. An
 * earlier draft of this design called the return value a "headline," which
 * read as if something had composed it; it is a ten-line ladder over facts
 * the engine already measured, nothing more.
 *
 * The ladder is David's (2026-08-04): **error → dirty → ahead/behind →
 * last-fetch.** Recency is the baseline every row falls back to; state
 * overrides it, in order of how much it disqualifies the recency reading
 * that would otherwise be shown — an unreadable repo has no state to speak
 * of, a refused/failed action means the counts below are stale, a dirty
 * tree is actionable right now, and only once none of those apply does
 * "how long since we last looked" become the answer.
 */
export function rowLabel(s: RepoState, now: Date = new Date()): Label {
  if (s.read_error) return { text: 'unreadable', tone: 'error' };
  if (s.action_error) return ACTION_ERROR[s.action_error.kind];
  if (s.dirty_files > 0) return { text: `${s.dirty_files} changed`, tone: 'warn' };

  const positional = positionLabel(s.position);
  if (positional) return positional;

  return { text: relative(s.last_fetch, now), tone: 'muted' };
}

/**
 * What `kind` a failed action reports, in words. `Record<ActionErrorKind,
 * Label>` on purpose — the same idiom `module-list.tsx`'s retired
 * `SKIP_LABELS` carried for the old sync report: a sixth kind added to the
 * engine's closed vocabulary without a label here is a compile error, not a
 * row rendering its enum spelling.
 *
 * A refusal reads quieter than a failure. `dirty`, `not-fast-forwardable`,
 * and `refused-by-remote` are git (or the remote) declining ON PURPOSE —
 * the request was heard and answered, just "no." `transport` and `timeout`
 * are the engine not getting an answer at all. Same shape, different
 * urgency, so `warn` and `error` respectively.
 */
const ACTION_ERROR: Record<ActionErrorKind, Label> = {
  dirty: { text: 'refused — uncommitted', tone: 'warn' },
  'not-fast-forwardable': { text: 'refused — diverged', tone: 'warn' },
  'refused-by-remote': { text: 'refused by remote', tone: 'warn' },
  transport: { text: 'fetch failed', tone: 'error' },
  timeout: { text: 'timed out', tone: 'error' },
};

/**
 * The `position` branch of the ladder, or `undefined` when there is nothing
 * to say and the caller should fall through to `last_fetch`.
 *
 * A `Record<Position['kind'], Label>` — the shape `ACTION_ERROR` uses above
 * — does not fit here: three of the four variants are a constant label, but
 * `tracking`'s carries `ahead`/`behind`, which a `Record`'s value type
 * cannot see. A `switch` with a `never`-typed default preserves the same
 * guarantee a `Record` would (a fifth `Position` variant fails to compile,
 * it does not fall through silently) without forcing a shape the data
 * doesn't have.
 */
function positionLabel(p: Position): Label | undefined {
  switch (p.kind) {
    case 'detached':
      return { text: 'detached', tone: 'warn' };
    case 'no-upstream':
      return { text: 'no upstream', tone: 'muted' };
    case 'upstream-gone':
      return { text: 'upstream gone', tone: 'warn' };
    case 'tracking':
      // Both directions, always — never one figure standing in for the
      // other. The founding bug this design is against: a repo holding
      // unpushed commits and nothing incoming used to report "current,"
      // because only one fact survived the old verdict ladder. `ahead`
      // alone is exactly that case, and it now reads as `↑N ↓0`.
      return p.ahead || p.behind ? { text: `↑${p.ahead} ↓${p.behind}`, tone: 'warn' } : undefined;
    default: {
      const exhaustive: never = p;
      return exhaustive;
    }
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * The last-fetch reading at the bottom of the ladder. Moved here from
 * `module-list.tsx`'s old `newestCommitLabel` — that function's no-`Intl`,
 * same-calendar-day-or-not approach is unchanged; only the caller and the
 * field it reads (`last_fetch` rather than `newest_commit`, which no longer
 * reaches the composition list at all — D5 puts it on the single-repo route
 * only) are new. No `Intl`: the relative/absolute boundary has to be exact
 * and testable without depending on a locale the test runner may not carry.
 */
function relative(iso: string | undefined, now: Date): string {
  if (!iso) return 'never fetched';
  const then = new Date(iso);
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  const time = `${pad2(then.getHours())}:${pad2(then.getMinutes())}`;
  return sameDay
    ? `fetched ${time} today`
    : `fetched ${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
