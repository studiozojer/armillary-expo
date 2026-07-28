import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorRole, type Radius, type Space, type BorderWidth } from '@/theme';

export type BoxProps = {
  p?: Space;
  px?: Space;
  py?: Space;
  bg?: ColorRole;
  radius?: Radius;
  border?: BorderWidth;
  borderColor?: ColorRole;
  flex?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * A View whose spacing, colour and radius come from the scales and nowhere else.
 *
 * `px` and `py` override `p` on their axis, so `p="sm" px="xl"` reads the way it
 * looks. A raw number cannot reach a style through this component, which is the
 * layout half of the discipline __tests__/no-hex-literals.test.ts enforces for
 * colour.
 */
export function Box({
  p,
  px,
  py,
  bg,
  radius,
  border,
  borderColor,
  flex,
  testID,
  style,
  children,
}: BoxProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          ...(p !== undefined && px === undefined && py === undefined
            ? { padding: theme.space[p] }
            : {}),
          ...(px !== undefined || py !== undefined
            ? {
                paddingHorizontal: theme.space[px ?? p ?? 'none'],
                paddingVertical: theme.space[py ?? p ?? 'none'],
              }
            : {}),
          ...(bg ? { backgroundColor: theme.color[bg] } : {}),
          ...(radius ? { borderRadius: theme.radius[radius] } : {}),
          ...(border ? { borderWidth: theme.border[border] } : {}),
          ...(borderColor ? { borderColor: theme.color[borderColor] } : {}),
          ...(flex !== undefined ? { flex } : {}),
        },
        style,
      ]}>
      {children}
    </View>
  );
}
