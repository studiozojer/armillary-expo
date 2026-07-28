import { Pressable } from 'react-native';

import { useTheme, type ColorRole } from '@/theme';

import { Text } from './text';

/** The first consumer of daoUI's button interaction states. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const theme = useTheme();

  const fill = (pressed: boolean): ColorRole => {
    if (disabled) return 'bgSolidButtonDisabled';
    if (variant === 'secondary') return pressed ? 'bgPressed' : 'bgSolidCard';
    return pressed ? 'bgSolidButtonPressed' : 'bgSolidButton';
  };

  return (
    <Pressable
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
        color={
          disabled ? 'txDisabled' : variant === 'secondary' ? 'txSecondary' : 'txPrimary'
        }>
        {label}
      </Text>
    </Pressable>
  );
}
