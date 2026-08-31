import { hostByName, readDeepLink } from '../src/lib/push-deep-link';

describe('reading a push deep link', () => {
  it('takes host and path out of notification data', () => {
    expect(readDeepLink({ host: 'stjerneborg', path: 'operators/augur/field/2026-08-30.md' })).toEqual(
      { host: 'stjerneborg', path: 'operators/augur/field/2026-08-30.md' },
    );
  });

  /**
   * Every push that predates `data_template` carries no data at all, and the
   * doorbell test ring carries none either. Those must foreground the app and
   * do nothing else — not navigate somewhere arbitrary.
   */
  it('returns null when there is nothing to open', () => {
    expect(readDeepLink(undefined)).toBeNull();
    expect(readDeepLink(null)).toBeNull();
    expect(readDeepLink({})).toBeNull();
    expect(readDeepLink({ host: 'stjerneborg' })).toBeNull();
    expect(readDeepLink('a string')).toBeNull();
  });

  it('tolerates a path with no host', () => {
    expect(readDeepLink({ path: 'a/b.md' })).toEqual({ host: undefined, path: 'a/b.md' });
  });
});

describe('resolving the host a bell named', () => {
  it('matches a known machine by name', () => {
    expect(hostByName('stjerneborg')?.id).toBe('stjerneborg');
  });

  /**
   * The load-bearing one. A bell naming a machine this build has never heard
   * of must resolve to NOTHING, so the handler leaves the current host alone.
   * Falling back to the first known host would open the path against an
   * arbitrary machine — a file that exists on one and not another then renders
   * as a 404 that looks like the report failed to write.
   */
  it('does not fall back to some other machine', () => {
    expect(hostByName('a-machine-that-does-not-exist')).toBeUndefined();
    expect(hostByName(undefined)).toBeUndefined();
    expect(hostByName('')).toBeUndefined();
  });
});
