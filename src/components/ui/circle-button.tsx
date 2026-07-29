import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';

/** The floating chrome control: a 44pt circle on the card surface. */
const DIAMETER = 44;

/**
 * `accessibilityLabel` is required, not optional: the icon inside is decorative
 * by construction (see Icon), so without a label the control announces as
 * nothing at all.
 */
export function CircleButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: DIAMETER,
        height: DIAMETER,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          pressed && !disabled && onPress
            ? theme.color.bgSolidCardPressed
            : theme.color.bgSolidCard,
      })}>
      <Icon name={icon} size={20} color={disabled ? 'txDisabled' : 'icPrimary'} />
    </Pressable>
  );
}
