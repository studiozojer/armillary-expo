import { render, screen, within } from '@testing-library/react-native';

import {
  describeOrphans,
  fetchFailureSummary,
  ModuleList,
  newestCommitLabel,
  rowNote,
  syncLabel,
  trailingLabel,
} from '@/components/module-list';
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
    // Scoped to the submodules line specifically: this fixture's
    // armillary-site isn't in `composition.repos` either, so it now also
    // shows up on the "Also swept" orphan line (item 3) — an unscoped
    // getByText would match both and fail on ambiguity rather than on
    // absence, which proves nothing about which line actually said it.
    expect(screen.getByText(/Submodules not updated:.*armillary-site/)).toBeTruthy();
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

  // --- Item 1: a totally failed sweep must not read as a totally successful one ---

  it('does not report current when the fetch failed', async () => {
    // `fetched: true` only ever meant "a sweep was requested" — verdict here
    // was computed against refs that were never refreshed. Showing "current"
    // would be the report lying with a straight face.
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            {
              name: 'zojercommons',
              path: 'zojercommons',
              branch: 'main',
              status: 'current',
              fetch_error: 'connect ETIMEDOUT',
            },
          ],
        })}
      />,
    );
    const row = within(screen.getByTestId('module-row-zojercommons'));
    expect(row.getByText('fetch failed')).toBeTruthy();
    expect(row.queryByText('current')).toBeNull();
  });

  it('counts fetch failures in the header, near the staleness line', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            { name: 'tycho', path: 'operators/tycho', status: 'current' },
            { name: 'zojercommons', path: 'zojercommons', status: 'current', fetch_error: 'x' },
            { name: 'jianyi', path: 'repos/jianyi', status: 'current' },
          ],
        })}
      />,
    );
    expect(screen.getByText('1 of 3 could not fetch')).toBeTruthy();
  });

  it('says nothing about fetch failures when there are none', async () => {
    await render(<ModuleList composition={composition} hostLabel="stjerneborg" sync={report()} />);
    expect(screen.queryByText(/could not fetch/i)).toBeNull();
  });

  // --- Item 2: the newest-commit timestamp reaches the screen ---

  it("shows each row's newest-commit timestamp on the note line", async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            {
              name: 'tycho',
              path: 'operators/tycho',
              status: 'synced',
              commits: 1,
              newest_commit: '2026-08-01T14:22:00Z',
            },
          ],
        })}
      />,
    );
    const row = within(screen.getByTestId('module-row-operators/tycho'));
    // The row's note becomes the sync line — it should NOT still show
    // whatever `item.note` would have been (this fixture's tycho has none).
    expect(row.getByText(/newest commit/i)).toBeTruthy();
  });

  it("falls back to the module's own note when there is no sync entry for the row", async () => {
    const withNote: Composition = {
      ...composition,
      operators: [{ name: 'tycho', path: 'operators/tycho', note: 'journaling' }],
    };
    await render(<ModuleList composition={withNote} hostLabel="stjerneborg" />);
    expect(screen.getByText('journaling')).toBeTruthy();
  });

  it("shows a fetch error on the note line, taking precedence over a stale newest-commit", async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            {
              name: 'tycho',
              path: 'operators/tycho',
              status: 'current',
              newest_commit: '2026-08-01T14:22:00Z',
              fetch_error: 'network unreachable',
            },
          ],
        })}
      />,
    );
    const row = within(screen.getByTestId('module-row-operators/tycho'));
    expect(row.getByText('network unreachable')).toBeTruthy();
    expect(row.queryByText(/newest commit/i)).toBeNull();
  });

  // --- Item 3: the router root is swept but never rendered as a module row ---

  it('says the router root was swept, even though it has no module row', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report({
          repos: [
            ...report().repos,
            { name: 'armillary', path: '.', status: 'synced', commits: 2 },
          ],
        })}
      />,
    );
    expect(screen.getByText(/Also swept:.*armillary \(root\).*\+2/)).toBeTruthy();
  });

  // --- Item 4: a failed sweep says so ---

  it('shows an error line when the last sweep attempt failed', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report()}
        onSync={() => {}}
        syncError="This host has not granted the sweep."
      />,
    );
    expect(screen.getByText('This host has not granted the sweep.')).toBeTruthy();
  });

  it('shows no error line when nothing has failed', async () => {
    await render(
      <ModuleList
        composition={composition}
        hostLabel="stjerneborg"
        sync={report()}
        onSync={() => {}}
      />,
    );
    expect(screen.queryByText(/has not granted the sweep/i)).toBeNull();
  });
});

describe('trailingLabel', () => {
  it('reports the fetch failure instead of a verdict computed from stale refs', () => {
    expect(
      trailingLabel({
        name: '',
        path: '',
        status: 'current',
        fetch_error: 'connect ETIMEDOUT',
      }),
    ).toBe('fetch failed');
  });

  it('falls through to syncLabel when the fetch succeeded', () => {
    expect(trailingLabel({ name: '', path: '', status: 'synced', commits: 3 })).toBe('+3');
  });
});

describe('fetchFailureSummary', () => {
  it('counts failures against the total swept, not the total rendered', () => {
    expect(
      fetchFailureSummary({
        enabled: true,
        fetched: true,
        not_composed: [],
        repos: [
          { name: 'a', path: 'a', status: 'current' },
          { name: 'b', path: 'b', status: 'current', fetch_error: 'x' },
        ],
      }),
    ).toBe('1 of 2 could not fetch');
  });

  it('is undefined when nothing failed, and when there is no report', () => {
    expect(
      fetchFailureSummary({
        enabled: true,
        fetched: true,
        not_composed: [],
        repos: [{ name: 'a', path: 'a', status: 'current' }],
      }),
    ).toBeUndefined();
    expect(fetchFailureSummary(undefined)).toBeUndefined();
  });
});

// Built from local (year, month, day, hour, minute) components rather than a
// hardcoded UTC ISO string, then round-tripped through `.toISOString()`: the
// wall-clock reading has to be exact for these assertions, and the test
// machine's own timezone is not America/Los_Angeles on every runner.
function localIso(year: number, monthIndex: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

describe('newestCommitLabel', () => {
  it('reads relative when the commit lands the same calendar day', () => {
    const now = new Date(2026, 7, 1, 18, 0); // Aug 1 2026, 18:00 local
    expect(newestCommitLabel(localIso(2026, 7, 1, 14, 22), now)).toBe(
      'newest commit 14:22 today',
    );
  });

  it('reads absolute once the commit is a different calendar day', () => {
    const now = new Date(2026, 7, 1, 18, 0); // Aug 1 2026 local
    expect(newestCommitLabel(localIso(2026, 6, 29, 9, 5), now)).toBe('newest commit Jul 29');
  });
});

describe('rowNote', () => {
  const now = new Date(2026, 7, 1, 18, 0);

  it('falls back to the module note when there is no sync entry', () => {
    expect(rowNote(undefined, 'journaling', now)).toBe('journaling');
  });

  it('prefers the fetch error over a newest-commit timestamp', () => {
    expect(
      rowNote(
        {
          name: '',
          path: '',
          status: 'current',
          fetch_error: 'network unreachable',
          newest_commit: localIso(2026, 7, 1, 14, 22),
        },
        'journaling',
        now,
      ),
    ).toBe('network unreachable');
  });

  it('prefers the newest-commit timestamp over the module note', () => {
    expect(
      rowNote(
        {
          name: '',
          path: '',
          status: 'synced',
          commits: 1,
          newest_commit: localIso(2026, 7, 1, 14, 22),
        },
        'journaling',
        now,
      ),
    ).toBe('newest commit 14:22 today');
  });
});

describe('describeOrphans', () => {
  it('names a swept repo that composes no rendered row, root or otherwise', () => {
    const sync: SyncReport = {
      enabled: true,
      fetched: true,
      not_composed: [],
      repos: [
        { name: 'armillary', path: '.', status: 'synced', commits: 2 },
        { name: 'jianyi', path: 'repos/jianyi', status: 'current' },
      ],
    };
    expect(describeOrphans(sync, new Set(['repos/jianyi']))).toBe(
      'Also swept: armillary (root) — +2',
    );
  });

  it('is undefined once every swept path has a rendered row', () => {
    const sync: SyncReport = {
      enabled: true,
      fetched: true,
      not_composed: [],
      repos: [{ name: 'jianyi', path: 'repos/jianyi', status: 'current' }],
    };
    expect(describeOrphans(sync, new Set(['repos/jianyi']))).toBeUndefined();
  });
});
