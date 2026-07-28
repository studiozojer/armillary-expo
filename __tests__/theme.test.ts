import { DAOUI_SOURCE_COMMIT, themeFor } from '../src/theme';
import { darkColors, lightColors } from '../src/theme/tokens.gen';

describe('theme tokens', () => {
  it('carries a real daoUI source commit, not a placeholder', () => {
    // The whole point of generating instead of hand-copying. zhouyi's
    // colors.gen.ts claims a provenance it does not have; this assertion is
    // what stops the same drift here.
    expect(DAOUI_SOURCE_COMMIT).toMatch(/^[0-9a-f]{7,40}$/);
    expect(DAOUI_SOURCE_COMMIT).not.toBe('unknown');
  });

  it('resolves every role in both schemes', () => {
    // A role missing in one scheme fails at render time, in one screen, in one
    // colour mode — the worst possible way to find it.
    const roles = Object.keys(lightColors);
    expect(roles.length).toBeGreaterThan(0);

    for (const role of roles) {
      expect(lightColors[role as keyof typeof lightColors]).toMatch(/^#[0-9a-f]{8}$/);
      expect(darkColors[role as keyof typeof darkColors]).toMatch(/^#[0-9a-f]{8}$/);
    }
    expect(Object.keys(darkColors).sort()).toEqual(roles.sort());
  });

  it('gives light and dark genuinely different text colours', () => {
    // Guards against a resolver bug that silently emits the light value twice —
    // which would look fine in light mode and be invisible in dark.
    expect(themeFor('light').color.txPrimary).not.toBe(themeFor('dark').color.txPrimary);
  });

  it('exposes layout scales', () => {
    const theme = themeFor('light');
    expect(theme.space.md).toBeGreaterThan(0);
    expect(theme.radius.md).toBeGreaterThan(0);
    expect(theme.type.body.fontSize).toBeGreaterThan(0);
  });

  it('keys multi-segment roles without collision', () => {
    // `key()` used to destructure only the first two segments, so bg/solid/base
    // and bg/solid/card both keyed to `bgSolid` and the last one silently won.
    // Nothing caught it because no multi-segment role was in the list until now.
    expect(lightColors).toHaveProperty('bgSolidBase');
    expect(lightColors).toHaveProperty('bgSolidCard');
    expect(lightColors).toHaveProperty('bgSolidButton');
    expect(lightColors).not.toHaveProperty('bgSolid');

    expect(lightColors.bgSolidBase).not.toBe(lightColors.bgSolidCard);
    expect(darkColors.bgSolidBase).not.toBe(darkColors.bgSolidCard);
  });

  it('carries opaque surfaces, not just elevation overlays', () => {
    // The finding this whole pass rests on: the app was reading bg/primary,
    // an 8%-alpha wash, as though it were a page background. A surface role
    // must be fully opaque or it composites over whatever happens to be behind.
    for (const role of ['bgSolidBase', 'bgSolidCard', 'bgSolidCardHover'] as const) {
      expect(lightColors[role]).toMatch(/ff$/);
      expect(darkColors[role]).toMatch(/ff$/);
    }
  });

  it('gives every interaction state a value distinct from its resting surface', () => {
    // A hover token equal to its base is indistinguishable from a missing one.
    for (const scheme of [lightColors, darkColors]) {
      expect(scheme.bgSolidCardHover).not.toBe(scheme.bgSolidCard);
      expect(scheme.bgSolidCardPressed).not.toBe(scheme.bgSolidCard);
      expect(scheme.bgSolidCardPressed).not.toBe(scheme.bgSolidCardHover);
      expect(scheme.bgSolidButtonHover).not.toBe(scheme.bgSolidButton);
      expect(scheme.bgSolidButtonPressed).not.toBe(scheme.bgSolidButton);
    }
  });
});
