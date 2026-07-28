import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { ROW_ICON_LANE } from './rule';
import { Box } from './box';
import { Inline, Stack } from './stack';
import { Text } from './text';

/**
 * A row in a list: leading icon typed by kind, label, optional note, and a
 * trailing slot that holds a chevron unless the caller fills it.
 *
 * The pressed state paints a surface rather than fading the row. `opacity: 0.6`
 * — which is what every hand-rolled row in this app did — dims the text along
 * with the background and reads as "disabled", not "pressed".
 */
export function ListRow({
  icon,
  label,
  note,
  trailing,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  note?: string;
  /**
   * What sits at the end of the row. Omitted, it is the chevron — the shape
   * that says "this pushes a screen", which is what almost every row does.
   * Supplied, it *replaces* the chevron rather than sitting beside it: two
   * trailing marks read as two affordances, and the caller that has something
   * specific to say there (the voicenote inbox's transcription dot) is saying
   * it about this row, not adding to it.
   */
  trailing?: ReactNode;
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
        // Gated on `onPress`, not on `disabled`: a row with no `onPress` isn't
        // disabled, it's non-interactive, and `disabled` would set
        // accessibilityState.disabled, announcing "dimmed" and implying the
        // row could become enabled. Pressable still wires full responder
        // handlers onto every row regardless of `onPress` (that's how the
        // press state itself gets tracked), so without this guard a
        // non-pressable row visibly depresses on tap — a button-shaped visual
        // affordance contradicting the accessibility tree, which correctly
        // carries no button role here.
        backgroundColor:
          pressed && onPress ? theme.color.bgSolidCardPressed : theme.color.bgSolidCard,
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

          {/* `!== undefined`, not truthiness: a caller computing this slot can
              legitimately produce an empty-but-present node, and falling back
              to the chevron in that case would put a "pushes a screen" mark on
              a row the caller deliberately left bare. */}
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
