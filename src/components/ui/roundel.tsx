import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

/**
 * The derived operator mark: first character of the name in a themed circle.
 *
 * Deliberately a derivation, not an asset lookup — operators are
 * workspace-defined, so the app cannot know every one. When real operator
 * glyphs exist (a daoUI question), they replace the character here and no
 * layout changes.
 */
export function roundelGlyph(name: string): string {
  const first = name.trim()[0];
  return first ? first.toLowerCase() : '·';
}

export function Roundel({
  name,
  size = 36,
  testID,
}: {
  name: string;
  size?: number;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      // Decorative by construction, same contract as Icon: the containing row
      // carries the name.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.bgPrimary,
      }}>
      <Text variant="mono" color="txSecondary">
        {roundelGlyph(name)}
      </Text>
    </View>
  );
}
