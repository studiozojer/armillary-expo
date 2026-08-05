import type { MarkedStyles } from 'react-native-marked';
import { useColorScheme } from 'react-native';

import { families } from './fonts.gen';
import { useThemeMode } from './theme-context';
import { DAOUI_SOURCE_COMMIT, ROLE_COUNT, darkColors, lightColors, type ColorRole } from './tokens.gen';

export { DAOUI_SOURCE_COMMIT, ROLE_COUNT, type ColorRole };

// Re-exported so `@/theme` stays the single styling entry point. The import
// back into this module from `nav-theme` is type-only, so there is no runtime
// cycle here.
export { navThemeFor } from './nav-theme';

/**
 * Layout scales.
 *
 * Not from daoUI: it publishes colour primitives and semantics only, with no
 * layout layer — `DesignTokens.swift` holds spacing, radius and border in Swift
 * where no non-Swift consumer can read them. Declared here and named as this
 * app's own, which is at least true. Extracting a neutral layout layer is a
 * daoUI change, tracked in the daoUI design session.
 */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const border = {
  hairline: 0.5,
  thin: 1,
  medium: 1.5,
} as const;

/**
 * The type ramp.
 *
 * daoUI's Font+Kairos.swift publishes three families across an xs-xl ramp
 * (12/16/20/24/32). The variants below bind a size to a family, so the two
 * registers are carried by the variant rather than chosen at each call site:
 * reading surfaces lead with Whyte, instrument surfaces with Fraktion.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontFamily: families.whyteInk.display },
  title: { fontSize: 24, lineHeight: 30, fontFamily: families.whyte.display },
  heading: { fontSize: 20, lineHeight: 26, fontFamily: families.whyte.book },
  body: { fontSize: 16, lineHeight: 24, fontFamily: families.whyte.book },
  label: { fontSize: 14, lineHeight: 20, fontFamily: families.whyte.book },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: families.whyte.book },
  // The subheader register — the secondary line under a title. Whyte, not
  // Fraktion: David moved the subheaders across in Figma on 2026-08-03 and made
  // Figma canonical for type, so the reading register now reaches one step below
  // the title. Named for the Figma style it mirrors (`whyte/xs` in `☯︎ daoUI`:
  // ABC Whyte Edu / Book, 13, line-height 16, no tracking) rather than for its
  // role, deliberately — the correspondence should be checkable, not remembered.
  //
  // First consumer (Task 11): `repo-state-card.tsx`'s reason line, which
  // Figma's `State Card` component (`bbjHiHEBoR3xWWruoprPkH`, node 345:448)
  // sets at 13px — the same size this variant was declared at on 2026-08-03,
  // before anything rendered it. Declared then to keep this ramp identical to
  // daoUI's copy (David's call, same day) so the two do not silently fork —
  // the copies are the problem, and gap 1 is what actually fixes it. The risk
  // that motivated writing this down (an unrendered token is the `tx/button`
  // shape, correct and invisible, and the bench exists because that shape hid
  // a 1.65:1 button for weeks) is why it is worth noting, now that it no
  // longer applies to this token, that it was never actually checked against
  // a render in the meantime.
  whyteXs: { fontSize: 13, lineHeight: 16, fontFamily: families.whyte.book },
  mono: { fontSize: 13, lineHeight: 20, fontFamily: families.fraktion.book },
  // Section headers in the instrument register: NEW INSTANCE, INSTANCES.
  monoLabel: { fontSize: 12, lineHeight: 16, fontFamily: families.fraktion.book, letterSpacing: 1.2 },
} as const;

export type TextVariant = keyof typeof type;

export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type BorderWidth = keyof typeof border;

export type Theme = {
  scheme: 'light' | 'dark';
  color: Record<ColorRole, string>;
  space: typeof space;
  radius: typeof radius;
  border: typeof border;
  type: typeof type;
};

export function themeFor(scheme: 'light' | 'dark'): Theme {
  return {
    scheme,
    color: scheme === 'dark' ? darkColors : lightColors,
    space,
    radius,
    border,
    type,
  };
}

/**
 * The app's single styling entry point. Every component reads colours from
 * here; a literal hex anywhere else is a bug, because it cannot follow daoUI
 * when daoUI moves — and __tests__/no-hex-literals.test.ts enforces it.
 *
 * Reads the app-owned mode when a provider is present so the override applies,
 * and falls back to the raw system scheme otherwise (a test, or a component
 * rendered outside the tree). Both hooks run unconditionally, per the rules of
 * hooks.
 */
export function useTheme(): Theme {
  const themed = useThemeMode();
  const system = useColorScheme();
  return themeFor(themed?.scheme ?? (system === 'dark' ? 'dark' : 'light'));
}

/** react-native-marked's theme shape, fed from the same tokens. */
export function markedThemeFor(theme: Theme) {
  return {
    colors: {
      background: 'transparent',
      code: theme.color.bgSecondary,
      link: theme.color.txAccent,
      text: theme.color.txPrimary,
      border: theme.color.bdPrimary,
    },
    spacing: {
      xs: space.xs,
      s: space.sm,
      m: space.md,
      l: space.lg,
    },
  };
}

/**
 * react-native-marked's per-element styles, mapped onto the type ramp.
 *
 * `markedThemeFor` above supplies colours and spacing and nothing else, so
 * every rendered `.md` — the largest reading surface in the app, and the entire
 * point of Explorer — was set in the system font while twelve studio faces sat
 * loaded and unused. This is the other half.
 *
 * The library flattens `[itsOwnDefaults, userStyles]` per element, so what is
 * written here wins and anything omitted keeps the library's default. Two of
 * those defaults have to be overridden rather than merely added to:
 *
 * - Headings carry `fontWeight: '500' | 'bold'`. Against a named PostScript
 *   face that makes iOS synthesise a bold instead of picking a sibling cut,
 *   which does not exist here — so every heading declares `normal` and lets the
 *   family carry the weight. (`strong` is the deliberate exception: Whyte ships
 *   no bold cut, so a synthesised one is the only bold available.)
 * - `codespan` carries `fontStyle: 'italic'` and `fontWeight: '300'`, which is
 *   the library's idea of code, not ours.
 *
 * `paragraph`, `blockquote`, `code`, `list` and `hr` are ViewStyles — containers
 * — so they carry no family; the text inside a paragraph is styled by `text`
 * and the text inside a list item by `li`.
 *
 * KNOWN GAP, and it is the library's: a FENCED code block's text is styled from
 * the `em` key (`Parser.js` passes `styles.em` as the block's textStyle), which
 * is also prose italics. Fraktion cannot reach fenced blocks through `styles`
 * without turning every italic in the document mono, so `em` stays Whyte and
 * fenced blocks render in it. Inline code (`codespan`) does get Fraktion. The
 * real fix is a `Renderer` subclass overriding `code()`, which is a change to
 * MarkdownView's shape rather than to its styling, and is left for whoever
 * decides the reading surface wants one.
 */
export function markedStylesFor(theme: Theme): MarkedStyles {
  const heading = { fontWeight: 'normal' } as const;

  return {
    // The document's own title, in the inktrap display cut — the one place in
    // the app the display face earns its inktraps at size.
    h1: { ...type.display, ...heading, color: theme.color.txPrimary },
    h2: { ...type.title, ...heading, color: theme.color.txPrimary },
    h3: { ...type.heading, ...heading, color: theme.color.txPrimary },
    // Below h3 the ramp has no larger-than-body sizes left, so the display cut
    // rather than the size is what separates these from the paragraphs around
    // them.
    h4: { ...type.body, ...heading, fontFamily: families.whyte.display, color: theme.color.txPrimary },
    h5: { ...type.label, ...heading, fontFamily: families.whyte.display, color: theme.color.txPrimary },
    h6: { ...type.caption, ...heading, fontFamily: families.whyte.display, color: theme.color.txPrimary },

    // Body copy. tx/body rather than tx/primary: it is the role daoUI publishes
    // for running text, and this is the only running text in the app.
    text: { ...type.body, color: theme.color.txBody },
    li: { ...type.body, color: theme.color.txBody },
    // Whyte ships no bold cut, so this is the one place a synthesised weight is
    // the right answer rather than an accident.
    strong: { ...type.body, fontWeight: 'bold', color: theme.color.txPrimary },
    em: { ...type.body, fontStyle: 'italic', color: theme.color.txBody },
    link: { ...type.body, fontStyle: 'normal', color: theme.color.txAccent },

    // The instrument register, where it belongs. Both of the library's own
    // code affectations — italic, weight 300 — are overridden rather than
    // merged onto.
    codespan: {
      ...type.mono,
      fontStyle: 'normal',
      fontWeight: 'normal',
      color: theme.color.txPrimary,
      backgroundColor: theme.color.bgSecondary,
    },
    code: {
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: theme.color.bgSecondary,
      // The library sets this so a short line still fills the horizontal
      // ScrollView it wraps the block in; dropping it would leave the fill
      // ending mid-line.
      minWidth: '100%',
    },

    // Containers. A quote reads as one because of the rule beside it, not
    // because the type changed.
    blockquote: {
      borderLeftWidth: space.xxs,
      borderLeftColor: theme.color.bdCard,
      paddingLeft: space.lg,
    },
    paragraph: { paddingVertical: space.sm },
    hr: { borderBottomWidth: border.hairline, borderBottomColor: theme.color.bdCard },
  };
}
