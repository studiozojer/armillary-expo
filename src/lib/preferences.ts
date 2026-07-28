import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

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

export function useShowDotfiles() {
  const [showDotfiles, setState] = useState(true);

  useEffect(() => {
    void loadShowDotfiles().then(setState);
  }, []);

  const setShowDotfiles = useCallback((value: boolean) => {
    setState(value);
    void saveShowDotfiles(value);
  }, []);

  return { showDotfiles, setShowDotfiles };
}
