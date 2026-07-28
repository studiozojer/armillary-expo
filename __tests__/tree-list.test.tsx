import { render, screen } from '@testing-library/react-native';
import { TreeList } from '../src/components/tree-list';

describe('TreeList', () => {
  it('renders a subtitle when one is supplied and nothing when it is not', async () => {
    await render(
      <TreeList
        base=""
        total={2}
        entries={[
          { name: 'zojercommons', dir: true },
          { name: 'local', dir: true },
        ]}
        subtitleFor={(name) => (name === 'zojercommons' ? 'commons' : undefined)}
      />,
    );
    expect(screen.getByText('commons')).toBeTruthy();
    expect(screen.getByText('local')).toBeTruthy();
    // "nothing when it is not" must mean no text at all, not the literal
    // string "undefined" — that would also pass a query for absence of a
    // real subtitle if the component ever stringified a missing one.
    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('names all three quantities so the composite cannot be misread under truncation and filtering', async () => {
    // Engine caps 500 of 5000, 80 of the returned entries are dotfiles, 420
    // rows on screen. The old wording ("Showing 500 of 5000 ... 80 more
    // hidden") let a reader add the 80 to the 500 as if they were part of the
    // missing 4500. Each number must sit next to the count it actually
    // belongs to.
    const entries = Array.from({ length: 420 }, (_, i) => ({ name: `f${i}`, dir: false }));
    await render(
      <TreeList base="" entries={entries} total={5000} truncated returned={500} />,
    );
    expect(screen.getByText(/Showing 420 of 500 returned \(5000 in this directory\)\./)).toBeTruthy();
    expect(screen.getByText(/80 hidden by the dotfile setting\./)).toBeTruthy();
  });

  it('states how many entries the dotfile setting is hiding, even without truncation', async () => {
    const entries = [{ name: 'CLAUDE.md', dir: false }];
    await render(<TreeList base="" entries={entries} total={4} returned={4} />);
    expect(screen.getByText(/Showing 1 of 4 returned\./)).toBeTruthy();
    expect(screen.getByText(/3 hidden by the dotfile setting\./)).toBeTruthy();
  });

  it('renders no footer at all when nothing is truncated or filtered', async () => {
    const entries = [{ name: 'CLAUDE.md', dir: false }];
    await render(<TreeList base="" entries={entries} total={1} returned={1} />);
    expect(screen.queryByText(/returned/)).toBeNull();
    expect(screen.queryByText(/hidden/)).toBeNull();
  });
});
