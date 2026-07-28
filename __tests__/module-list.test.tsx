import { render, screen } from '@testing-library/react-native';

import { ModuleList } from '../src/components/module-list';
import type { Composition } from '../src/lib/daemon/types';

const composition: Composition = {
  operators: [{ name: 'tycho', path: 'operators/tycho', note: 'journaling' }],
  commons: [{ name: 'zojercommons', path: 'zojercommons' }],
  repos: [],
  protocols: [],
  manifests: [],
  protocol_sources: [],
};

describe('<ModuleList>', () => {
  it('omits a section that composes nothing', async () => {
    // C-4 as UI: a bare clone is a working host, so an empty section should
    // read as a workspace rather than as a failure.
    await render(
      <ModuleList composition={composition} hostLabel="benatky" />,
    );
    expect(screen.getByText('OPERATORS')).toBeTruthy();
    expect(screen.getByText('COMMONS')).toBeTruthy();
    expect(screen.queryByText('REPOS')).toBeNull();
  });

  it('shows the host, because two machines can serve the same workspace', async () => {
    await render(<ModuleList composition={composition} hostLabel="stjerneborg" />);
    expect(screen.getByText(/stjerneborg/)).toBeTruthy();
  });

  it('renders each module as a row with its note', async () => {
    await render(<ModuleList composition={composition} hostLabel="benatky" />);
    expect(screen.getByText('tycho')).toBeTruthy();
    expect(screen.getByText('journaling')).toBeTruthy();
  });
});
