import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TreeList } from '../src/components/tree-list';
import { ICONS } from '../src/components/ui';

// toJSON()'s tree is the only stable way to reach the host SymbolView nodes —
// same approach __tests__/ui-list-row.test.tsx and __tests__/ui-icon.test.tsx
// use, including the per-platform name resolution: SymbolView collapses its
// {ios, web, android} name object down to a single string for the current
// Platform.OS before it ever reaches the host node.
type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function findAllByType(node: JsonNode | null, type: string, out: JsonNode[] = []): JsonNode[] {
  if (!node) return out;
  if (node.type === type) out.push(node);
  for (const child of node.children ?? []) {
    findAllByType(child, type, out);
  }
  return out;
}

const platformName = (spec: { ios: string; web: string }) =>
  Platform.OS === 'ios' ? spec.ios : spec.web;

const chevronCount = () =>
  findAllByType(screen.toJSON() as JsonNode | null, 'ViewManagerAdapter_SymbolModule').filter(
    (symbol) => symbol.props.name === platformName(ICONS.chevron),
  ).length;

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

  describe('trailingFor', () => {
    // `ListRow`'s own tests prove that the `trailing` PROP replaces the
    // chevron. They say nothing about whether TreeList ever passes it: delete
    // the `trailing={…}` block from tree-list.tsx and every other test on this
    // branch still passes. This closes that gap — the wiring, not the pair.
    const entries = [
      { name: 'memo.m4a', dir: false },
      { name: 'notes.md', dir: false },
    ];

    it('puts what it returns in the row, replacing that row’s chevron', async () => {
      const seen: string[] = [];
      await render(
        <TreeList
          base="voice"
          entries={entries}
          total={2}
          trailingFor={(path) => {
            seen.push(path);
            return path === 'voice/memo.m4a' ? '●' : undefined;
          }}
        />,
      );

      expect(screen.getByText('●')).toBeTruthy();
      // Keyed on the full path, not the bare name — two identically-named
      // files in different subdirectories must not collide onto one dot.
      expect(seen).toEqual(['voice/memo.m4a', 'voice/notes.md']);
      // One row surrendered its chevron; the row trailingFor had nothing to
      // say about kept one. Asserting the count, not just presence, is what
      // catches a version that renders the dot BESIDE the chevron.
      expect(chevronCount()).toBe(1);
    });

    it('leaves every chevron in place when it is not supplied', async () => {
      await render(<TreeList base="voice" entries={entries} total={2} />);
      expect(screen.queryByText('●')).toBeNull();
      expect(chevronCount()).toBe(2);
    });
  });
});
