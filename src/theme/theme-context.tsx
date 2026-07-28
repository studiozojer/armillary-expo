import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const touched = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(THEME_MODE_KEY).then((raw) => {
      // A user toggle can land before this read resolves. Applying the stored
      // value then would stomp their choice back to the persisted one, and it
      // would read as the toggle silently failing. The hydrate only wins if
      // nothing has set the mode yet.
      if (touched.current) return;
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
        touched.current = true;
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
