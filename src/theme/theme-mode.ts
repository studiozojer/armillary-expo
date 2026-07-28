// The app-owned theme mode and its pure resolvers. Deliberately free of React
// and of react-native, so the branching is unit-testable in isolation.
//
// Ported from zhouyi's src/theme/themeMode.ts, which has carried this shape in
// production since 2026-07.

export type Scheme = 'light' | 'dark';
export type ThemeMode = 'auto' | 'light' | 'dark';

/** AsyncStorage key under which the chosen mode persists. */
export const THEME_MODE_KEY = 'theme_mode';

/** A persisted string (or null) -> a valid mode. Anything unknown -> "auto". */
export function parseMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

/** The resolved scheme: forced modes win; "auto" follows the system. */
export function resolveScheme(mode: ThemeMode, system: Scheme): Scheme {
  return mode === 'auto' ? system : mode;
}

/** RN's value includes null and "unspecified"; anything not "dark" is light. */
export function normalizeScheme(raw: string | null | undefined): Scheme {
  return raw === 'dark' ? 'dark' : 'light';
}

/** The app-wide Appearance override. "auto" -> "unspecified", restoring the system. */
export function appearanceOverride(mode: ThemeMode): 'light' | 'dark' | 'unspecified' {
  return mode === 'auto' ? 'unspecified' : mode;
}
