import { useColorScheme } from 'react-native';

import { DAOUI_SOURCE_COMMIT, darkColors, lightColors, type ColorRole } from './tokens.gen';

export { DAOUI_SOURCE_COMMIT, type ColorRole };

/**
 * Layout scales.
 *
 * These are NOT from daoUI: its `tokens.json` publishes colour primitives and
 * semantics only, with no layout layer. zhouyi's `src/theme/tokens.ts` claims
 * layout values "verbatim from KairosDesign/DesignTokens.swift" — a package
 * daoUI superseded on 2026-07-09 — so copying it would inherit a stale source.
 * Defined here instead, and declared as this app's own, which is at least true.
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

export const type = {
  title: { fontSize: 22, fontWeight: '600' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 13, fontWeight: '400' },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
} as const;

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
 * when daoUI moves.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return themeFor(scheme === 'dark' ? 'dark' : 'light');
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
