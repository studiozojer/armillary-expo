import { getAgentConsent, setAgentConsent } from '../src/lib/agent-permissions';

function secureMock() {
  return jest.requireMock('expo-secure-store') as {
    __store: Map<string, string>;
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
  };
}

beforeEach(() => {
  secureMock().__store.clear();
  secureMock().getItemAsync.mockClear();
});

describe('agent-permissions store', () => {
  it('reads all three as true from a fresh store — absent state reads as consented (D4, amended)', async () => {
    await expect(getAgentConsent('benatky')).resolves.toEqual({ sync: true, push: true, commit: true });
  });

  it('flips one toggle and persists it, independently per host', async () => {
    await setAgentConsent('benatky', 'push', false);

    expect(await getAgentConsent('benatky')).toEqual({ sync: true, push: false, commit: true });
    // stjerneborg never touched — a revocation on one host must not leak to another.
    expect(await getAgentConsent('stjerneborg')).toEqual({ sync: true, push: true, commit: true });
  });

  it('flips more than one key on the same host, each surviving the other', async () => {
    await setAgentConsent('benatky', 'sync', false);
    await setAgentConsent('benatky', 'commit', false);

    expect(await getAgentConsent('benatky')).toEqual({ sync: false, push: true, commit: false });
  });

  it('reads no stored state as consented even when the Keychain read throws', async () => {
    secureMock().getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(getAgentConsent('benatky')).resolves.toEqual({ sync: true, push: true, commit: true });
  });

  it('serializes two interleaved writes to the same host — a slow first read must never let a fast second write get clobbered', async () => {
    // Reproduces the settings.tsx shape: two taps fire without awaiting
    // between them (revoke push, then revoke commit). Each write is its own
    // read-modify-write; if both reads race, whichever write LANDS LAST wins
    // wholesale and silently resurrects the other tap's revocation — the one
    // direction a consent surface must never fail (widening quietly).
    //
    // The first call's read captures its snapshot immediately (matching what
    // a real Keychain read observes at call time) but doesn't RESOLVE until
    // after the second call's entire read-modify-write would have finished
    // uncontested — the shape that breaks an unserialized read-modify-write.
    const mock = secureMock();
    mock.getItemAsync.mockImplementationOnce((key: string) => {
      const value = mock.__store.has(key) ? mock.__store.get(key) : null;
      return new Promise((resolve) => setTimeout(() => resolve(value), 10));
    });

    const firstTap = setAgentConsent('benatky', 'push', false);
    const secondTap = setAgentConsent('benatky', 'commit', false);
    await Promise.all([firstTap, secondTap]);

    // Both revocations must survive — neither write may resurrect the other.
    await expect(getAgentConsent('benatky')).resolves.toEqual({ sync: true, push: false, commit: false });
  });
});
