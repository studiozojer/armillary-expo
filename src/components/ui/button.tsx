import { Pressable } from 'react-native';

import { useTheme, type ColorRole } from '@/theme';

import { Text } from './text';

/** The first consumer of daoUI's button interaction states. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  const fill = (pressed: boolean): ColorRole => {
    if (disabled) return 'bgSolidButtonDisabled';
    if (variant === 'secondary') return pressed ? 'bgPressed' : 'bgSolidCard';
    return pressed ? 'bgSolidButtonPressed' : 'bgSolidButton';
  };

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        paddingVertical: theme.space.sm,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color[fill(pressed)],
      })}>
      <Text
        variant="label"
        // The primary fill inverts by scheme (cream in dark, near-black in
        // light), so its label has to invert with it — `txButton` does that;
        // `txPrimary` is tuned against the page background, not against
        // `bg/solid/button`, and reads at ~1.2:1 there in both schemes.
        color={
          disabled ? 'txDisabled' : variant === 'secondary' ? 'txSecondary' : 'txButton'
        }>
        {label}
      </Text>
    </Pressable>
  );
}
