import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import {
  appearanceOverride,
  normalizeScheme,
  parseMode,
  resolveScheme,
  THEME_MODE_KEY,
  type Scheme,
  type ThemeMode,
} from './theme-mode';

type ThemeModeValue = { mode: ThemeMode; scheme: Scheme; setMode: (mode: ThemeMode) => void };

const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const system = normalizeScheme(useColorScheme());
  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_MODE_KEY).then((raw) => {
      const stored = parseMode(raw);
      setModeState(stored);
      Appearance.setColorScheme(appearanceOverride(stored));
    });
  }, []);

  const value = useMemo<ThemeModeValue>(
    () => ({
      mode,
      scheme: resolveScheme(mode, system),
      setMode: (next) => {
        setModeState(next);
        void AsyncStorage.setItem(THEME_MODE_KEY, next);
        Appearance.setColorScheme(appearanceOverride(next));
      },
    }),
    [mode, system],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

/** Null outside the provider — a component in a test, or rendered standalone. */
export function useThemeMode(): ThemeModeValue | null {
  return useContext(ThemeModeContext);
}
