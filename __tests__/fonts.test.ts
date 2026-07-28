import { FONT_SOURCE_COMMIT, families, fontMap } from '../src/theme/fonts.gen';

describe('studio fonts', () => {
  it('carries a real daoUI source commit', () => {
    expect(FONT_SOURCE_COMMIT).toMatch(/^[0-9a-f]{7,40}$/);
    expect(FONT_SOURCE_COMMIT).not.toBe('unknown');
  });

  it('registers every family the type ramp names', () => {
    // A missing family does not throw — the text just silently renders in
    // system, which looks like a design choice rather than a broken asset.
    for (const family of [families.whyte, families.whyteInk, families.fraktion]) {
      expect(fontMap).toHaveProperty(family.book);
      expect(fontMap).toHaveProperty(family.display);
    }
  });

  it('ships all twelve faces daoUI publishes', () => {
    expect(Object.keys(fontMap)).toHaveLength(12);
  });
});
