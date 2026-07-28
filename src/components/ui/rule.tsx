import { View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The lane a row's leading icon occupies: icon box plus its gap.
 *
 * Exported because the divider inset and the icon lane must be the same number,
 * and two constants that must match are one constant.
 */
export const ROW_ICON_LANE = 44;

/** A hairline. `inset` starts it where the label starts, not where the icon does. */
export function Rule({ inset = 0, testID }: { inset?: number; testID?: string }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        height: theme.border.hairline,
        marginLeft: inset,
        backgroundColor: theme.color.bdCard,
      }}
    />
  );
}
