import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';

import { families } from './fonts.gen';
import type { Theme } from './index';

/**
 * The navigation chrome, derived from the same tokens as the content.
 *
 * The root laid out `<ThemeProvider value={colorScheme === 'dark' ? DarkTheme :
 * DefaultTheme}>` — react-navigation's stock themes, unmodified: `card:
 * rgb(255,255,255)`, `background: rgb(242,242,242)`, `text: rgb(28,28,30)`, and
 * the system font stack. Both tab groups show a header on every screen and
 * Settings is a modal presented from that theme, so the first thing in any
 * screenshot of this app was a pure-white header in system font sitting above
 * warm cream content.
 *
 * Built by overriding `DefaultTheme`/`DarkTheme` rather than by constructing a
 * `Theme` literal: react-navigation adds keys across versions, and a literal
 * would leave any key we do not know about undefined rather than merely stock.
 *
 * Fonts: `medium` and `regular` take Whyte Book; `bold` and `heavy` take the
 * display cut, which is what native-stack reaches for on iOS
 * (`useHeaderConfigProps` selects `fonts.heavy` for the title and `fonts.bold`
 * for the large title). Every weight is declared `normal` because the family is
 * already the weight — asking iOS for `600` on a named PostScript face makes it
 * synthesise a bold rather than pick a sibling cut that does not exist here.
 */
export function navThemeFor(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const whyte = { book: families.whyte.book, display: families.whyte.display };

  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      // The scene background, which is what a screen that sets none of its own
      // shows through — the same role Screen paints.
      background: theme.color.bgSolidBase,
      // Headers, tab bars and modal cards.
      card: theme.color.bgSolidCard,
      text: theme.color.txPrimary,
      border: theme.color.bdCard,
      // The tint on header buttons and back chevrons.
      primary: theme.color.txAccent,
      notification: theme.color.txError,
    },
    fonts: {
      regular: { fontFamily: whyte.book, fontWeight: 'normal' },
      medium: { fontFamily: whyte.book, fontWeight: 'normal' },
      bold: { fontFamily: whyte.display, fontWeight: 'normal' },
      heavy: { fontFamily: whyte.display, fontWeight: 'normal' },
    },
  };
}
