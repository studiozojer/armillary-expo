import { View, type FlexStyle, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type Space } from '@/theme';

type Common = {
  gap?: Space;
  align?: FlexStyle['alignItems'];
  flex?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Vertical flow. */
export function Stack({ gap, align, flex, testID, style, children }: Common) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'column',
          ...(gap ? { gap: theme.space[gap] } : {}),
          ...(align ? { alignItems: align } : {}),
          ...(flex !== undefined ? { flex } : {}),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Horizontal flow. Defaults to centre-aligned, which is what a row wants. */
export function Inline({
  gap,
  align = 'center',
  justify,
  flex,
  testID,
  style,
  children,
}: Common & { justify?: FlexStyle['justifyContent'] }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          ...(gap ? { gap: theme.space[gap] } : {}),
          ...(justify ? { justifyContent: justify } : {}),
          ...(flex !== undefined ? { flex } : {}),
        },
        style,
      ]}>
      {children}
    </View>
  );
}
