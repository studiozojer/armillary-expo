import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme, type ColorRole } from '@/theme';

export type IconName =
  | 'folder'
  | 'file'
  | 'chevron'
  | 'chevronDown'
  | 'search'
  | 'more'
  | 'back'
  | 'close'
  | 'panel'
  | 'settings'
  | 'inbox'
  | 'plus'
  | 'send'
  | 'check'
  | 'eye'
  | 'mic'
  | 'gitBranch'
  | 'sync'
  | 'pullVerb'
  | 'pushVerb'
  | 'commitVerb'
  | 'arrowUp'
  | 'squareDot'
  | 'squarePlus'
  | 'squareMinus'
  | 'squareRenamed'
  | 'square';

/**
 * The single place platform icon names live.
 *
 * SF Symbols render on Apple platforms only; expo-symbols substitutes Google's
 * Material Symbols elsewhere, reading name['web']. Apple's licence covers use
 * in apps on Apple platforms, so the substitution is the correct answer as well
 * as the only working one — but the pairing has to be maintained by hand, and
 * it lives here so that when web becomes a real target this file is the only
 * thing that changes. The eventual answer is a studio set in daoUI; until then
 * the Material names are the substitute, not the intent.
 */
export const ICONS: Record<IconName, { ios: SFSymbol; web: AndroidSymbol }> = {
  folder: { ios: 'folder.fill', web: 'folder' },
  file: { ios: 'doc', web: 'description' },
  chevron: { ios: 'chevron.right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', web: 'keyboard_arrow_down' },
  search: { ios: 'magnifyingglass', web: 'search' },
  more: { ios: 'ellipsis', web: 'more_horiz' },
  back: { ios: 'chevron.left', web: 'chevron_left' },
  // The panel dismiss. Distinct from `back` on purpose: a panel is presented
  // over where you are rather than navigated to, so there is nothing behind it
  // to return to — the mark has to say "close", not "go back".
  close: { ios: 'xmark', web: 'close' },
  // The panel's open affordance, on the chat header.
  panel: { ios: 'sidebar.right', web: 'view_sidebar' },
  settings: { ios: 'gearshape', web: 'settings' },
  inbox: { ios: 'tray', web: 'inbox' },
  plus: { ios: 'plus', web: 'add' },
  send: { ios: 'arrow.up', web: 'arrow_upward' },
  check: { ios: 'checkmark', web: 'check' },
  eye: { ios: 'eye', web: 'visibility' },
  mic: { ios: 'mic', web: 'mic' },
  // The repo state card sync glyph (Task 11, v1). Figma node 345:448
  // originally designed a single glyph for all verbs. Per-verb glyphs are the
  // ratified divergence (git-ux-polish design D1, D4;
  // `zojercommons/projects/harness/specs/2026-08-09-git-ux-polish-design.md`).
  // Updating the Figma file is owed to David.
  gitBranch: { ios: 'arrow.triangle.branch', web: 'alt_route' },
  sync: { ios: 'arrow.triangle.2.circlepath', web: 'sync' },
  // Per-verb State Card glyphs (git-ux-polish design D1). `.to.line` and not
  // plain arrows: `arrow.up` already means "unpushed commit" on History rows
  // (`arrowUp` below), and one glyph must not carry two unrelated meanings.
  pullVerb: { ios: 'arrow.down.to.line', web: 'download' },
  pushVerb: { ios: 'arrow.up.to.line', web: 'upload' },
  commitVerb: { ios: 'smallcircle.filled.circle', web: 'commit' },
  // Task 12 (repo page tabs). The unpushed marker on a History row (Figma
  // `354:625`, node `364:5280`) — a commit `Commit.unpushed` is true for.
  arrowUp: { ios: 'arrow.up', web: 'arrow_upward' },
  // The Changes row trailing glyph, one per `ChangedFile.change` bucket
  // (Figma `358:646`). `change` is a plain `string` on the wire (see
  // `git.rs`'s doc comment on `ChangedFile` — five buckets collapsed from
  // git's finer XY vocabulary, closed in practice but not in the type), so
  // `repo-tabs.tsx` falls back to `square` for anything it doesn't
  // recognise rather than indexing this table unsafely.
  squareDot: { ios: 'dot.square', web: 'square_dot' }, // modified
  squarePlus: { ios: 'plus.square', web: 'add_box' }, // added
  squareMinus: { ios: 'minus.square', web: 'indeterminate_check_box' }, // deleted
  // `renamed` has no sampled Figma row — none of the four rows on `358:646`
  // is a rename — so this glyph is chosen, not read off the file. Rejected:
  // reusing `square` (already `untracked`'s glyph, and a rename is not "no
  // state"); an arrow glyph (already `arrowUp`'s meaning, unpushed, and
  // reusing it here would make one glyph mean two unrelated things). `r
  // .square` reads as "renamed" the same way `plus.square`/`minus.square`
  // read as added/deleted — a letter standing for the word, in the same
  // square family.
  squareRenamed: { ios: 'r.square', web: 'drive_file_rename_outline' }, // renamed
  square: { ios: 'square', web: 'square' }, // untracked
};

export function Icon({
  name,
  size = 20,
  color = 'icPrimary',
}: {
  name: IconName;
  size?: number;
  color?: ColorRole;
}) {
  const theme = useTheme();
  const spec = ICONS[name];

  return (
    <SymbolView
      name={{ ios: spec.ios, web: spec.web, android: spec.web }}
      size={size}
      tintColor={theme.color[color]}
      // Decorative by construction. The pressable or heading that contains an icon
      // carries the label; the icon repeating it would double every announcement.
      // This is not only politeness — off-Apple, SymbolView renders the Material
      // glyph as a private-use Unicode character in a <Text>, which a screen reader
      // announces as noise. If an icon ever needs to be the sole meaning of a
      // control, give the CONTROL a label; do not un-hide the icon.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
