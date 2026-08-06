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
  // `?? FALLBACK`, not a bare index — `ACTION_ERROR` is a `Record` typed over
  // THIS client's closed `ActionErrorKind`, but the wire's `kind` is a bare
  // `&'static str` on the engine side (`types.ts`'s own doc on
  // `ActionErrorKind`), so a sixth kind is representable on the wire before
  // it is representable here. The `Record` type still buys real value — a
  // kind ADDED TO THIS FILE'S OWN UNION without a label is a compile error —
  // but it cannot see a kind the ENGINE adds that this file doesn't know
  // about yet, and that is exactly where new kinds come from. Without the
  // fallback, an unrecognised kind indexes past the table and this function
  // returns `undefined` at runtime despite its `Label` return type, and the
  // row silently loses its label.
  if (s.action_error) return ACTION_ERROR[s.action_error.kind] ?? { text: 'action failed', tone: 'error' };
  if (s.dirty_files > 0) return { text: `${s.dirty_files} changed`, tone: 'warn' };

  const positional = positionLabel(s.position);
  if (positional) return positional;

  return { text: relative(s.last_fetch, now), tone: 'muted' };
}

/**
 * What `kind` a failed action reports, in words. `Record<ActionErrorKind,
 * Label>` on purpose — the same idiom `module-list.tsx`'s retired
 * `SKIP_LABELS` carried for the old sync report: a sixth kind added to
 * THIS FILE's own `ActionErrorKind` union without a label here is a compile
 * error. That guard is compile-time only, though, and only covers a variant
 * added to this client's type — it says nothing about one the ENGINE adds,
 * since `ActionError.kind` is a bare `&'static str` on the wire (`types.ts`'s
 * own doc), representable there before it is representable here. `rowLabel`
 * reads this table with `?? { text: 'action failed', tone: 'error' }` for
 * exactly that case — a runtime fallback, since TypeScript cannot see a value
 * that hasn't shipped yet.
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
 * COMPILE-TIME guarantee a `Record` would — a fifth variant added to THIS
 * FILE's own `Position` union fails to compile. It is still only a
 * compile-time guard, though: `Position` is a client-side type description
 * of a wire shape the engine controls, so a fifth variant the ENGINE starts
 * sending is not caught by anything above — TypeScript has no visibility
 * into a value this file's own types don't yet describe. The default branch
 * below returns `undefined` rather than the raw wire object for that case,
 * so an unrecognised `Position` falls through to the ladder's last-fetch
 * reading instead of a caller rendering that object as if it were a `Label`.
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
      // The binding still does its compile-time job (see the doc comment
      // above) — but `return exhaustive` would return the raw wire object,
      // untyped-as-Label, for a `Position` kind this client doesn't
      // recognise. `undefined` is the neutral degrade: the ladder in
      // `rowLabel` falls through to the last-fetch reading instead.
      const exhaustive: never = p;
      void exhaustive;
      return undefined;
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
 *
 * Exported (Task 11) so `repo-state-card.ts`'s `sublabel` can reuse the
 * same-day/absolute formatting rather than re-deriving it. Its `iso`-absent
 * wording used to read "never fetched" here and "No fetch recorded" on the
 * state card, on the theory that the row's compact register earned a
 * shorter, more definite phrase. That theory did not survive contact with
 * the engine: `last_fetch` is `null` for BOTH a repo that has genuinely
 * never been fetched AND one whose last fetch FAILED (git truncates
 * `FETCH_HEAD` to zero bytes on failure), so "never fetched" is a false
 * historical claim exactly whenever the second case is true — a repo
 * fetched successfully yesterday, then hit by a failed sweep, reads as if
 * it had never been touched, in `muted` (this ladder's own signal for
 * nothing-to-act-on). The row now says the same true thing the card does,
 * just cased for its context: lowercase to match every other row label
 * (`detached`, `no upstream`), where the card's is a full sentence. The
 * absent-`iso` case still stays a one-line guard in each caller rather than
 * a shared constant, because that's genuinely the only difference left.
 */
export function relative(iso: string | undefined, now: Date): string {
  if (!iso) return 'no fetch recorded';
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
