import { render, screen } from '@testing-library/react-native';
import { TreeList } from '../src/components/tree-list';

describe('TreeList', () => {
  it('renders a subtitle when one is supplied and nothing when it is not', async () => {
    await render(
      <TreeList
        base=""
        entries={[
          { name: 'zojercommons', dir: true },
          { name: 'local', dir: true },
        ]}
        subtitleFor={(name) => (name === 'zojercommons' ? 'commons' : undefined)}
      />,
    );
    expect(screen.getByText('commons')).toBeTruthy();
    expect(screen.getByText('local')).toBeTruthy();
  });
});
