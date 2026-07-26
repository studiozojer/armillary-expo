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
});
