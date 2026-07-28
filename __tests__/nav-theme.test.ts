import { readFileSync } from 'fs';
import { join } from 'path';

import { DarkTheme, DefaultTheme } from 'expo-router';

import { navThemeFor, themeFor } from '../src/theme';

describe('navThemeFor', () => {
  it.each(['light', 'dark'] as const)('takes every colour from a token role in %s', (scheme) => {
    // The defect: the root shipped react-navigation's stock themes unmodified,
    // so a pure-white header in the system font sat above warm cream content.
    // Assert against the theme's own roles rather than literals — a hex here
    // would also be the one place src/ is allowed none.
    const theme = themeFor(scheme);
    const nav = navThemeFor(theme);

    expect(nav.colors).toEqual({
      background: theme.color.bgSolidBase,
      card: theme.color.bgSolidCard,
      text: theme.color.txPrimary,
      border: theme.color.bdCard,
      primary: theme.color.txAccent,
      notification: theme.color.txError,
    });
    expect(nav.dark).toBe(scheme === 'dark');
  });

  it('leaves nothing on the stock react-navigation values', () => {
    // Every key that stock carries is one this app would otherwise be showing.
    const light = navThemeFor(themeFor('light'));
    const dark = navThemeFor(themeFor('dark'));

    for (const key of Object.keys(DefaultTheme.colors) as (keyof typeof DefaultTheme.colors)[]) {
      expect(light.colors[key]).not.toBe(DefaultTheme.colors[key]);
      expect(dark.colors[key]).not.toBe(DarkTheme.colors[key]);
    }
  });

  it('gives light and dark genuinely different chrome', () => {
    // Guards the resolver bug the token tests guard for content: a nav theme
    // that emits the light surfaces twice looks right in light mode and
    // invisible in dark, which is exactly where the white-header flash lived.
    const light = navThemeFor(themeFor('light'));
    const dark = navThemeFor(themeFor('dark'));

    expect(light.colors.card).not.toBe(dark.colors.card);
    expect(light.colors.background).not.toBe(dark.colors.background);
    expect(light.colors.text).not.toBe(dark.colors.text);
    expect(light.dark).toBe(false);
    expect(dark.dark).toBe(true);
  });

  it('sets the chrome in studio faces, never the system stack', () => {
    const nav = navThemeFor(themeFor('light'));
    for (const style of Object.values(nav.fonts)) {
      expect(style.fontFamily).toMatch(/^(ABCWhyte|PPFraktionMono)/);
      // A named PostScript face plus a numeric weight makes iOS synthesise a
      // bold instead of picking a sibling cut that does not exist here.
      expect(style.fontWeight).toBe('normal');
    }
    // The header title is fonts.heavy on iOS, the large title fonts.bold —
    // both take the display cut, not the book one.
    expect(nav.fonts.heavy.fontFamily).toBe(nav.fonts.bold.fontFamily);
    expect(nav.fonts.heavy.fontFamily).not.toBe(nav.fonts.regular.fontFamily);
  });

  it('starts from the stock theme, so an unknown future key still has a value', () => {
    // Built by spreading DefaultTheme/DarkTheme rather than as a literal: a key
    // react-navigation adds in a later version should arrive stock, not
    // undefined.
    const nav = navThemeFor(themeFor('light'));
    for (const key of Object.keys(DefaultTheme)) {
      expect(nav).toHaveProperty(key);
    }
  });
});

describe('the root layout wires it', () => {
  // A pure navThemeFor() is a token pair; it says nothing about whether the
  // root ever hands it to a ThemeProvider, which is the fifth time this branch
  // has had that gap. Rendering the real _layout under jest means standing up
  // expo-font, expo-splash-screen and a router context for a two-line
  // assertion, so this reads the source instead — the same mechanical-rather-
  // than-habitual move __tests__/no-hex-literals.test.ts makes.
  const source = readFileSync(join(__dirname, '..', 'src', 'app', '_layout.tsx'), 'utf8');

  it('no longer builds the chrome from react-navigation stock themes', () => {
    expect(source).not.toMatch(/\bDefaultTheme\b/);
    expect(source).not.toMatch(/\bDarkTheme\b/);
    expect(source).toMatch(/navThemeFor\(/);
  });

  it('puts the navigation theme INSIDE ThemeModeProvider, not above it', () => {
    // Above it, ThemeProvider read the raw useColorScheme() rather than the
    // app's resolved mode. That agrees with the content today only because
    // Appearance.setColorScheme is process-wide; a mode held in context alone
    // would silently desync the chrome from the screen it frames.
    const provider = source.indexOf('<ThemeModeProvider>');
    const chrome = source.indexOf('<NavigationChrome>');
    expect(provider).toBeGreaterThanOrEqual(0);
    expect(chrome).toBeGreaterThan(provider);
  });
});
