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
});
