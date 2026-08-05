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

const OPEN = { enabled: true, pushEnabled: true };
const CLOSED = { enabled: false, pushEnabled: false };

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
    // control, not a second way to trigger the same verb.
    fireEvent.press(chevron);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('tone none renders no reason row even when blocked-adjacent facts exist', async () => {
    // ready + clean + gates open never has a tone, by construction — this
    // guards the render side of that, not just stateCard's own unit test.
    await render(<RepoStateCard state={repo()} gates={OPEN} />);
    expect(screen.queryByTestId('repo-state-card-reason')).toBeNull();
  });
});
