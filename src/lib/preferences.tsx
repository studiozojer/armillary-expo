import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { TreeEntry } from '@/lib/daemon/types';

const KEY = 'armillary.showDotfiles';

/**
 * Client-side only, and deliberately so: the engine keeps listing everything.
 * Filtering at the source would make two clients disagree about what the
 * workspace contains, and "representative of the filesystem" is the property
 * this whole screen exists to have.
 */
export function visibleEntries(entries: TreeEntry[], showDotfiles: boolean): TreeEntry[] {
  return showDotfiles ? [...entries] : entries.filter((e) => !e.name.startsWith('.'));
}

export async function loadShowDotfiles(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    // Defaults to shown. A browser that hides things out of the box is back to
    // being a projection, which is the thing being removed.
    return stored === null ? true : stored === 'true';
  } catch {
    // Matches hosts.ts's posture: a storage failure falls back to the default
    // rather than surfacing as a broken screen.
    return true;
  }
}

export async function saveShowDotfiles(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, String(value));
}

type PreferencesContextValue = {
  showDotfiles: boolean;
  setShowDotfiles: (value: boolean) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Hoisted to a provider for the same reason `HostProvider` is: per-component
 * `useState` here left Explorer with its own private copy of the preference,
 * so flipping the toggle in Settings (a modal stacked on top, not a replacement
 * of Explorer) never touched the screen underneath. A shared store is the only
 * way a toggle in one mounted screen is visible to another already-mounted one.
 */
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showDotfiles, setState] = useState(true);

  useEffect(() => {
    void loadShowDotfiles().then(setState);
  }, []);

  const setShowDotfiles = useCallback((value: boolean) => {
    setState(value);
    void saveShowDotfiles(value);
  }, []);

  const value = useMemo(() => ({ showDotfiles, setShowDotfiles }), [showDotfiles, setShowDotfiles]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useShowDotfiles(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useShowDotfiles must be used inside PreferencesProvider');
  return value;
}
