import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useHost } from '../host-context';
import { invalidatesToken, type DeviceRefusal } from './refusal';
import { clearToken, loadToken, saveToken, secureStorageAvailable } from './token-store';

/**
 * What this device's credential is, on the host currently selected.
 *
 * Three states, and the difference between the last two is the whole reason
 * this is not a boolean. `'unenrolled'` means no token is held — the device
 * has never been given one for this host. `'rejected'` means a token IS held
 * and the engine has refused it, which is what a `revoke` on the host looks
 * like from here. Both hold the verbs closed; only the second should say "it
 * may have been revoked," and telling someone their device was revoked when
 * they simply never enrolled it is a remedy aimed at the wrong problem.
 */
export type EnrolmentState = 'enrolled' | 'unenrolled' | 'rejected';

type AuthContextValue = {
  enrolment: EnrolmentState;
  /** False on platforms with no Keychain — the enrolment UI says so rather than offering a field that cannot persist. */
  canEnrol: boolean;
  /** Hydrated from storage. Screens must not read `enrolment` as meaningful before this. */
  ready: boolean;
  enrol: (token: string) => Promise<void>;
  unenrol: () => Promise<void>;
  /**
   * Report a refusal the engine just returned, so the app's belief about its
   * own enrolment follows the host rather than drifting from it.
   *
   * A `revoke` takes effect on the engine's very next request with no restart
   * (the registry is read per request), so the only way this app learns its
   * token died is by being told no. Without this, a revoked device would keep
   * rendering "enrolled" and offering verbs forever.
   */
  noteRefusal: (refusal: DeviceRefusal) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { host, ready: hostReady } = useHost();
  const [enrolment, setEnrolment] = useState<EnrolmentState>('unenrolled');
  // Readiness is DERIVED from which host has been hydrated, not a boolean the
  // effect flips off on entry. Setting state synchronously inside an effect
  // triggers a cascading render, and the derived form says the same thing more
  // precisely: `ready` means "the token in hand belongs to the host currently
  // selected", which is exactly the question a caller is asking when it gates
  // on it during a host switch.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const ready = hydratedFor === host.id;

  // Re-hydrates on every host change, because the credential is per host: the
  // engine's registry is host-local by construction, so a token minted on
  // benatky authenticates against nothing on stjerneborg. Switching hosts is
  // therefore a credential change, not just a URL change.
  useEffect(() => {
    if (!hostReady) return;
    let cancelled = false;
    void loadToken(host.id).then((token) => {
      if (cancelled) return;
      setEnrolment(token ? 'enrolled' : 'unenrolled');
      setHydratedFor(host.id);
    });
    return () => {
      cancelled = true;
    };
  }, [host.id, hostReady]);

  const enrol = useCallback(
    async (token: string) => {
      await saveToken(host.id, token);
      setEnrolment('enrolled');
    },
    [host.id],
  );

  const unenrol = useCallback(async () => {
    await clearToken(host.id);
    setEnrolment('unenrolled');
  }, [host.id]);

  const noteRefusal = useCallback(
    (refusal: DeviceRefusal) => {
      if (!invalidatesToken(refusal)) return;
      // The held token is no good, so drop it rather than leaving a dead
      // credential in the Keychain to be re-sent on every subsequent request.
      void clearToken(host.id);
      setEnrolment('rejected');
    },
    [host.id],
  );

  const value = useMemo(
    () => ({ enrolment, canEnrol: secureStorageAvailable, ready, enrol, unenrol, noteRefusal }),
    [enrolment, ready, enrol, unenrol, noteRefusal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
