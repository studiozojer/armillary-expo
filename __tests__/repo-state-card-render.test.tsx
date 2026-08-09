import { readFileSync } from 'fs';
import { join } from 'path';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RepoStateCard } from '../src/components/repo-state-card';
import { ICONS } from '../src/components/ui/icon';
import type { RepoState } from '../src/lib/daemon/types';
import { themeFor } from '../src/theme';

// toJSON()'s tree is the only stable way to reach the host SymbolView node's
// props — same approach __tests__/ui-icon.test.tsx and __tests__/tree-list.test.tsx
// use. The component under test does not expose testID on Icon calls (and should not —
// testID is not a general concern of the component), so we query the rendered tree.
type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function findAllByType(node: JsonNode | null, type: string, out: JsonNode[] = []): JsonNode[] {
  if (!node) return out;
  if (node.type === type) out.push(node);
  for (const child of node.children ?? []) {
    findAllByType(child, type, out);
  }
  return out;
}

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

  it('a ready "commit" card is ENABLED and relays exactly "commit" — never the old push fallback', async () => {
    // Task 7 (`repo-state-card.ts`) can return `action: 'ready', verb:
    // 'commit'` (a dirty tree, gates all granted). Before Task 8 this button
    // was DISABLED by a deliberate guard, because `repo/[name].tsx`'s
    // `onAction` back then mapped any verb it didn't recognise to
    // `pushRepo`'s `else` branch — an unguarded tap would have silently
    // pushed. Task 8 removed that guard on both ends: this card no longer
    // special-cases `'commit'` at all (it relays whatever `stateCard` handed
    // it, exactly like every other ready verb), and `repo/[name].tsx`'s
    // `onAction` is now a total, exhaustive router that sends `'commit'` to
    // the Changes tab rather than falling through to a POST (see
    // `repo-screen.test.tsx`'s own test proving that route never reaches
    // `pushRepo` or any other mutating request).
    //
    // What THIS test still guards, at the card's own boundary: the verb
    // relayed on a press is the LITERAL string `'commit'`, never `'push'`
    // (or anything else) — a future regression that reintroduces a
    // cast-to-push here would go red on the `toHaveBeenCalledWith('commit')`
    // line below before a single request could fire.
    const onAction = jest.fn();
    const dirty = repo({ dirty_files: 3 });
    // `rerender` on ONE instance, not a second `render` — two independent
    // mounts each need their own unmount to avoid overlapping `act()` calls,
    // and the point here is the SAME wiring proven live on a second verb
    // too (prove-the-instrument's other half — a mock that only ever saw
    // `'commit'` above could still belong to a control nobody ever presses).
    const { getByTestId, rerender } = await render(
      <RepoStateCard state={dirty} gates={OPEN} onAction={onAction} />,
    );
    const commitButton = getByTestId('repo-state-card-action');
    expect(commitButton.props.accessibilityState).toMatchObject({ disabled: false });
    // Awaited — this button is enabled now (unlike before Task 8), so the
    // press actually flushes a state update; leaving it unawaited raced the
    // `rerender` just below into an overlapping `act()` scope.
    await fireEvent.press(commitButton);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('commit');
    expect(onAction).not.toHaveBeenCalledWith('push');

    const behind = repo({ position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 2 } });
    await rerender(<RepoStateCard state={behind} gates={OPEN} onAction={onAction} />);
    const pullButton = getByTestId('repo-state-card-action');
    expect(pullButton.props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(pullButton);
    expect(onAction).toHaveBeenCalledWith('pull');
  });

  it('the action glyph follows the verb: a behind repo renders the pull glyph, not sync (design D1)', async () => {
    // Behind state: model.icon is 'pullVerb', with iOS symbol 'arrow.down.to.line'.
    // The component reads model.icon to the Icon; verify by checking rendered SymbolView nodes.
    await render(
      <RepoStateCard state={repo({ position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 2 } })} gates={OPEN} />,
    );
    const symbols = findAllByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule').map(
      (node) => node.props.name,
    );
    // Pull glyph must be present.
    expect(symbols).toContain(ICONS.pullVerb.ios);
    // Sync glyph appears once (branch chevron), not in the action button.
    const syncSymbols = symbols.filter((name) => name === ICONS.sync.ios);
    const pullSymbols = symbols.filter((name) => name === ICONS.pullVerb.ios);
    expect(pullSymbols.length).toBeGreaterThan(0);
    expect(syncSymbols).toHaveLength(0);
  });
});
