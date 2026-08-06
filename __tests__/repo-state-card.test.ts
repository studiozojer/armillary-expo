import { stateCard } from '../src/lib/repo-state-card';
import type { RepoState } from '../src/lib/daemon/types';

const base: RepoState = {
  name: 'r',
  path: 'repos/r',
  position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
  dirty_files: 0,
  worktrees: 0,
  submodules: false,
};

const OPEN = { enabled: true, pushEnabled: true };
const SYNC_ONLY = { enabled: true, pushEnabled: false };
const CLOSED = { enabled: false, pushEnabled: false };

/** Same trick `repo-label.test.ts` uses: build the ISO string from LOCAL
 *  components so the assertion is independent of the test runner's TZ. */
function localIso(year: number, monthIndex: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

describe('stateCard — rule 1: inFlight', () => {
  it('reports busy with the verb in progress, and offers nothing to call', () => {
    expect(stateCard(base, OPEN, 'fetch')).toMatchObject({ action: 'busy', tone: 'none', label: 'Fetching…', verb: null });
    expect(stateCard(base, OPEN, 'pull')).toMatchObject({ label: 'Pulling…' });
    expect(stateCard(base, OPEN, 'push')).toMatchObject({ label: 'Pushing…' });
  });

  it('still reads freshness while busy — staleness does not change meaning mid-request', () => {
    const s = { ...base, last_fetch: localIso(2020, 2, 14) };
    expect(stateCard(s, OPEN, 'fetch').sublabel).toBe('fetched Mar 14');
  });
});

describe('stateCard — rule 2: read_error outranks everything else', () => {
  it('blocks with a written sentence LEADING the raw message, no verb', () => {
    const s: RepoState = {
      ...base,
      dirty_files: 9,
      action_error: { kind: 'timeout', message: 'x' },
      read_error: 'not a git repository',
    };
    // Figma `372:748` draws a sentence, not a bare git message — the raw
    // string stays appended (still the most specific fact available), but a
    // person-written sentence has to lead it.
    expect(stateCard(s, OPEN)).toMatchObject({
      action: 'blocked',
      tone: 'error',
      label: 'Repo unreadable',
      reason: 'Could not read this repository on the host. not a git repository',
      verb: null,
    });
  });
});

describe('stateCard — rule 3: action_error, tone by kind', () => {
  it('dirty, not-fast-forwardable and refused-by-remote are refusals: warn', () => {
    for (const kind of ['dirty', 'not-fast-forwardable', 'refused-by-remote'] as const) {
      const s: RepoState = { ...base, action_error: { kind, message: 'x' } };
      expect(stateCard(s, OPEN)).toMatchObject({ action: 'blocked', tone: 'warn', verb: null });
    }
  });

  it('transport and timeout are failures: error', () => {
    for (const kind of ['transport', 'timeout'] as const) {
      const s: RepoState = { ...base, action_error: { kind, message: 'x' } };
      expect(stateCard(s, OPEN)).toMatchObject({ action: 'blocked', tone: 'error', verb: null });
    }
  });

  it('reason is a plain-language sentence, not the raw git message', () => {
    const s: RepoState = { ...base, action_error: { kind: 'transport', message: 'exit status 128: fatal: unable to access' } };
    const model = stateCard(s, OPEN);
    expect(model.reason).toBe('Could not reach the remote.');
    expect(model.reason).not.toContain('exit status');
  });

  it('outranks the dirty/ahead-behind counts below it, because they are stale', () => {
    const s: RepoState = {
      ...base,
      dirty_files: 4,
      position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 },
      action_error: { kind: 'transport', message: 'x' },
    };
    expect(stateCard(s, OPEN)).toMatchObject({ action: 'blocked', tone: 'error', label: 'Fetch failed' });
  });
});

describe('stateCard — rules 4-6: structural position, true regardless of gates', () => {
  it('detached: no branch to act on', () => {
    const s: RepoState = { ...base, position: { kind: 'detached' } };
    expect(stateCard(s, CLOSED)).toMatchObject({ action: 'blocked', tone: 'warn', verb: null });
    expect(stateCard(s, CLOSED).reason).toMatch(/not on a branch/i);
  });

  it('no-upstream: neutral (a policy, not a failure), and never offers to publish', () => {
    const s: RepoState = { ...base, position: { kind: 'no-upstream' } };
    const model = stateCard(s, OPEN);
    expect(model).toMatchObject({ action: 'blocked', tone: 'neutral', verb: null });
    expect(model.reason).not.toMatch(/publish/i);
  });

  it('upstream-gone: warn, ahead/behind unknowable', () => {
    const s: RepoState = { ...base, position: { kind: 'upstream-gone', upstream: 'origin/x' } };
    expect(stateCard(s, OPEN)).toMatchObject({ action: 'blocked', tone: 'warn', verb: null });
  });
});

describe('stateCard — rule 7: diverged offers neither verb', () => {
  it('blocks with both counts in the reason', () => {
    const s: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 1, behind: 2 } };
    const model = stateCard(s, OPEN);
    expect(model).toMatchObject({ action: 'blocked', tone: 'warn', verb: null });
    expect(model.reason).toContain('1 ahead');
    expect(model.reason).toContain('2 behind');
  });
});

describe('stateCard — rule 8: behind + dirty is the common friction state', () => {
  it('blocks the pull and names the file count', () => {
    const s: RepoState = {
      ...base,
      position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 3 },
      dirty_files: 4,
    };
    const model = stateCard(s, OPEN);
    expect(model).toMatchObject({ action: 'blocked', tone: 'warn', label: 'Pull 3 commits', verb: null });
    expect(model.reason).toContain('4');
    expect(model.reason).toMatch(/commit or stash/i);
  });
});

describe('stateCard — rule 9: behind, clean -> ready to pull, gated on sync', () => {
  const behind3: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 3 } };

  it('offers the pull when sync is granted', () => {
    expect(stateCard(behind3, OPEN)).toMatchObject({ action: 'ready', tone: 'none', label: 'Pull 3 commits', verb: 'pull' });
  });

  it('blocks on the gate, not on git, when sync is not granted', () => {
    const model = stateCard(behind3, CLOSED);
    expect(model).toMatchObject({ action: 'blocked', tone: 'neutral', label: 'Pull 3 commits', verb: null });
    expect(model.reason).toMatch(/sync/i);
  });
});

describe('stateCard — rule 10: ahead -> ready to push; dirty does NOT block it', () => {
  it('offers the push even while the tree is dirty — pushing never touches the working tree', () => {
    const s: RepoState = {
      ...base,
      position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 },
      dirty_files: 5,
    };
    expect(stateCard(s, OPEN)).toMatchObject({ action: 'ready', tone: 'none', label: 'Push 2 commits', verb: 'push' });
  });

  it('blocks on the push grant specifically, independent of sync', () => {
    const s: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 } };
    const model = stateCard(s, SYNC_ONLY);
    expect(model).toMatchObject({ action: 'blocked', tone: 'neutral', label: 'Push 2 commits', verb: null });
    expect(model.reason).toMatch(/push/i);
  });
});

describe('stateCard — rule 11: otherwise, fetch', () => {
  it('offers a plain fetch when clean and current', () => {
    expect(stateCard(base, OPEN)).toMatchObject({ action: 'ready', tone: 'none', label: 'Fetch origin', verb: 'fetch' });
  });

  it('blocks on the sync gate', () => {
    const model = stateCard(base, CLOSED);
    expect(model).toMatchObject({ action: 'blocked', tone: 'neutral', label: 'Fetch origin', verb: null });
    expect(model.reason).toMatch(/sync/i);
  });

  it('a ready state carries no reason at all', () => {
    expect(stateCard(base, OPEN).reason).toBeUndefined();
  });
});

describe('stateCard — sublabel: freshness, read once, reused everywhere', () => {
  it('reads "No fetch recorded" when last_fetch is absent — not "never fetched"', () => {
    // The engine returns null both for a repo never fetched and for one whose
    // last fetch FAILED; the copy must not claim to know which.
    expect(stateCard(base, OPEN).sublabel).toBe('No fetch recorded');
  });

  it('reuses repo-label.ts\'s relative() formatting when last_fetch is present', () => {
    const s = { ...base, last_fetch: localIso(2020, 2, 14) };
    expect(stateCard(s, OPEN).sublabel).toBe('fetched Mar 14');
  });
});

describe('stateCard — pluralization: one-ahead/one-behind is the common case', () => {
  it('says "1 commit", not "1 commits", when pulling', () => {
    const s: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 1 } };
    expect(stateCard(s, OPEN).label).toBe('Pull 1 commit');
  });

  it('says "1 commit", not "1 commits", when pushing', () => {
    const s: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 1, behind: 0 } };
    expect(stateCard(s, OPEN).label).toBe('Push 1 commit');
  });

  it('still pluralizes for more than one', () => {
    const s: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 2 } };
    expect(stateCard(s, OPEN).label).toBe('Pull 2 commits');
  });
});

describe('stateCard — degrades on a wire value this client does not recognise, rather than throwing', () => {
  // The `never`-typed defaults below are compile-time guards over THIS
  // FILE's own closed types; they say nothing about a value the ENGINE
  // sends that this file's types don't describe yet. Before the fix: an
  // unrecognised `action_error.kind` indexed `ACTION_ERROR_CARD` to
  // `undefined`, and reading `.tone` off it threw — the repo page
  // white-screened. An unrecognised `Position.kind` returned the raw wire
  // object as a `CardModel` — `TONE_BG[undefined]`, garbage as the reason.
  it('an unrecognised action_error.kind blocks with a generic message instead of throwing', () => {
    const s: RepoState = {
      ...base,
      action_error: { kind: 'sixth-kind', message: 'the engine said something new' } as unknown as RepoState['action_error'],
    };
    expect(() => stateCard(s, OPEN)).not.toThrow();
    expect(stateCard(s, OPEN)).toMatchObject({
      action: 'blocked',
      tone: 'error',
      label: 'Action failed',
      reason: 'the engine said something new',
      verb: null,
    });
  });

  it('an unrecognised Position.kind blocks with a neutral "unknown state" card instead of throwing', () => {
    const s: RepoState = {
      ...base,
      position: { kind: 'renamed-someday' } as unknown as RepoState['position'],
    };
    expect(() => stateCard(s, OPEN)).not.toThrow();
    const model = stateCard(s, OPEN);
    expect(model.action).toBe('blocked');
    expect(model.verb).toBeNull();
    expect(typeof model.label).toBe('string');
    expect(typeof model.reason).toBe('string');
  });
});
