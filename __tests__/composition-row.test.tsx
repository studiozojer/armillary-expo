import { render, screen, within } from '@testing-library/react-native';

import { ModuleList } from '@/components/module-list';
import type { Composition, RepoState } from '@/lib/daemon/types';

const composition: Composition = {
  operators: [{ name: 'tycho', path: 'operators/tycho' }],
  commons: [{ name: 'zojercommons', path: 'zojercommons' }],
  repos: [{ name: 'jianyi', path: 'repos/jianyi' }],
  protocols: [],
  manifests: [],
  protocol_sources: [],
};

function repo(overrides: Partial<RepoState> & Pick<RepoState, 'name' | 'path'>): RepoState {
  return {
    position: { kind: 'tracking', upstream: 'origin/main', ahead: 0, behind: 0 },
    dirty_files: 0,
    worktrees: 0,
    submodules: false,
    ...overrides,
  };
}

describe('ModuleList with a repo state', () => {
  it('puts each row status on the row it belongs to', async () => {
    // Scoped to the row. An unscoped getByText proves only that the string
    // exists somewhere, which a wrong-row bug satisfies just as well.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        repos={[
          repo({ name: 'tycho', path: 'operators/tycho', dirty_files: 4 }),
          repo({ name: 'zojercommons', path: 'zojercommons' }),
          repo({
            name: 'jianyi',
            path: 'repos/jianyi',
            position: { kind: 'no-upstream' },
          }),
        ]}
      />,
    );
    expect(
      within(screen.getByTestId('module-row-operators/tycho')).getByText('4 changed'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('module-row-repos/jianyi')).getByText('no upstream'),
    ).toBeTruthy();
  });

  it('renders without any repo state at all', async () => {
    // The screen loads composition and repos independently; the list must
    // not wait on the second to render the first.
    await render(<ModuleList composition={composition} hostLabel="stjerneborg" />);
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.queryByText('no upstream')).toBeNull();
  });

  it('shows the Fetch all action when the host declares the gate', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        reposEnabled
        onFetchAll={() => {}}
      />,
    );
    expect(screen.getByTestId('fetch-all-action')).toBeTruthy();
    expect(screen.getByText('Fetch all')).toBeTruthy();
  });

  it('hides the Fetch all action when the host has not declared the gate', async () => {
    // D9: a button that always errors is worse than an absent one.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        reposEnabled={false}
        onFetchAll={() => {}}
      />,
    );
    expect(screen.queryByTestId('fetch-all-action')).toBeNull();
  });

  it('shows an error line when the last fetch-all attempt failed', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        reposEnabled
        onFetchAll={() => {}}
        fetchError="This host has not granted fetch."
      />,
    );
    expect(screen.getByText('This host has not granted fetch.')).toBeTruthy();
  });

  it('shows no error line when nothing has failed', async () => {
    await render(
      <ModuleList composition={composition} hostLabel="stjerneborg" reposEnabled onFetchAll={() => {}} />,
    );
    expect(screen.queryByText(/has not granted/i)).toBeNull();
  });

  // --- not_composed is a bare string array on the wire, not {path}[] ---

  it('surfaces a checkout that is on disk and in no manifest, as a plain string', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        notComposed={['operators/ariadne']}
      />,
    );
    // Rendering `.map(n => n.path)` against a `string[]` produces literal
    // "undefined" for every entry — this asserts the actual path text is on
    // screen, which that regression would not satisfy.
    expect(screen.getByText(/operators\/ariadne/)).toBeTruthy();
    expect(screen.getByText(/not composed/i)).toBeTruthy();
  });

  it('says which repos have submodules that were not updated', async () => {
    // D5 is a deliberate limit. Unstated, it is indistinguishable from the
    // sweep having silently half-worked.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        repos={[repo({ name: 'armillary-site', path: 'repos/armillary-site', submodules: true })]}
      />,
    );
    expect(screen.getByText(/Submodules not updated:.*armillary-site/)).toBeTruthy();
  });

  // --- the router root is swept but never rendered as a module row ---

  it('says the router root was swept, even though it has no module row', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        repos={[
          repo({ name: 'tycho', path: 'operators/tycho' }),
          repo({
            name: 'armillary',
            path: '.',
            position: { kind: 'tracking', upstream: 'origin/main', ahead: 2, behind: 0 },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Also swept:.*armillary \(root\).*↑2 ↓0/)).toBeTruthy();
  });

  it('is silent when every swept repo has a rendered row', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        repos={[repo({ name: 'tycho', path: 'operators/tycho' })]}
      />,
    );
    expect(screen.queryByText(/Also swept/)).toBeNull();
  });
});
