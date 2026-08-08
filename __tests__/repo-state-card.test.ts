import { deviceMayAct, stateCard } from '../src/lib/repo-state-card';
import type { RepoState } from '../src/lib/daemon/types';

const base: RepoState = {
  name: 'r',
  path: 'repos/r',
  position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
  dirty_files: 0,
  worktrees: 0,
  submodules: false,
};

// Every fixture below states `device` because the parameter is REQUIRED, not
// optional-defaulting-to-enrolled. An optional field would let a call site
// forget it and silently offer verbs to a device with no credential — the
// failure would look like an engine refusal, not a client omission.
const ENROLLED = { device: 'enrolled' as const };
const OPEN = { enabled: 'granted' as const, pushEnabled: 'granted' as const, ...ENROLLED };
const SYNC_ONLY = { enabled: 'granted' as const, pushEnabled: 'refused' as const, ...ENROLLED };
const CLOSED = { enabled: 'refused' as const, pushEnabled: 'refused' as const, ...ENROLLED };
// N1 (whole-branch re-review): a failed GATES READ is a different fact from
// a REFUSED grant, and must read differently — see the "gate reads as
// unknown" describe block below.
const GATES_UNKNOWN = { enabled: 'unknown' as const, pushEnabled: 'unknown' as const, ...ENROLLED };

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

describe('stateCard — N1 (whole-branch re-review): an unread gate is not the same claim as a refused one', () => {
  // A failed `GET /repos` and a host that said no are different facts —
  // collapsing them made the card assert a specific refusal ("this host has
  // not granted...") nobody actually read, prescribing a manifest edit for a
  // condition that may not exist.
  const behind3: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 3 } };
  const ahead2: RepoState = { ...base, position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 } };

  it('an unknown sync gate reads "held closed" — never "has not granted" — for a pull', () => {
    const model = stateCard(behind3, GATES_UNKNOWN);
    expect(model).toMatchObject({ action: 'blocked', label: 'Pull 3 commits', verb: null });
    expect(model.reason).toMatch(/held closed/i);
    expect(model.reason).not.toMatch(/has not granted/i);
  });

  it('an unknown sync gate reads "held closed" for a plain fetch too', () => {
    const model = stateCard(base, GATES_UNKNOWN);
    expect(model).toMatchObject({ action: 'blocked', label: 'Fetch origin', verb: null });
    expect(model.reason).toMatch(/held closed/i);
    expect(model.reason).not.toMatch(/has not granted/i);
  });

  it('an unknown push gate reads "held closed" — never "is not granted" — for a push', () => {
    const model = stateCard(ahead2, { enabled: 'granted', pushEnabled: 'unknown', ...ENROLLED });
    expect(model).toMatchObject({ action: 'blocked', label: 'Push 2 commits', verb: null });
    expect(model.reason).toMatch(/held closed/i);
    expect(model.reason).not.toMatch(/is not granted/i);
  });

  it('reads DIFFERENTLY (tone) from a genuine refusal — a refusal is the host\'s policy, an unknown read is an anomaly', () => {
    const refused = stateCard(behind3, CLOSED);
    const unknown = stateCard(behind3, GATES_UNKNOWN);
    expect(refused.tone).toBe('neutral');
    expect(unknown.tone).toBe('warn');
    expect(refused.reason).not.toBe(unknown.reason);
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
    const model = stateCard(s, OPEN);
    expect(model).toMatchObject({ action: 'blocked', tone: 'error', label: 'Action failed', verb: null });
    // A written sentence FIRST, same discipline as the read_error fix — this
    // fallback exists to stop a throw, not to ship the raw engine message
    // with nothing in front of it.
    expect(model.reason).toMatch(/^This app doesn.t recognize this failure yet\./);
    expect(model.reason).toContain('the engine said something new');
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

describe('stateCard — the device gate', () => {
  const UNENROLLED = { enabled: 'granted' as const, pushEnabled: 'granted' as const, device: 'unenrolled' as const };
  const REJECTED = { enabled: 'granted' as const, pushEnabled: 'granted' as const, device: 'rejected' as const };
  const ahead2 = { ...base, position: { kind: 'tracking' as const, upstream: 'origin/main', ahead: 2, behind: 0 } };
  const behind2 = { ...base, position: { kind: 'tracking' as const, upstream: 'origin/main', ahead: 0, behind: 2 } };

  it('blocks every verb when the device holds no token, even on a fully open manifest', () => {
    // The manifest here grants everything. The engine would still refuse,
    // because it authenticates BEFORE it reads either registry or ceiling — so
    // offering the button would produce a 401 that reads as an engine fault.
    for (const [state, label] of [
      [base, 'Fetch origin'],
      [behind2, 'Pull 2 commits'],
      [ahead2, 'Push 2 commits'],
    ] as const) {
      const model = stateCard(state, UNENROLLED);
      expect(model).toMatchObject({ action: 'blocked', label, verb: null });
      expect(model.reason).toMatch(/isn’t enrolled/i);
    }
  });

  it('names ENROLMENT as the remedy, never the manifest — they are different files', () => {
    // The regression this exists to stop: rendering "ask the host to enable
    // the sync grant" to someone whose host has already granted it and whose
    // actual next step is to enrol their phone.
    const model = stateCard(base, UNENROLLED);
    expect(model.reason).toMatch(/Settings/);
    expect(model.reason).not.toMatch(/modules\.local\.toml|ask the host to enable/i);
  });

  it('tells a rejected token apart from a device that never enrolled', () => {
    // Both block. Only one of them should say "revoked" — telling someone
    // their device was revoked when they simply never enrolled it aims a
    // remedy at the wrong problem.
    const rejected = stateCard(base, REJECTED);
    expect(rejected.reason).toMatch(/revoked/i);
    expect(rejected.tone).toBe('warn');

    const unenrolled = stateCard(base, UNENROLLED);
    expect(unenrolled.reason).not.toMatch(/revoked/i);
    expect(unenrolled.tone).toBe('neutral');
  });

  it('checks the device BEFORE the manifest, matching the engine’s own order', () => {
    // Both refuse. The engine would answer `no_principal` (401) and never
    // reach its ceiling check, so the device's reason is the true one.
    const bothClosed = { enabled: 'refused' as const, pushEnabled: 'refused' as const, device: 'unenrolled' as const };
    expect(stateCard(base, bothClosed).reason).toMatch(/isn’t enrolled/i);
  });

  it('lets a more specific repo fact outrank it — a dirty tree is a truer sentence', () => {
    // The device gate sits where the manifest gate sat, so the card's existing
    // information hierarchy is unchanged: "there are uncommitted files on the
    // host" is more useful than "you aren't enrolled", and both are true.
    const dirtyBehind = { ...behind2, dirty_files: 3 };
    expect(stateCard(dirtyBehind, UNENROLLED).reason).toMatch(/uncommitted/i);
  });

  it('offers the verbs again once a token is held', () => {
    // The negative assertions above are only worth anything if the positive
    // case still works — otherwise "blocked" would pass for the wrong reason.
    expect(stateCard(base, OPEN)).toMatchObject({ action: 'ready', verb: 'fetch' });
    expect(stateCard(ahead2, OPEN)).toMatchObject({ action: 'ready', verb: 'push' });
  });
});

describe('deviceMayAct — the rule both screens consult', () => {
  it('requires BOTH halves, which is the conjunction the engine enforces', () => {
    expect(deviceMayAct('enrolled', 'granted')).toBe(true);
    // The manifest alone is not enough: the engine authenticates before it
    // reads its ceiling, so offering a sweep here means a 401 on every tap.
    expect(deviceMayAct('unenrolled', 'granted')).toBe(false);
    expect(deviceMayAct('rejected', 'granted')).toBe(false);
    // And the device alone is not enough either.
    expect(deviceMayAct('enrolled', 'refused')).toBe(false);
  });

  it('treats an UNREADABLE manifest as no permission, not as permission', () => {
    // Fail closed, matching the repo screen's own reading of an absent or
    // malformed `GET /repos`.
    expect(deviceMayAct('enrolled', 'unknown')).toBe(false);
  });
});
