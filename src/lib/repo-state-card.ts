import type { ActionErrorKind, RepoState } from './daemon/types';
import { relative } from './repo-label';

export type CardAction = 'ready' | 'blocked' | 'busy';
export type CardTone = 'none' | 'neutral' | 'warn' | 'error';

/**
 * A grant's state as read off `GET /repos` — or the fact that it couldn't be
 * read at all. `'unknown'` is a DIFFERENT claim from `'refused'`: the host
 * refusing a grant is a fact about the host; a failed gates read is a fact
 * about the network, and says nothing about what the host actually granted.
 * Collapsing both into one boolean (N1 of the whole-branch re-review) made a
 * failed `GET /repos` render as "Push is not granted on this host... Ask the
 * host to enable it" — a specific remedy prescribed for a specific refusal
 * that was never read, sending someone to edit a manifest that may already
 * be correct. `'unknown'` gets its own reason instead of borrowing
 * `'refused'`'s.
 */
export type GateState = 'granted' | 'refused' | 'unknown';

/**
 * Whether THIS DEVICE holds a credential for the host — a fact about the
 * phone, where `GateState` above is a fact about the workspace manifest.
 *
 * Effective authority on the engine is `registry ∧ manifest`, checked in that
 * order, and the two halves have unrelated remedies: a manifest refusal is
 * fixed by editing `modules.local.toml` on the host, a device refusal by
 * enrolling this phone. Rendering the manifest's remedy for a device refusal
 * sends someone to edit a file that is already correct — the same defect
 * `'unknown'` was introduced to prevent, arriving through another door.
 *
 * `'rejected'` is not `'unenrolled'`: a token IS held and the host refused it,
 * which is what a `revoke` looks like from here. Telling someone their device
 * was revoked when they simply never enrolled it aims a remedy at the wrong
 * problem.
 *
 * There is deliberately no `'ungranted'` value. Whether an enrolled device
 * holds `push` as well as `sync` is not knowable from this app: enrollment is a
 * host CLI (design decision 6) and no route reports a principal's grants. So
 * `'enrolled'` means "has a token", the verbs are offered, and a device that
 * lacks the grant learns so from the engine's own `principal_not_granted` —
 * carried to the screen as an action error, not guessed at here.
 */
export type DeviceGate = 'enrolled' | 'unenrolled' | 'rejected';

export type CardModel = {
  action: CardAction;
  tone: CardTone;
  /** The button's bold line — the verb and its count. */
  label: string;
  /** The button's small line — freshness, not the age of the work. */
  sublabel: string;
  /** Rendered only when tone !== 'none'. Why the action is unavailable, and what unblocks it. */
  reason?: string;
  /** What to actually call. `null` whenever action !== 'ready'. */
  verb: 'fetch' | 'pull' | 'push' | 'commit' | null;
};

/** "1 commit", "3 commits", "1 file", "4 files" — one-ahead/one-behind (or
 *  one dirty file) is the most common non-clean state, and "Push 1 commits"
 *  reads as broken English on exactly the case a user hits most often. */
function pluralCount(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function commitCount(n: number): string {
  return pluralCount(n, 'commit');
}

function fileCount(n: number): string {
  return pluralCount(n, 'file');
}

/**
 * Copy for a failed write verb, one row per `ActionErrorKind`.
 *
 * `Record<ActionErrorKind, …>` on purpose — the same idiom `repo-label.ts`'s
 * `ACTION_ERROR` uses, for the same reason: a sixth kind added to THIS
 * FILE's own `ActionErrorKind` union without a row here is a compile error.
 * That is a compile-time guard only, and only over this file's type — the
 * engine's `ActionError.kind` is a bare `&'static str` on the wire, so a
 * sixth kind is representable there before it is representable here.
 * `stateCard` reads this table with a `?? fallback` for exactly that gap —
 * without it, an unrecognised kind indexes past the table to `undefined`,
 * and reading `.tone` off `undefined` throws, white-screening the repo page.
 *
 * This is its OWN table rather than a re-export of `repo-label.ts`'s
 * `ACTION_ERROR`, even though the two overlap in spirit. Two reasons: (1)
 * `repo-label.ts`'s `Tone` is `'error' | 'warn' | 'muted'` — this card's
 * `CardTone` has no `'muted'` and adds `'neutral'`, so reusing that map's
 * `.tone` needs a cast either way; (2) this table also owns `reason`, a full
 * sentence with no analog on the row (a list row has no room for one), so
 * there was no single shape both call sites could share without one of them
 * padding out fields the other doesn't use. `label` intentionally echoes
 * `repo-label.ts`'s wording where the concept is the same ("fetch failed"),
 * so the same failure reads the same way on the list and on the repo page —
 * but as a deliberate word choice, not an import, since the row's compact
 * register and the card's fuller one are allowed to diverge later without
 * one dragging the other.
 *
 * Tone: a REFUSAL reads quieter than a FAILURE. `dirty`, `not-fast-
 * forwardable` and `refused-by-remote` are git (or the remote) declining ON
 * PURPOSE — the request was heard and answered, just "no." `transport` and
 * `timeout` are the engine not getting an answer at all.
 */
const ACTION_ERROR_CARD: Record<ActionErrorKind, { label: string; tone: 'warn' | 'error'; reason: string }> = {
  dirty: {
    label: 'Refused — uncommitted',
    tone: 'warn',
    reason: 'The working tree has uncommitted changes. Commit or stash on the host, then try again.',
  },
  'not-fast-forwardable': {
    label: 'Refused — diverged',
    tone: 'warn',
    reason: 'History has diverged from the remote, so a plain fast-forward is not possible.',
  },
  'refused-by-remote': {
    label: 'Refused by remote',
    tone: 'warn',
    reason: 'The remote declined the push — a protected branch or a server-side hook said no.',
  },
  transport: {
    label: 'Fetch failed',
    tone: 'error',
    reason: 'Could not reach the remote.',
  },
  timeout: {
    label: 'Timed out',
    tone: 'error',
    reason: 'The request to the remote timed out.',
  },
};

const IN_FLIGHT_LABEL: Record<'fetch' | 'pull' | 'push', string> = {
  fetch: 'Fetching…',
  pull: 'Pulling…',
  push: 'Pushing…',
};

/** Shown when a verb would otherwise run but the host has REFUSED `sync`. */
const SYNC_NOT_GRANTED =
  'This host has not granted git authority (the "sync" grant). Ask the host to enable it.';

/** Shown when a verb would otherwise run but the `sync` grant could not be
 *  READ at all — a failed `GET /repos`, not a refusal. A different fact from
 *  `SYNC_NOT_GRANTED` (N1): nobody has actually said no here, so there is
 *  nothing to ask the host to change — the fix is a fresh read, not a
 *  manifest edit. */
const SYNC_UNKNOWN =
  'Couldn’t read this host’s grants, so git actions are held closed. Pull to refresh.';

/** Shown when push specifically would otherwise run but the host has REFUSED `push`. */
const PUSH_NOT_GRANTED =
  'Push is not granted on this host (a separate "push" grant from "sync"). Ask the host to enable it.';

/** Push's counterpart to `SYNC_UNKNOWN` — the `push` grant could not be read. */
const PUSH_UNKNOWN =
  'Couldn’t read this host’s grants, so push is held closed. Pull to refresh.';

/** Shown when commit specifically would otherwise run but the host has REFUSED `commit`. */
const COMMIT_NOT_GRANTED =
  'Commit is not granted on this host (a separate "commit" grant from "sync" and "push"). Ask the host to enable it (`commit = true` under `[router]`).';

/** Commit's counterpart to `SYNC_UNKNOWN`/`PUSH_UNKNOWN` — the `commit` grant could not be read. */
const COMMIT_UNKNOWN =
  'Couldn’t read this host’s grants, so commit is held closed. Pull to refresh.';

/** Shown when the device holds no token for this host at all. */
const DEVICE_UNENROLLED =
  'This device isn’t enrolled on this host, so it can’t act on repos. Enroll it in Settings with a token minted on the host.';

/** Shown when a token IS held and the host refused it — the revoke case. */
const DEVICE_REJECTED =
  'This host no longer recognises this device’s token — it may have been revoked. Re-enroll in Settings.';

/** `gates.enabled`/`gates.pushEnabled` are `GateState`, not `boolean` — this
 *  is where the two blocked reasons (and their tones) fork on WHY the grant
 *  reads as unavailable. `'unknown'` reads `warn`, not `neutral`: a refusal
 *  is the host's deliberate policy (the quietest tone this card has), but a
 *  failed read is an anomaly worth flagging, not a calm "no." */
function gateBlocked(gate: GateState, refused: string, unknown: string): { tone: CardTone; reason: string } {
  return gate === 'unknown' ? { tone: 'warn', reason: unknown } : { tone: 'neutral', reason: refused };
}

/**
 * May this device run a repo verb at all, on this workspace?
 *
 * The `registry ∧ manifest` conjunction the engine enforces, as one predicate,
 * so the two screens that decide whether to OFFER a sweep or a verb consult
 * the same rule. `verbBlocked` below answers the richer question (which reason
 * to show); this answers the plain one, for the group-fetch affordance on the
 * composition screen, which hides rather than explains.
 *
 * Extracted after shipping the device gate on the repo screen and missing this
 * sibling — the composition screen went on offering a sweep to an unenrolled
 * device and reporting the refusal as a MANIFEST problem. One member of a set
 * standing in for the set; a shared predicate is what stops the next screen
 * repeating it.
 */
export function deviceMayAct(device: DeviceGate, manifest: GateState): boolean {
  return device === 'enrolled' && manifest === 'granted';
}

/**
 * Why this verb cannot run — or `null` if it can.
 *
 * **The device is checked before the manifest, and that order is the engine's
 * own.** Its extractor authenticates first, then reads the device's grant from
 * the host-local registry, then the manifest ceiling — so a device that is not
 * enrolled would be refused with `no_principal` no matter what the manifest
 * says. Checking the manifest first here would render "ask the host to enable
 * the sync grant" to someone whose actual next step is to enroll their phone,
 * and whose host may already have granted everything.
 *
 * Called at the same points the manifest gate used to be checked alone, so
 * more specific repo facts still win: a detached HEAD or a dirty tree is a
 * truer sentence than "not enrolled", and both are decided above this.
 *
 * `'rejected'` reads `warn` rather than `neutral`: an unenrolled device is a
 * quiet, expected state, but a token the host has stopped recognising is an
 * anomaly the user did not cause and should see flagged.
 */
function verbBlocked(
  gates: { enabled: GateState; pushEnabled: GateState; commitEnabled: GateState; device: DeviceGate },
  which: 'sync' | 'push' | 'commit',
): { tone: CardTone; reason: string } | null {
  if (gates.device === 'unenrolled') return { tone: 'neutral', reason: DEVICE_UNENROLLED };
  if (gates.device === 'rejected') return { tone: 'warn', reason: DEVICE_REJECTED };

  const gate = which === 'push' ? gates.pushEnabled : which === 'commit' ? gates.commitEnabled : gates.enabled;
  if (gate === 'granted') return null;
  if (which === 'push') return gateBlocked(gate, PUSH_NOT_GRANTED, PUSH_UNKNOWN);
  if (which === 'commit') return gateBlocked(gate, COMMIT_NOT_GRANTED, COMMIT_UNKNOWN);
  return gateBlocked(gate, SYNC_NOT_GRANTED, SYNC_UNKNOWN);
}

/**
 * David's decomposition of the repo page's centrepiece (Figma
 * `bbjHiHEBoR3xWWruoprPkH`, node 345:448, "State Card" — supersedes the
 * plan's `primaryAction`). Pure function, no React, no model in the path —
 * same discipline as `rowLabel`.
 *
 * The ladder, in order. Each rule sits where it does because of what it
 * disqualifies below it:
 *
 * 1. `inFlight` — a request is already running; nothing below can be truer
 *    than "in progress," and offering a second tap on top of it is the bug.
 * 2. `read_error` — the repo cannot be read AT ALL, so every fact below
 *    (position, dirty count) is a type default, not a measurement. Reporting
 *    on defaults as if they were real would be worse than saying nothing.
 * 3. `action_error` — the last write attempt failed. The counts on this
 *    `RepoState` are POST-attempt (`read_one` runs again after every verb),
 *    so they are current, but the attempt itself needs to be surfaced before
 *    anything derived from "what state are we in now" — a user who just
 *    watched a push fail needs to see that, not a cheerful "ready to push."
 * 4-6. `position.kind` structural cases (`detached` / `no-upstream` /
 *    `upstream-gone`) — true regardless of any gate, and each disqualifies
 *    ahead/behind from meaning anything, so they are checked before the
 *    counts are ever read.
 * 7. Diverged (`ahead > 0 && behind > 0`) — both directions are non-zero, so
 *    neither a pull nor a push is single-directional; `--ff-only` refuses
 *    the pull and a diverged push is non-fast-forward, so offering either
 *    verb would just relay git's own refusal one tap later.
 * 8. `behind > 0 && dirty_files > 0` — a pull is theoretically possible but
 *    `--ff-only` still touches the working tree's ref, and a dirty tree
 *    means uncommitted work sits between HEAD and the merge. The common
 *    friction state, named plainly. **No longer a pure dead end**: when the
 *    `commit` grant is real (`gates.commitEnabled`), committing the dirty
 *    tree is exactly what unblocks rule 9's pull, so this rung offers
 *    `Commit N file(s)` with a reason naming what it unblocks; when the
 *    grant is not real, the dead-end copy from before this rule existed is
 *    unchanged verbatim.
 * 9. `behind > 0`, clean — a pull is genuinely safe. Gated on `gates.enabled`
 *    (the `sync` grant) at the point it would otherwise run, not earlier:
 *    a detached HEAD or a diverged branch is exactly as true whether or not
 *    the host has granted git authority, and the more specific git fact is
 *    more useful than a generic "not granted" that would also be wrong the
 *    moment the more specific problem is the one actually fixed.
 * 10. `ahead > 0` — a push is offered. **Dirty does NOT block it** — pushing
 *    moves a remote ref and never touches the working tree, so the rule that
 *    blocks a pull (rule 8) has no analog here. Gated on `gates.pushEnabled`
 *    specifically (design D7: push is its own grant, separate from `sync`),
 *    at the same "point of use" as rule 9.
 * 10a. Plain dirty (`dirty_files > 0`, nothing ahead or behind) — a commit is
 *    offered on its own, immediately ahead of rule 11, with no reason line
 *    (nothing else is being unblocked, so there is nothing more to say).
 *    Gated on `gates.commitEnabled`; falls through to rule 11 rather than
 *    blocking when the grant is not real — there is no dead end to preserve
 *    here, since this rung did not exist before this feature.
 * 11. Otherwise — nothing ahead, nothing behind, nothing dirty: a plain
 *    fetch, gated on `gates.enabled` like rule 9.
 *
 * `sublabel` is computed once, up front, and reused by every branch —
 * "FRESHNESS is always the freshness line, whatever the verb" (component
 * description on the Figma node). It is never re-derived per branch because
 * its job is "how stale is what's on screen," which does not change meaning
 * depending on why the button is blocked.
 */
export function stateCard(
  s: RepoState,
  gates: { enabled: GateState; pushEnabled: GateState; commitEnabled: GateState; device: DeviceGate },
  inFlight?: 'fetch' | 'pull' | 'push',
): CardModel {
  const sublabel = s.last_fetch ? relative(s.last_fetch, new Date()) : 'No fetch recorded';

  if (inFlight) {
    return { action: 'busy', tone: 'none', label: IN_FLIGHT_LABEL[inFlight], sublabel, verb: null };
  }

  if (s.read_error) {
    return {
      action: 'blocked',
      tone: 'error',
      label: 'Repo unreadable',
      sublabel,
      // A written sentence FIRST, then the raw git message — every other
      // reason on this card is a sentence a person wrote, and a bare `fatal:
      // not a git repository` reads like a crash report dropped into a
      // product surface. Figma `372:748` draws the sentence; the raw string
      // stays appended rather than dropped, since it is still the most
      // specific fact available about WHY the read failed.
      reason: `Could not read this repository on the host. ${s.read_error}`,
      verb: null,
    };
  }

  if (s.action_error) {
    // `?? fallback` — see the doc comment on `ACTION_ERROR_CARD` above. An
    // `ActionErrorKind` this table doesn't have a row for would otherwise
    // make `ae` `undefined` and `ae.tone` throw, white-screening this page.
    const ae = ACTION_ERROR_CARD[s.action_error.kind] ?? {
      label: 'Action failed',
      tone: 'error' as const,
      // A written sentence FIRST, same discipline as the `read_error` reason
      // above — this fallback existed only to stop a throw, and shipping the
      // raw engine message with nothing in front of it is the exact defect
      // that fix closed three commits earlier, just relocated to a path
      // nothing exercised until now.
      reason: `This app doesn’t recognize this failure yet. ${s.action_error.message}`,
    };
    return { action: 'blocked', tone: ae.tone, label: ae.label, sublabel, reason: ae.reason, verb: null };
  }

  switch (s.position.kind) {
    case 'detached':
      return {
        action: 'blocked',
        tone: 'warn',
        label: 'Detached HEAD',
        sublabel,
        reason: 'HEAD is not on a branch, so there is nothing to fetch, pull, or push against.',
        verb: null,
      };

    case 'no-upstream':
      // Publishing a branch is out of v1 (David, design D-note) — the reason
      // states the fact and stops there, with no "publish it" call to action
      // this build cannot honor.
      return {
        action: 'blocked',
        tone: 'neutral',
        label: 'No upstream',
        sublabel,
        reason: 'This branch exists only on this host — it has no upstream to compare against.',
        verb: null,
      };

    case 'upstream-gone':
      return {
        action: 'blocked',
        tone: 'warn',
        label: 'Upstream gone',
        sublabel,
        reason:
          'The upstream tracking ref is gone — merged and pruned, or never fetched — so ahead/behind can’t be measured.',
        verb: null,
      };

    case 'tracking': {
      const { ahead, behind } = s.position;

      if (ahead > 0 && behind > 0) {
        return {
          action: 'blocked',
          tone: 'warn',
          label: `Diverged ↑${ahead} ↓${behind}`,
          sublabel,
          reason: `Diverged: ${ahead} ahead, ${behind} behind. A fast-forward pull would refuse, and a push would be non-fast-forward, so neither is offered.`,
          verb: null,
        };
      }

      if (behind > 0 && s.dirty_files > 0) {
        // The commit gate is real: committing the dirty tree is what
        // unblocks the pull rule 9 would otherwise offer, so — when granted
        // — this rung becomes a live offer rather than the dead end below.
        const commitBlocked = verbBlocked(gates, 'commit');
        if (!commitBlocked) {
          return {
            action: 'ready',
            tone: 'neutral',
            label: `Commit ${fileCount(s.dirty_files)}`,
            sublabel,
            reason: `Committing unblocks Pull ${commitCount(behind)}.`,
            verb: 'commit',
          };
        }
        return {
          action: 'blocked',
          tone: 'warn',
          label: `Pull ${commitCount(behind)}`,
          sublabel,
          reason: `${s.dirty_files} uncommitted file(s) on the host. Commit or stash there before pulling.`,
          verb: null,
        };
      }

      if (behind > 0) {
        const blocked = verbBlocked(gates, 'sync');
        if (blocked) {
          const { tone, reason } = blocked;
          return { action: 'blocked', tone, label: `Pull ${commitCount(behind)}`, sublabel, reason, verb: null };
        }
        return { action: 'ready', tone: 'none', label: `Pull ${commitCount(behind)}`, sublabel, verb: 'pull' };
      }

      if (ahead > 0) {
        // Dirty does NOT block this branch (rule 10's doc comment above) —
        // pushing moves a remote ref and never touches the working tree.
        const blocked = verbBlocked(gates, 'push');
        if (blocked) {
          const { tone, reason } = blocked;
          return { action: 'blocked', tone, label: `Push ${commitCount(ahead)}`, sublabel, reason, verb: null };
        }
        return { action: 'ready', tone: 'none', label: `Push ${commitCount(ahead)}`, sublabel, verb: 'push' };
      }

      // Nothing ahead, nothing behind, but the tree is dirty: a commit is
      // offered plainly, ahead of the freshness rung below. No `reason` line
      // — unlike rule 8's commit offer, nothing else is being unblocked by
      // it, so there is nothing more to say than the button already says.
      // Falls through to today's behavior (rule 11, below) when the commit
      // gate is blocked, rather than surfacing a new dead end of its own.
      if (s.dirty_files > 0) {
        const commitBlocked = verbBlocked(gates, 'commit');
        if (!commitBlocked) {
          return {
            action: 'ready',
            tone: 'none',
            label: `Commit ${fileCount(s.dirty_files)}`,
            sublabel,
            verb: 'commit',
          };
        }
      }

      const blocked = verbBlocked(gates, 'sync');
      if (blocked) {
        const { tone, reason } = blocked;
        return { action: 'blocked', tone, label: 'Fetch origin', sublabel, reason, verb: null };
      }
      return { action: 'ready', tone: 'none', label: 'Fetch origin', sublabel, verb: 'fetch' };
    }

    default: {
      // The binding still does its compile-time job — a fifth `Position`
      // variant added to THIS FILE's own union fails to compile here. It is
      // only a compile-time guard, though: it cannot see a variant the
      // ENGINE starts sending that this file's types don't describe yet.
      // `return exhaustive` would return the raw wire object as if it were a
      // `CardModel` — `TONE_BG[undefined]`, garbage rendered as the reason.
      // A real, neutral `CardModel` is the honest degrade: this app doesn't
      // recognise the state, so it says that, rather than guessing or
      // crashing.
      const exhaustive: never = s.position;
      void exhaustive;
      return {
        action: 'blocked',
        tone: 'neutral',
        label: 'Unknown state',
        sublabel,
        reason: 'This app doesn’t recognize this repository’s state yet. Update the app to see git actions here.',
        verb: null,
      };
    }
  }
}
