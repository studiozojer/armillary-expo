import { readFileSync } from 'fs';
import { join } from 'path';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RepoStateCard } from '../src/components/repo-state-card';
import type { RepoState } from '../src/lib/daemon/types';
import { themeFor } from '../src/theme';

function repo(overrides: Partial<RepoState> = {}): RepoState {
  return {
    name: 'jianyi',
    path: 'repos/jianyi',
    branch: 'main',
    position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
    dirty_files: 0,
    worktrees: 0,
    submodules: false,
    ...overrides,
  };
}

const OPEN = { enabled: 'granted' as const, pushEnabled: 'granted' as const, commitEnabled: 'granted' as const, device: 'enrolled' as const };
const CLOSED = { enabled: 'refused' as const, pushEnabled: 'refused' as const, commitEnabled: 'refused' as const, device: 'enrolled' as const };

describe('<RepoStateCard>', () => {
  it('shows the branch label and name', async () => {
    await render(<RepoStateCard state={repo()} gates={OPEN} />);
    expect(screen.getByText('Current branch')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
  });

  it('falls back to "(detached)" when there is no branch name', async () => {
    await render(
      <RepoStateCard
        state={repo({ branch: undefined, position: { kind: 'detached' } })}
        gates={OPEN}
      />,
    );
    expect(screen.getByText('(detached)')).toBeTruthy();
  });

  it('reads the branch cell as an em dash on read_error, never "(detached)" — C1', async () => {
    // `branch` is `undefined` here for the SAME reason it is for a real
    // detached HEAD (`read_error` sets it as a type default before
    // `status_v2` ever runs) — a card reading the raw field cannot tell the
    // two apart and asserts a detached HEAD the engine never measured. The
    // regression this guards: reverting to `state.branch ?? '(detached)'`
    // makes "(detached)" reappear here, next to "Repo unreadable".
    await render(
      <RepoStateCard
        state={repo({ branch: undefined, position: { kind: 'detached' }, read_error: 'not a git repository' })}
        gates={OPEN}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('(detached)')).toBeNull();
    expect(screen.getByText('Repo unreadable')).toBeTruthy();
  });

  it('a ready action is enabled and calls back with its verb', async () => {
    const onAction = jest.fn();
    await render(<RepoStateCard state={repo()} gates={OPEN} onAction={onAction} />);
    const button = screen.getByTestId('repo-state-card-action');
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledWith('fetch');
    expect(screen.queryByTestId('repo-state-card-reason')).toBeNull();
    expect(screen.queryByTestId('repo-state-card-progress')).toBeNull();
  });

  it('a blocked action is disabled, does not call back, and shows the reason on a tinted ground', async () => {
    const onAction = jest.fn();
    const theme = themeFor('light');
    await render(<RepoStateCard state={repo()} gates={CLOSED} onAction={onAction} />);
    const button = screen.getByTestId('repo-state-card-action');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onAction).not.toHaveBeenCalled();

    const reason = screen.getByTestId('repo-state-card-reason');
    expect(reason).toBeTruthy();
    // neutral tone -> bg/secondary
    const style = StyleSheet.flatten(reason.props.style) as Record<string, unknown>;
    expect(style.backgroundColor).toBe(theme.color.bgSecondary);
  });

  it('busy: labels the in-flight verb, disables the action, and shows the progress track', async () => {
    await render(<RepoStateCard state={repo()} gates={OPEN} inFlight="fetch" />);
    expect(screen.getByText('Fetching…')).toBeTruthy();
    expect(screen.getByTestId('repo-state-card-action').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByTestId('repo-state-card-progress')).toBeTruthy();
  });

  it('the branch chevron is a separate, permanently disabled control with no handler', async () => {
    const onAction = jest.fn();
    // Wired to the real render, unlike a mock declared and never passed in —
    // otherwise "not called" is true of a function nothing could ever call.
    await render(<RepoStateCard state={repo()} gates={OPEN} onAction={onAction} />);
    const chevron = screen.getByTestId('repo-state-card-branch-chevron');
    expect(chevron.props.accessibilityState).toMatchObject({ disabled: true });
    // Pressing it must not reach the action callback — it is a different
    // control, not a second way to trigger the same verb. This alone does
    // NOT prove nothing else could fire (see the structural test below for
    // why, and for the check that actually closes that gap).
    fireEvent.press(chevron);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('the chevron\'s disabled state and its accessibility announcement come from ONE identifier', () => {
    // Review's own mutation-test found the real gap here, and it is worth
    // recording precisely: `getByTestId` on a `Pressable` resolves to the
    // underlying host `View` (confirmed: its rendered `type` is `'View'`,
    // and its prop keys are `onResponderGrant`/`onResponderRelease`/etc, not
    // a literal `onPress`) — Pressable never forwards `onPress` to the host
    // node AT ALL, wired or not, disabled or not. So `chevron.props.onPress`
    // is `undefined` unconditionally and CANNOT be reddened by any mutation,
    // including adding a real `onPress` — verified empirically before this
    // test was written, rather than assumed. Asserting it would be exactly
    // the kind of claim-with-nothing-behind-it this review thread exists to
    // catch, so it is not asserted here.
    //
    // What actually closes the gap is structural, not behavioral: the two
    // props that could drift (the real `disabled` gate and the
    // `accessibilityState` announcement of it) must read the SAME
    // identifier, not two literals that happen to agree today. A future
    // `onPress` added to this control (branch-picking landing) does nothing
    // observable as long as that identifier stays `true` — real React
    // Native Pressable behavior, not this test's own claim — and the two
    // values can no longer disagree once there is only one of them to read.
    const source = readFileSync(
      join(__dirname, '..', 'src', 'components', 'repo-state-card.tsx'),
      'utf8',
    );
    const chevronBlock = source.slice(
      source.indexOf('branch-chevron'),
      source.indexOf('</Pressable>', source.indexOf('branch-chevron')),
    );
    const match = chevronBlock.match(
      /disabled=\{(\w+)\}[\s\S]*?accessibilityState=\{\{\s*disabled:\s*(\w+)\s*\}\}/,
    );
    expect(match).not.toBeNull();
    const [, disabledRef, announcedRef] = match as RegExpMatchArray;
    // Must be a shared VARIABLE, not two literal `true`s that are merely
    // textually identical — those would satisfy a naive "same text" check
    // while still being two independent hardcodes.
    expect(disabledRef).not.toBe('true');
    expect(disabledRef).not.toBe('false');
    expect(disabledRef).toBe(announcedRef);
  });

  it('tone none renders no reason row even when blocked-adjacent facts exist', async () => {
    // ready + clean + gates open never has a tone, by construction — this
    // guards the render side of that, not just stateCard's own unit test.
    await render(<RepoStateCard state={repo()} gates={OPEN} />);
    expect(screen.queryByTestId('repo-state-card-reason')).toBeNull();
  });

  it('a ready "commit" card is announced disabled and does not call back — the guard against the push misfire', async () => {
    // Task 7 (`repo-state-card.ts`) can now return `action: 'ready', verb:
    // 'commit'` (a dirty tree, gates all granted). `onAction` here still only
    // knows `'fetch' | 'pull' | 'push'`, and `repo/[name].tsx`'s `onAction`
    // maps any unrecognised verb to `pushRepo` — so an unguarded commit tap
    // would silently push. `not.toHaveBeenCalled()` alone would pass for a
    // dead harness too (a mock wired to nothing never fires either) — same
    // gap this file's chevron test names explicitly — so the SAME wiring is
    // proven live below on a 'pull'-ready card, which DOES fire. The silence
    // above is only evidence because the wiring underneath it is proven to
    // work at all.
    const onAction = jest.fn();
    const dirty = repo({ dirty_files: 3 });
    // `rerender` on ONE instance, not a second `render` — two independent
    // mounts each need their own unmount to avoid overlapping `act()` calls,
    // and the point here is the SAME wiring proven live, not a fresh one.
    const { getByTestId, rerender } = await render(
      <RepoStateCard state={dirty} gates={OPEN} onAction={onAction} />,
    );
    const commitButton = getByTestId('repo-state-card-action');
    expect(commitButton.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(commitButton);
    expect(onAction).not.toHaveBeenCalled();

    const behind = repo({ position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 2 } });
    await rerender(<RepoStateCard state={behind} gates={OPEN} onAction={onAction} />);
    const pullButton = getByTestId('repo-state-card-action');
    expect(pullButton.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(pullButton);
    expect(onAction).toHaveBeenCalledWith('pull');
  });
});
