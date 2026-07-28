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

  it('reports the engine\'s returned count in the truncation footer, not the filtered length', async () => {
    // 500 back from the engine, 80 of them dotfiles hidden client-side: the
    // footer's first number must stay 500, or it reads as if the engine only
    // sent 420.
    const entries = Array.from({ length: 420 }, (_, i) => ({ name: `f${i}`, dir: false }));
    await render(
      <TreeList base="" entries={entries} total={5000} truncated returned={500} />,
    );
    expect(screen.getByText(/Showing 500 of 5000/)).toBeTruthy();
    expect(screen.getByText(/80 more hidden by the dotfile setting\./)).toBeTruthy();
  });

  it('states how many entries the dotfile setting is hiding, even without truncation', async () => {
    const entries = [{ name: 'CLAUDE.md', dir: false }];
    await render(<TreeList base="" entries={entries} returned={4} />);
    expect(screen.getByText(/3 more hidden by the dotfile setting\./)).toBeTruthy();
  });
});
