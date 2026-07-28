import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, type Edges } from 'react-native-safe-area-context';

import { useTheme, type ColorRole, type Space } from '@/theme';

/**
 * A screen's root: the page surface, safe-area aware.
 *
 * Every route in the app used to write `{ flex: 1, backgroundColor:
 * theme.color.bgSolidBase }` onto its own `SafeAreaView` by hand, and the
 * Explorer landing screen — which arrived by merge after the others were
 * converted — did not. Nothing caught it, because a missing background renders
 * as react-navigation's stock `rgb(242,242,242)`: cream rows on cool grey in
 * light, warm brown rows on pure black in dark. A default is the only thing
 * that survives a screen arriving from somewhere else.
 *
 * Over `SafeAreaView` and not over `Box`: the safe-area insets are applied as
 * padding on this very element, so a `Box` nested inside would leave the notch
 * and home-indicator strips unpainted — the surface has to be on the element
 * that owns the insets.
 *
 * `p` and `style` cover what the call sites actually varied (a padded error
 * state, a centred spinner); anything more specific stays in `style`, which is
 * applied last so a caller override wins.
 */
export function Screen({
  bg = 'bgSolidBase',
  p,
  edges,
  testID,
  style,
  children,
}: {
  /** Defaults to the page surface. Named only when a screen is deliberately not one. */
  bg?: ColorRole;
  p?: Space;
  /** Passed straight through; omitted means SafeAreaView's own default (all edges). */
  edges?: Edges;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[
        { flex: 1, backgroundColor: theme.color[bg] },
        p !== undefined ? { padding: theme.space[p] } : null,
        style,
      ]}>
      {children}
    </SafeAreaView>
  );
}
