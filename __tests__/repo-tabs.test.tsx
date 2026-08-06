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
