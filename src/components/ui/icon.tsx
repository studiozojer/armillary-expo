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
  | 'settings'
  | 'inbox'
  | 'plus'
  | 'send'
  | 'check'
  | 'eye'
  | 'mic';

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
  settings: { ios: 'gearshape', web: 'settings' },
  inbox: { ios: 'tray', web: 'inbox' },
  plus: { ios: 'plus', web: 'add' },
  send: { ios: 'arrow.up', web: 'arrow_upward' },
  check: { ios: 'checkmark', web: 'check' },
  eye: { ios: 'eye', web: 'visibility' },
  mic: { ios: 'mic', web: 'mic' },
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
