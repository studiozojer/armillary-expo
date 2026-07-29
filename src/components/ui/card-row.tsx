import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Box } from './box';
import { Icon } from './icon';
import { Inline, Stack } from './stack';
import { Text } from './text';

/**
 * The spaced-card sibling of ListRow: same slots, same trailing contract
 * (omitted means chevron; supplied replaces it), but a rounded card meant to
 * sit with gaps between neighbours rather than full-bleed above a Rule.
 *
 * `noteVariant` exists because the instance list's second line is instrument
 * data (stream · seq) and reads in the mono register; a prose note stays
 * caption. The default is caption — mono is the exception, named per caller.
 */
export function CardRow({
  leading,
  label,
  note,
  noteVariant = 'caption',
  trailing,
  onPress,
  testID,
}: {
  leading?: ReactNode;
  label: string;
  note?: string;
  noteVariant?: 'caption' | 'mono';
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={note ? `${label}. ${note}` : label}
      style={({ pressed }) => ({
        borderRadius: theme.radius.lg,
        backgroundColor:
          pressed && onPress ? theme.color.bgSolidCardPressed : theme.color.bgSolidCard,
      })}>
      <Box px="lg" py="md">
        <Inline gap="md">
          {leading ?? null}

          <Stack flex={1} gap="xxs">
            <Text numberOfLines={1}>{label}</Text>
            {note ? (
              <Text variant={noteVariant} color="txTertiary" numberOfLines={1}>
                {note}
              </Text>
            ) : null}
          </Stack>

          {trailing !== undefined ? (
            trailing
          ) : (
            <Icon name="chevron" size={14} color="icSecondary" />
          )}
        </Inline>
      </Box>
    </Pressable>
  );
}
