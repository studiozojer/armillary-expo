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

/**
 * Hidden by default (David, on device, 2026-07-27).
 *
 * The original call was the opposite, and the reasoning was that a browser
 * hiding things out of the box is back to being a projection. Seeing the real
 * root on a phone falsified it: `.claude/`, `.obsidian/`, `.pi/`,
 * `.superpowers/` and `.DS_Store` are five of the twenty entries, and none of
 * them is workspace content. The honesty the screen owes is about what it
 * *claims*, not about showing everything at once — and the toggle is one tap
 * away, saying plainly how many entries it is hiding.
 */
const DEFAULT_SHOW_DOTFILES = false;

export async function loadShowDotfiles(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return stored === null ? DEFAULT_SHOW_DOTFILES : stored === 'true';
  } catch {
    // Matches hosts.ts's posture: a storage failure falls back to the default
    // rather than surfacing as a broken screen.
    return DEFAULT_SHOW_DOTFILES;
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
  // Seeded with the default rather than with `true`, so the first frame already
  // matches what the stored value will almost always say. Seeding optimistically
  // the other way made dotfiles flash in and then vanish on every cold launch.
  const [showDotfiles, setState] = useState(DEFAULT_SHOW_DOTFILES);

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
