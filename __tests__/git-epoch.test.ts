import { __clearGitEpochForTests, bumpGitEpoch, gitEpochOf } from '../src/lib/daemon/git-epoch';

describe('git epoch', () => {
  beforeEach(() => __clearGitEpochForTests());

  it('reads 0 for a host no action has touched', () => {
    expect(gitEpochOf('benatky')).toBe(0);
  });

  it('bumps monotonically', () => {
    bumpGitEpoch('benatky');
    bumpGitEpoch('benatky');
    expect(gitEpochOf('benatky')).toBe(2);
  });

  it('is scoped per host — one host acting says nothing about another', () => {
    bumpGitEpoch('benatky');
    expect(gitEpochOf('stjerneborg')).toBe(0);
  });
});
