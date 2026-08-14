import { relativeTime } from '../src/lib/relative-time';

/**
 * `now` is a parameter rather than a read of the system clock, so these assert
 * on arithmetic instead of on timing. The alternative — faking the clock —
 * would make the tests pass for a reason the production call site does not
 * share.
 */
const NOW = new Date('2026-08-13T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('says "just now" under a minute', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(59 * SECOND), NOW)).toBe('just now');
  });

  it('counts whole minutes up to an hour', () => {
    expect(relativeTime(ago(MINUTE), NOW)).toBe('1m ago');
    expect(relativeTime(ago(12 * MINUTE), NOW)).toBe('12m ago');
    expect(relativeTime(ago(59 * MINUTE), NOW)).toBe('59m ago');
  });

  it('counts whole hours up to a day', () => {
    expect(relativeTime(ago(HOUR), NOW)).toBe('1h ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe('23h ago');
  });

  it('counts whole days beyond that, with no upper bound', () => {
    expect(relativeTime(ago(DAY), NOW)).toBe('1d ago');
    expect(relativeTime(ago(2 * DAY), NOW)).toBe('2d ago');
    expect(relativeTime(ago(400 * DAY), NOW)).toBe('400d ago');
  });

  it('truncates rather than rounds, so a label never claims time that has not passed', () => {
    expect(relativeTime(ago(119 * SECOND), NOW)).toBe('1m ago');
    expect(relativeTime(ago(HOUR + 59 * MINUTE), NOW)).toBe('1h ago');
  });

  // The engine runs on a different machine than the phone, so its clock is not
  // ours. A few seconds of skew must not render as "-1m ago" or as a wrong day.
  it('reads a future timestamp as "just now" rather than a negative age', () => {
    expect(relativeTime(new Date(NOW.getTime() + 30 * SECOND).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW.getTime() + 5 * DAY).toISOString(), NOW)).toBe('just now');
  });

  // `live.ts` casts the wire JSON without validating it, so `startedAt` is a
  // compile-time claim only. `session-live.test.ts` already carries an instance
  // whose `startedAt` is the literal string 't'.
  it('returns undefined for a timestamp it cannot parse, rather than "Invalid Date"', () => {
    expect(relativeTime('t', NOW)).toBeUndefined();
    expect(relativeTime('', NOW)).toBeUndefined();
    expect(relativeTime('not a date', NOW)).toBeUndefined();
  });

  it('accepts a millisecond `now` as well as a Date', () => {
    expect(relativeTime(ago(3 * HOUR), NOW.getTime())).toBe('3h ago');
  });
});
