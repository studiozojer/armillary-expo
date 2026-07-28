import { visibleEntries } from '../src/lib/preferences';

const entries = [
  { name: '.claude', dir: true },
  { name: '.DS_Store', dir: false },
  { name: 'CLAUDE.md', dir: false },
  { name: 'local', dir: true },
];

describe('visibleEntries', () => {
  it('shows everything by default', () => {
    expect(visibleEntries(entries, true)).toHaveLength(4);
  });

  it('hides dotfiles when the preference is off', () => {
    expect(visibleEntries(entries, false).map((e) => e.name)).toEqual(['CLAUDE.md', 'local']);
  });

  it('filters on the client only, so the engine keeps listing everything', () => {
    // The engine has no opinion about this preference and must not grow one:
    // hiding at the source would make two clients disagree about what the
    // workspace contains. Assert the actual filtered content, not just that a
    // new array came back — a filter that dropped the wrong entries would
    // still satisfy an identity-only check.
    const filtered = visibleEntries(entries, false);
    expect(filtered.map((e) => e.name)).toEqual(['CLAUDE.md', 'local']);
    expect(filtered).not.toBe(entries);
    expect(entries).toHaveLength(4);
  });
});
