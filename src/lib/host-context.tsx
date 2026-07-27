import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { KNOWN_HOSTS, loadSelectedHost, saveSelectedHost, type Host } from './hosts';

type HostContextValue = {
  host: Host;
  hosts: Host[];
  setHost: (host: Host) => void;
  /** Bumped on every change, so screens can re-fetch without watching the URL. */
  generation: number;
  ready: boolean;
};

const HostContext = createContext<HostContextValue | null>(null);

export function HostProvider({ children }: { children: React.ReactNode }) {
  const [host, setHostState] = useState<Host>(KNOWN_HOSTS[0]);
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSelectedHost().then((stored) => {
      setHostState(stored);
      setReady(true);
    });
  }, []);

  const setHost = useCallback((next: Host) => {
    setHostState(next);
    setGeneration((g) => g + 1);
    void saveSelectedHost(next);
  }, []);

  const value = useMemo(
    () => ({ host, hosts: KNOWN_HOSTS, setHost, generation, ready }),
    [host, setHost, generation, ready],
  );

  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

export function useHost(): HostContextValue {
  const value = useContext(HostContext);
  if (!value) throw new Error('useHost must be used inside HostProvider');
  return value;
}
