import { useColorScheme } from 'react-native';

import { families } from './fonts.gen';
import { useThemeMode } from './theme-context';
import { DAOUI_SOURCE_COMMIT, ROLE_COUNT, darkColors, lightColors, type ColorRole } from './tokens.gen';

export { DAOUI_SOURCE_COMMIT, ROLE_COUNT, type ColorRole };

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
  mono: { fontSize: 13, lineHeight: 20, fontFamily: families.fraktion.book },
  // Section headers in the instrument register: NEW INSTANCE, INSTANCES.
  monoLabel: { fontSize: 12, lineHeight: 16, fontFamily: families.fraktion.book, letterSpacing: 1.2 },
} as const;

export type TextVariant = keyof typeof type;

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
