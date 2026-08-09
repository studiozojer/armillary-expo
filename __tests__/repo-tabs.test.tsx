import { fireEvent, render, screen } from '@testing-library/react-native';

import { commitAge, RepoTabs } from '../src/components/repo-tabs';
import type { ChangedFile, Commit } from '../src/lib/daemon/types';

function commit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: 'abc123',
    subject: 'router: name our own boot file',
    author: 'tycho',
    date: new Date().toISOString(),
    unpushed: false,
    ...overrides,
  };
}

const CHANGES: ChangedFile[] = [
  { path: 'crates/armillary-engine/src/git.rs', change: 'modified', staged: false },
  { path: 'crates/armillary-engine/src/repos.rs', change: 'added', staged: true },
];

describe('<RepoTabs> — default tab', () => {
  it('opens on History, not Changes, when both have content', async () => {
    // The rule this guards: a clean repo's Changes tab is always empty, and
    // opening THERE would read as broken. Flipping the initial `useState`
    // to 'changes' makes this red — the History-only row disappears and the
    // Changes-only rows appear in its place.
    await render(<RepoTabs commits={[commit()]} changes={CHANGES} />);
    expect(screen.getByText('router: name our own boot file')).toBeTruthy();
    expect(screen.queryByText('crates/armillary-engine/src/git.rs')).toBeNull();
    expect(screen.getByTestId('repo-tabs-history-tab').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('repo-tabs-changes-tab').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('switches to Changes on tap, and back', async () => {
    await render(<RepoTabs commits={[commit()]} changes={CHANGES} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));
    expect(screen.getByText('crates/armillary-engine/src/git.rs')).toBeTruthy();
    expect(screen.queryByText('router: name our own boot file')).toBeNull();

    await fireEvent.press(screen.getByTestId('repo-tabs-history-tab'));
    expect(screen.getByText('router: name our own boot file')).toBeTruthy();
    expect(screen.queryByText('crates/armillary-engine/src/git.rs')).toBeNull();
  });
});

describe('<RepoTabs> — Changes tab label', () => {
  it('carries a count when there are changes', async () => {
    await render(<RepoTabs commits={[]} changes={CHANGES} />);
    expect(screen.getByText('Changes (2)')).toBeTruthy();
  });

  it('carries no count, and no parens, when clean', async () => {
    await render(<RepoTabs commits={[]} changes={[]} />);
    expect(screen.getByText('Changes')).toBeTruthy();
    expect(screen.queryByText(/Changes \(/)).toBeNull();
  });
});

describe('<RepoTabs> — empty states', () => {
  it('"No commits yet." on an empty History tab', async () => {
    await render(<RepoTabs commits={[]} changes={[]} />);
    expect(screen.getByText('No commits yet.')).toBeTruthy();
  });

  it('"No uncommitted changes." on an empty Changes tab', async () => {
    await render(<RepoTabs commits={[]} changes={[]} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));
    expect(screen.getByText('No uncommitted changes.')).toBeTruthy();
  });
});

describe('<RepoTabs> — the unpushed marker', () => {
  it('renders ONLY on a commit not yet on the upstream', async () => {
    await render(
      <RepoTabs
        commits={[commit({ sha: 'a', unpushed: true }), commit({ sha: 'b', unpushed: false })]}
        changes={[]}
      />,
    );
    // Two history rows, one marker. If the marker were rendered
    // unconditionally (dropping the `commit.unpushed ?` guard), the second
    // assertion goes red — testID `repo-tabs-history-1-unpushed` would exist
    // too.
    expect(screen.getByTestId('repo-tabs-history-0-unpushed')).toBeTruthy();
    expect(screen.queryByTestId('repo-tabs-history-1-unpushed')).toBeNull();
  });
});

describe('<RepoTabs> — Changes rows are read-only', () => {
  // A `role`-based query (the shape this test used to take) does NOT catch a
  // bare `<Pressable onPress={...}>` wrapping a row's content: RN's
  // `Pressable` sets no `accessibilityRole` at all unless one is passed, so
  // a `queryAllByRole('button')` count of `0` stays `0` even after that
  // affordance is added — reviewer-confirmed by mutation test. What DOES
  // appear on the underlying host node whenever ANY `Pressable` wraps
  // something, role or no role, is its set of responder handlers
  // (`onStartShouldSetResponder`, `onResponderGrant`, `onResponderRelease`,
  // `onClick`) — the same fact `repo-state-card-render.test.tsx`'s own
  // comment names for exactly this reason. This walks each row's subtree
  // for that, not for a role.
  function hasResponderHandlers(root: ReturnType<typeof screen.getByTestId>): boolean {
    return (
      root.queryAll(
        (node) => typeof node.props?.onStartShouldSetResponder === 'function',
        { includeSelf: true },
      ).length > 0
    );
  }

  it('offers no button anywhere — no checkbox, no selection, no commit affordance', async () => {
    // History is the default tab (a separate rule, covered above) — switch
    // to Changes first so its rows actually exist to inspect.
    await render(<RepoTabs commits={[commit()]} changes={CHANGES} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));
    expect(hasResponderHandlers(screen.getByTestId('repo-tabs-change-0'))).toBe(false);
    expect(hasResponderHandlers(screen.getByTestId('repo-tabs-change-1'))).toBe(false);

    await fireEvent.press(screen.getByTestId('repo-tabs-history-tab'));
    expect(hasResponderHandlers(screen.getByTestId('repo-tabs-history-0'))).toBe(false);

    // The two tabs remain the only interactive elements this component ever
    // draws.
    expect(hasResponderHandlers(screen.getByTestId('repo-tabs-changes-tab'))).toBe(true);
    expect(hasResponderHandlers(screen.getByTestId('repo-tabs-history-tab'))).toBe(true);
  });
});

describe('<RepoTabs> — the commit form (Task 8)', () => {
  it('appears above the file list when onCommit is provided', async () => {
    await render(<RepoTabs commits={[]} changes={CHANGES} onCommit={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));

    expect(screen.getByTestId('commit-message-input')).toBeTruthy();
    expect(screen.getByText('Commit 2 files')).toBeTruthy();
  });

  it('the button is disabled until the message is non-empty', async () => {
    // Prove-the-instrument (per-repo-git's own idiom): a mock that THROWS
    // when called, not a plain `jest.fn()`. `not.toHaveBeenCalled()` alone
    // would pass for a dead harness too — a control wired to nothing never
    // fires either — so the disabled half's "silence" is only evidence
    // because the SAME wiring is proven live below, once the message is
    // non-empty. And the check itself goes through `fireEvent.press`, never
    // `button.props.onPress` — Pressable never forwards `onPress` to the
    // host node RN's test harness resolves `getByTestId` to, so an
    // assertion on that prop cannot fail regardless of what actually
    // happens on a tap.
    const onCommit = jest.fn((message: string) => {
      throw new Error(`onCommit fired with: ${message}`);
    });
    await render(<RepoTabs commits={[]} changes={CHANGES} onCommit={onCommit} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));

    const button = screen.getByTestId('commit-action');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    // Silence: a disabled `Pressable` never invokes `onPress` at all, so the
    // throwing mock never runs — `fireEvent.press` here is async (this
    // harness's own `render`/`fireEvent` are awaited throughout this file),
    // so a plain `await` is the "did not throw" assertion: a rejection would
    // surface right here and fail the test.
    await fireEvent.press(button);
    expect(onCommit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('commit-message-input'), 'msg');
    const enabled = screen.getByTestId('commit-action');
    expect(enabled.props.accessibilityState).toMatchObject({ disabled: false });
    // Live: the identical wiring now reaches the handler, and the throw it
    // raises surfaces as a REJECTED promise (same reasoning
    // `preferences-provider.test.tsx` uses for its own thrown-during-render
    // case) — proof the silence above was the control, not a harness that
    // could never fire.
    await expect(fireEvent.press(enabled)).rejects.toThrow('onCommit fired with: msg');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('msg');
  });

  it('no form renders when onCommit is absent', async () => {
    // Ungated device (or any caller that hasn't wired the verb yet): the
    // read-only rows render exactly as they did before this task, and the
    // commit affordance simply doesn't exist rather than appearing disabled.
    await render(<RepoTabs commits={[]} changes={CHANGES} />);
    await fireEvent.press(screen.getByTestId('repo-tabs-changes-tab'));

    expect(screen.queryByTestId('commit-message-input')).toBeNull();
    expect(screen.queryByTestId('commit-action')).toBeNull();
    expect(screen.getByTestId('repo-tabs-change-0-marker')).toBeTruthy();
    expect(screen.getByTestId('repo-tabs-change-1-marker')).toBeTruthy();
  });

  it('opens directly on Changes when initialTab is set — the card-tap route', async () => {
    // `repo/[name].tsx` forces this on a `'commit'` tap of the State Card
    // (a remount keyed off `changesFocus`, seeding this prop) rather than
    // reaching into `RepoTabs`'s own tab state some other way.
    await render(<RepoTabs commits={[commit()]} changes={CHANGES} initialTab="changes" />);
    expect(screen.getByTestId('repo-tabs-changes-tab').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByText('crates/armillary-engine/src/git.rs')).toBeTruthy();
  });
});

describe('commitAge', () => {
  const now = new Date(2026, 7, 5, 12, 0);

  function minutesAgo(n: number): string {
    return new Date(now.getTime() - n * 60000).toISOString();
  }

  it('reads minutes, hours, yesterday and days distinctly', () => {
    expect(commitAge(minutesAgo(0), now)).toBe('just now');
    expect(commitAge(minutesAgo(2), now)).toBe('2 min ago');
    expect(commitAge(minutesAgo(90), now)).toBe('1 hr ago');
    expect(commitAge(minutesAgo(60 * 26), now)).toBe('yesterday');
    expect(commitAge(minutesAgo(60 * 24 * 3), now)).toBe('3 days ago');
  });
});
