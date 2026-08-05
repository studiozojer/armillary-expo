import { rowLabel } from '../src/lib/repo-label';
import type { RepoState } from '../src/lib/daemon/types';

const base: RepoState = {
  name: 'r',
  path: 'repos/r',
  position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
  dirty_files: 0,
  worktrees: 0,
  submodules: false,
};

describe('rowLabel — the ladder', () => {
  it('shows the changed-file count, not the word dirty', () => {
    expect(rowLabel({ ...base, dirty_files: 4 })).toEqual({ text: '4 changed', tone: 'warn' });
  });

  it('shows both directions when both are non-zero', () => {
    const p = { kind: 'tracking', upstream: 'origin/main', ahead: 1, behind: 2 } as const;
    expect(rowLabel({ ...base, position: p }).text).toBe('↑1 ↓2');
  });

  it('shows ahead when nothing is incoming — the founding bug', () => {
    const p = { kind: 'tracking', upstream: 'origin/main', ahead: 3, behind: 0 } as const;
    // The shipped build printed `current` here.
    expect(rowLabel({ ...base, position: p }).text).toBe('↑3 ↓0');
  });

  it('distinguishes an upstream that is gone from one that never existed', () => {
    expect(rowLabel({ ...base, position: { kind: 'upstream-gone', upstream: 'origin/x' } }).text).toBe(
      'upstream gone',
    );
    expect(rowLabel({ ...base, position: { kind: 'no-upstream' } }).text).toBe('no upstream');
  });

  it('reports a detached HEAD', () => {
    expect(rowLabel({ ...base, position: { kind: 'detached' } })).toEqual({
      text: 'detached',
      tone: 'warn',
    });
  });

  it('read_error outranks everything, including dirty files and action_error', () => {
    const s: RepoState = {
      ...base,
      dirty_files: 9,
      action_error: { kind: 'timeout', message: 'x' },
      read_error: 'not a git repository',
    };
    expect(rowLabel(s)).toEqual({ text: 'unreadable', tone: 'error' });
  });

  it('a failed action outranks the dirty count, because the count is stale', () => {
    const s: RepoState = {
      ...base,
      dirty_files: 4,
      action_error: { kind: 'transport', message: 'could not reach origin' },
    };
    expect(rowLabel(s)).toEqual({ text: 'fetch failed', tone: 'error' });
  });

  it('falls back to last-fetch only when there is nothing to act on', () => {
    expect(rowLabel({ ...base, last_fetch: new Date().toISOString() }).tone).toBe('muted');
  });

  it('dirty outranks ahead/behind — the design says both can be true, and dirty goes first', () => {
    // The `base` fixture's position is `tracking` with ahead/behind both 0,
    // so a dirty_files-vs-position reorder can't be told apart by the
    // "changed-file count" test above: 0/0 produces no positional label
    // either way, order or no order. This is the test that actually
    // distinguishes the two orderings — non-zero ahead *and* dirty files
    // both present, dirty required to win.
    const p = { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 } as const;
    expect(rowLabel({ ...base, position: p, dirty_files: 3 })).toEqual({
      text: '3 changed',
      tone: 'warn',
    });
  });

  it('reports never-fetched distinctly from a stale timestamp', () => {
    expect(rowLabel({ ...base }).text).toBe('never fetched');
  });
});

describe('rowLabel — action_error is exhaustive and a refusal reads quieter than a failure', () => {
  it('dirty and not-fast-forwardable and refused-by-remote are refusals: warn, not error', () => {
    expect(rowLabel({ ...base, action_error: { kind: 'dirty', message: 'x' } }).tone).toBe('warn');
    expect(
      rowLabel({ ...base, action_error: { kind: 'not-fast-forwardable', message: 'x' } }).tone,
    ).toBe('warn');
    expect(
      rowLabel({ ...base, action_error: { kind: 'refused-by-remote', message: 'x' } }).tone,
    ).toBe('warn');
  });

  it('transport and timeout are failures: error, not warn', () => {
    expect(rowLabel({ ...base, action_error: { kind: 'transport', message: 'x' } }).tone).toBe(
      'error',
    );
    expect(rowLabel({ ...base, action_error: { kind: 'timeout', message: 'x' } }).tone).toBe(
      'error',
    );
  });

  it('names each kind in words, not enum spelling', () => {
    expect(rowLabel({ ...base, action_error: { kind: 'dirty', message: 'x' } }).text).toBe(
      'refused — uncommitted',
    );
    expect(
      rowLabel({ ...base, action_error: { kind: 'not-fast-forwardable', message: 'x' } }).text,
    ).toBe('refused — diverged');
    expect(
      rowLabel({ ...base, action_error: { kind: 'refused-by-remote', message: 'x' } }).text,
    ).toBe('refused by remote');
    expect(rowLabel({ ...base, action_error: { kind: 'transport', message: 'x' } }).text).toBe(
      'fetch failed',
    );
    expect(rowLabel({ ...base, action_error: { kind: 'timeout', message: 'x' } }).text).toBe(
      'timed out',
    );
  });
});

describe('rowLabel — relative(last_fetch)', () => {
  const now = new Date(2026, 7, 1, 18, 0); // Aug 1 2026, 18:00 local

  function localIso(year: number, monthIndex: number, day: number, hour = 0, minute = 0): string {
    return new Date(year, monthIndex, day, hour, minute).toISOString();
  }

  it('reads relative within the same calendar day', () => {
    expect(rowLabel({ ...base, last_fetch: localIso(2026, 7, 1, 14, 22) }, now).text).toBe(
      'fetched 14:22 today',
    );
  });

  it('reads absolute once the fetch is a different calendar day', () => {
    expect(rowLabel({ ...base, last_fetch: localIso(2026, 6, 29, 9, 5) }, now).text).toBe(
      'fetched Jul 29',
    );
  });
});
