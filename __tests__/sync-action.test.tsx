import { render, screen, within } from '@testing-library/react-native';

import { ModuleList, syncLabel } from '@/components/module-list';
import type { Composition, SyncReport } from '@/lib/daemon/types';

const composition: Composition = {
  operators: [{ name: 'tycho', path: 'operators/tycho' }],
  commons: [{ name: 'zojercommons', path: 'zojercommons' }],
  repos: [{ name: 'jianyi', path: 'repos/jianyi' }],
  protocols: [],
  manifests: [],
  protocol_sources: [],
};

function report(overrides: Partial<SyncReport> = {}): SyncReport {
  return {
    enabled: true,
    fetched: true,
    repos: [
      { name: 'tycho', path: 'operators/tycho', branch: 'main', status: 'synced', commits: 2 },
      { name: 'zojercommons', path: 'zojercommons', branch: 'main', status: 'current' },
      {
        name: 'jianyi',
        path: 'repos/jianyi',
        branch: 'feat/x',
        status: 'skipped',
        reason: 'no-upstream',
      },
    ],
    not_composed: [],
    ...overrides,
  };
}

describe('syncLabel', () => {
  it('names what happened, not what the status enum is called', () => {
    expect(syncLabel({ name: '', path: '', status: 'synced', commits: 2 })).toBe('+2');
    expect(syncLabel({ name: '', path: '', status: 'behind', commits: 5 })).toBe('behind 5');
    expect(syncLabel({ name: '', path: '', status: 'current' })).toBe('current');
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'dirty' })).toBe('dirty');
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'no-upstream' })).toBe(
      'no upstream',
    );
    expect(syncLabel({ name: '', path: '', status: 'error' })).toBe('error');
  });

  it('humanizes every skip/error reason on the wire, not just no-upstream', () => {
    // The five reasons never exercised before are exactly why task-failed
    // shipped as literal enum text. All seven, named here.
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'dirty' })).toBe('dirty');
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'diverged' })).toBe(
      'diverged',
    );
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'no-upstream' })).toBe(
      'no upstream',
    );
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'detached' })).toBe(
      'detached HEAD',
    );
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'timeout' })).toBe(
      'timed out',
    );
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'git-error' })).toBe(
      'git error',
    );
    expect(syncLabel({ name: '', path: '', status: 'skipped', reason: 'task-failed' })).toBe(
      'failed',
    );
    expect(
      syncLabel({ name: '', path: '', status: 'error', reason: 'timeout' }),
    ).toBe('timed out');
  });
});

describe('ModuleList with a sync report', () => {
  it('puts each repo status on its own row', async () => {
    await render(<ModuleList composition={composition} hostLabel="stjerneborg" sync={report()} />);
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('current')).toBeTruthy();
    expect(screen.getByText('no upstream')).toBeTruthy();
  });

  it('puts each repo status on the row it belongs to', async () => {
    await render(
      <ModuleList composition={composition} hostLabel="stjerneborg" sync={report()} />,
    );
    // Scoped to the row. An unscoped getByText proves only that the string
    // exists somewhere, which a wrong-row bug satisfies just as well.
    expect(
      within(screen.getByTestId('module-row-operators/tycho')).getByText('+2'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('module-row-repos/jianyi')).getByText('no upstream'),
    ).toBeTruthy();
  });

  it('renders without a report at all', async () => {
    // The screen loads composition and sync independently; the list must not
    // wait on the second to render the first.
    await render(<ModuleList composition={composition} hostLabel="stjerneborg" />);
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.queryByText('current')).toBeNull();
  });

  it('says the statuses are stale when nothing was fetched', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({ fetched: false })}
      />,
    );
    expect(screen.getByText(/as of last sync/i)).toBeTruthy();
  });

  it('does not claim staleness when the report was actually fetched', async () => {
    // report() defaults to fetched: true.
    await render(
      <ModuleList composition={composition} hostLabel="stjerneborg" sync={report()} />,
    );
    expect(screen.queryByText(/as of last sync/i)).toBeNull();
  });

  it('shows the Sync action when the host declares the gate', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report()}
        onSync={() => {}}
      />,
    );
    expect(screen.getByTestId('sync-action')).toBeTruthy();
  });

  it('hides the Sync action when the host has not declared the gate', async () => {
    // D9: a button that always errors is worse than an absent one.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({ enabled: false })}
        onSync={() => {}}
      />,
    );
    expect(screen.queryByTestId('sync-action')).toBeNull();
  });

  it('says which repos have submodules it did not update', async () => {
    // D5 is a deliberate limit. Unstated, it is indistinguishable from the
    // sweep having silently half-worked.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            {
              name: 'armillary-site',
              path: 'repos/armillary-site',
              status: 'synced',
              commits: 1,
              submodules: true,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/submodules not updated/i)).toBeTruthy();
    expect(screen.getByText(/armillary-site/)).toBeTruthy();
  });

  it('surfaces a checkout that is on disk and in no manifest', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({ not_composed: [{ path: 'operators/ariadne' }] })}
      />,
    );
    expect(screen.getByText(/operators\/ariadne/)).toBeTruthy();
    expect(screen.getByText(/not composed/i)).toBeTruthy();
  });
});
