import type { ActionErrorKind, RepoState } from './daemon/types';
import { relative } from './repo-label';

export type CardAction = 'ready' | 'blocked' | 'busy';
export type CardTone = 'none' | 'neutral' | 'warn' | 'error';

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
  verb: 'fetch' | 'pull' | 'push' | null;
};

/**
 * Copy for a failed write verb, one row per `ActionErrorKind`.
 *
 * `Record<ActionErrorKind, …>` on purpose — the same idiom `repo-label.ts`'s
 * `ACTION_ERROR` uses, for the same reason: a sixth kind the engine starts
 * sending is a compile error here, not a card silently rendering nothing.
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

/** Shown when a verb would otherwise run but the host has not granted `sync`. */
const SYNC_NOT_GRANTED =
  'This host has not granted git authority (the "sync" grant). Ask the host to enable it.';

/** Shown when push specifically would otherwise run but `push` is not granted. */
const PUSH_NOT_GRANTED =
  'Push is not granted on this host (a separate "push" grant from "sync"). Ask the host to enable it.';

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
 *    friction state, named plainly.
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
  gates: { enabled: boolean; pushEnabled: boolean },
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
      reason: s.read_error,
      verb: null,
    };
  }

  if (s.action_error) {
    const ae = ACTION_ERROR_CARD[s.action_error.kind];
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
        return {
          action: 'blocked',
          tone: 'warn',
          label: `Pull ${behind} commits`,
          sublabel,
          reason: `${s.dirty_files} uncommitted file(s) on the host. Commit or stash there before pulling.`,
          verb: null,
        };
      }

      if (behind > 0) {
        if (!gates.enabled) {
          return {
            action: 'blocked',
            tone: 'neutral',
            label: `Pull ${behind} commits`,
            sublabel,
            reason: SYNC_NOT_GRANTED,
            verb: null,
          };
        }
        return { action: 'ready', tone: 'none', label: `Pull ${behind} commits`, sublabel, verb: 'pull' };
      }

      if (ahead > 0) {
        // Dirty does NOT block this branch (rule 10's doc comment above) —
        // pushing moves a remote ref and never touches the working tree.
        if (!gates.pushEnabled) {
          return {
            action: 'blocked',
            tone: 'neutral',
            label: `Push ${ahead} commits`,
            sublabel,
            reason: PUSH_NOT_GRANTED,
            verb: null,
          };
        }
        return { action: 'ready', tone: 'none', label: `Push ${ahead} commits`, sublabel, verb: 'push' };
      }

      if (!gates.enabled) {
        return {
          action: 'blocked',
          tone: 'neutral',
          label: 'Fetch origin',
          sublabel,
          reason: SYNC_NOT_GRANTED,
          verb: null,
        };
      }
      return { action: 'ready', tone: 'none', label: 'Fetch origin', sublabel, verb: 'fetch' };
    }

    default: {
      const exhaustive: never = s.position;
      return exhaustive;
    }
  }
}
