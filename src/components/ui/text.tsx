import { StyleSheet, Text as RNText, type StyleProp, type TextStyle } from 'react-native';

import { useTheme, type ColorRole, type TextVariant } from '@/theme';

export type TextProps = {
  variant?: TextVariant;
  color?: ColorRole;
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
};

/**
 * The only generic content primitive.
 *
 * A variant carries its family as well as its size, so the reading and
 * instrument registers are chosen by naming the variant rather than by each
 * caller remembering which font a section header uses.
 */
export function Text({
  variant = 'body',
  color = 'txPrimary',
  align,
  numberOfLines,
  style,
  children,
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={StyleSheet.flatten([
        { ...theme.type[variant], color: theme.color[color], textAlign: align },
        style,
      ])}>
      {children}
    </RNText>
  );
}
