import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { ROW_ICON_LANE } from './rule';
import { Box } from './box';
import { Inline, Stack } from './stack';
import { Text } from './text';

/**
 * A row in a list: leading icon typed by kind, label, optional note, chevron.
 *
 * The pressed state paints a surface rather than fading the row. `opacity: 0.6`
 * — which is what every hand-rolled row in this app did — dims the text along
 * with the background and reads as "disabled", not "pressed".
 */
export function ListRow({
  icon,
  label,
  note,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  note?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      // The row is the control; its icons are hidden from assistive technology
      // (see Icon). The note is folded into the label because a screen-reader
      // user gets one announcement per element, not a visual glance that takes
      // in both lines at once.
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={note ? `${label}. ${note}` : label}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.color.bgSolidCardPressed : theme.color.bgSolidCard,
      })}>
      {/* Box carries the padding because Inline deliberately has none — the kit
          has one padding API and it lives on Box. */}
      <Box px="lg" py="md">
        <Inline>
          <Inline style={{ width: ROW_ICON_LANE }}>
            <Icon name={icon} size={20} color="icPrimary" />
          </Inline>

          <Stack flex={1} gap="xxs">
            <Text numberOfLines={1}>{label}</Text>
            {note ? (
              <Text variant="caption" color="txTertiary" numberOfLines={2}>
                {note}
              </Text>
            ) : null}
          </Stack>

          <Icon name="chevron" size={14} color="icSecondary" />
        </Inline>
      </Box>
    </Pressable>
  );
}
