import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme, type ColorRole } from '@/theme';

export type IconName =
  | 'folder'
  | 'file'
  | 'chevron'
  | 'search'
  | 'more'
  | 'back'
  | 'settings'
  | 'inbox'
  | 'plus'
  | 'send';

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
  search: { ios: 'magnifyingglass', web: 'search' },
  more: { ios: 'ellipsis', web: 'more_horiz' },
  back: { ios: 'chevron.left', web: 'chevron_left' },
  settings: { ios: 'gearshape', web: 'settings' },
  inbox: { ios: 'tray', web: 'inbox' },
  plus: { ios: 'plus', web: 'add' },
  send: { ios: 'arrow.up', web: 'arrow_upward' },
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
    />
  );
}
