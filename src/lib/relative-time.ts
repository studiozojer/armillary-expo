const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago `iso` was, as a glanceable label: `just now`, `12m ago`,
 * `3h ago`, `2d ago`.
 *
 * `now` is a parameter, not a read of the system clock, so this is a pure
 * function and its tests assert on arithmetic rather than on timing.
 *
 * **Returns `undefined` rather than a string when `iso` cannot be parsed.**
 * `live.ts` casts the wire JSON without validating it, so `Instance.startedAt`
 * is a compile-time claim only — an engine that omits or malforms it would
 * otherwise put the literal text `Invalid Date` on a row. The caller's job is
 * to render nothing in that case, not to render an apology.
 *
 * Ages are **truncated**, never rounded: 119 seconds is `1m ago`, so a label
 * never claims more time has passed than actually has.
 *
 * A timestamp in the future reads as `just now`. The engine's clock is not the
 * phone's, and a few seconds of skew must not surface as a negative age.
 */
export function relativeTime(iso: string, now: Date | number): string | undefined {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;

  const elapsed = (now instanceof Date ? now.getTime() : now) - then;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
