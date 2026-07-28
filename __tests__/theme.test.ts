import { DAOUI_SOURCE_COMMIT, ROLE_COUNT, markedStylesFor, themeFor } from '../src/theme';
import { families } from '../src/theme/fonts.gen';
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

  it('produces a key for every role without collision', () => {
    // The key format is deliberately lossy: 'bg/solid/card-secondary' and
    // 'bg/solid-card/secondary' would both produce 'bgSolidCardSecondary'.
    // We cannot make collisions impossible by construction, so we make them
    // loud at generation time. This test verifies that no collision happened
    // by checking that the number of keys equals the number of roles generated.
    expect(Object.keys(lightColors)).toHaveLength(ROLE_COUNT);
    expect(Object.keys(darkColors)).toHaveLength(ROLE_COUNT);
  });

  it('gives every text variant a studio family, never a system fallback', () => {
    // The failure this guards is silent: an unnamed family renders in system
    // and looks like a deliberately plain choice.
    const { type } = themeFor('light');
    const studio = /^(ABCWhyte|PPFraktionMono)/;

    for (const [name, style] of Object.entries(type)) {
      expect(style.fontFamily).toMatch(studio);
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      expect(name).not.toBe('');
    }
  });

  it('splits the two registers by family', () => {
    // Reading surfaces lead with Whyte, instrument surfaces with Fraktion.
    const { type } = themeFor('dark');
    expect(type.body.fontFamily).toMatch(/^ABCWhyte/);
    expect(type.monoLabel.fontFamily).toMatch(/^PPFraktionMono/);
  });
});

describe('markedStylesFor', () => {
  const studio = /^(ABCWhyte|PPFraktionMono)/;

  it('sets every text element in a studio face', () => {
    // markedThemeFor supplies colours and spacing only, so every rendered .md —
    // the largest reading surface in the app — was set in the system font
    // while twelve studio faces sat loaded and unused.
    const styles = markedStylesFor(themeFor('light'));

    for (const key of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'text', 'li', 'strong', 'em', 'link', 'codespan'] as const) {
      expect(styles[key]?.fontFamily).toMatch(studio);
    }
  });

  it('keeps the two registers apart: prose in Whyte, code in Fraktion', () => {
    const styles = markedStylesFor(themeFor('light'));
    expect(styles.text?.fontFamily).toMatch(/^ABCWhyte/);
    expect(styles.h1?.fontFamily).toBe(families.whyteInk.display);
    expect(styles.codespan?.fontFamily).toMatch(/^PPFraktionMono/);
  });

  it('overrides the library defaults that fight a named PostScript face', () => {
    // Headings default to fontWeight '500'/'bold', which makes iOS synthesise a
    // bold rather than pick a sibling cut that does not exist here; codespan
    // defaults to italic at weight 300, which is the library's idea of code.
    // The library flattens [itsDefaults, userStyles], so an omitted key keeps
    // the default — these have to be written, not merely not-contradicted.
    const styles = markedStylesFor(themeFor('light'));

    for (const key of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      expect(styles[key]?.fontWeight).toBe('normal');
    }
    expect(styles.codespan?.fontStyle).toBe('normal');
    expect(styles.codespan?.fontWeight).toBe('normal');
    // The one place a synthesised weight is right: Whyte ships no bold cut.
    expect(styles.strong?.fontWeight).toBe('bold');
    // The library italicises links; a link is not an aside.
    expect(styles.link?.fontStyle).toBe('normal');
  });

  it('takes every colour from a role, and differs between schemes', () => {
    const light = themeFor('light');
    const dark = themeFor('dark');
    const lightStyles = markedStylesFor(light);
    const darkStyles = markedStylesFor(dark);

    expect(lightStyles.text?.color).toBe(light.color.txBody);
    expect(lightStyles.link?.color).toBe(light.color.txAccent);
    expect(lightStyles.code?.backgroundColor).toBe(light.color.bgSecondary);
    expect(lightStyles.blockquote?.borderLeftColor).toBe(light.color.bdCard);

    expect(darkStyles.text?.color).not.toBe(lightStyles.text?.color);
    expect(darkStyles.code?.backgroundColor).not.toBe(lightStyles.code?.backgroundColor);
  });
});
