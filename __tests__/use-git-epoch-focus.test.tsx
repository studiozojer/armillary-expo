import { act, renderHook } from '@testing-library/react-native';

let focusCallback: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    focusCallback = cb;
  },
}));

import { __clearGitEpochForTests, bumpGitEpoch } from '../src/lib/daemon/git-epoch';
import { useGitEpochFocusRefresh } from '../src/lib/use-git-epoch-focus';

const focus = () => act(() => focusCallback?.());
const flush = () => act(async () => {});

describe('useGitEpochFocusRefresh', () => {
  beforeEach(() => {
    __clearGitEpochForTests();
    focusCallback = null;
  });

  it('skips the first focus — the mount load already fetched', async () => {
    const revalidate = jest.fn(async () => true);
    await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('a later focus with no action since is a no-op', async () => {
    const revalidate = jest.fn(async () => true);
    await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    await focus();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('a later focus AFTER a bump revalidates once, then goes quiet', async () => {
    const revalidate = jest.fn(async () => true);
    await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    bumpGitEpoch('benatky');
    await focus();
    await flush();
    expect(revalidate).toHaveBeenCalledTimes(1);
    await focus();
    expect(revalidate).toHaveBeenCalledTimes(1); // restamped — quiet again
  });

  it('a FAILED revalidate leaves the stamp behind, so the next focus retries', async () => {
    const revalidate = jest.fn(async () => false);
    await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    bumpGitEpoch('benatky');
    await focus();
    await flush();
    await focus();
    await flush();
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it("markFresh() absorbs the screen's own action — a bump the screen itself folded is not staleness", async () => {
    const revalidate = jest.fn(async () => true);
    const { result } = await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    bumpGitEpoch('benatky');
    act(() => result.current.markFresh());
    await focus();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('a bump on ANOTHER host is not staleness here', async () => {
    const revalidate = jest.fn(async () => true);
    await renderHook(() => useGitEpochFocusRefresh('benatky', revalidate));
    await focus();
    bumpGitEpoch('stjerneborg');
    await focus();
    expect(revalidate).not.toHaveBeenCalled();
  });
});
