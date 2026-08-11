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
 * **This component is the source of daoUI's `CardRow`** (published 2026-08-11):
 * the anatomy shipped here first and the library was promoted from it rather
 * than the reverse, on David's call. Keep the two in step.
 *
 * `register` is that component's variant axis, renamed here from `noteVariant`
 * so both sides say the same word: the second line is prose (`reading`) or
 * instrument data (`instrument`), and that choice is a text style, which is why
 * Figma expresses it as a variant rather than a property.
 *
 * Name map where the two deliberately differ: this file's `note` is the
 * component's `Description`. `note` is kept because `ListRow` — the sibling
 * this file's first line claims parity with — also calls it `note`, and
 * breaking that symmetry to gain agreement with Figma just trades one
 * correspondence for another.
 */
export function CardRow({
  leading,
  label,
  secondary,
  note,
  register = 'reading',
  trailing,
  onPress,
  testID,
}: {
  leading?: ReactNode;
  label: string;
  /**
   * A second string on the title line, dimmer than the label — the instance
   * list's topic, an artifact's kind. It **shrinks before the label does**
   * (`flexShrink: 1` below): RN defaults `flexShrink` to 0, so without it a
   * long secondary pushes rather than yields and the label is what gets
   * truncated. Same failure `InstanceCard` already fixed on its trailing text.
   */
  secondary?: string;
  note?: string;
  register?: 'reading' | 'instrument';
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
      // One announcement per element, so every visible string is folded in —
      // a screen-reader user does not get the visual glance that takes the
      // title line's two halves in at once.
      accessibilityLabel={[label, secondary, note].filter(Boolean).join('. ')}
      style={({ pressed }) => ({
        borderRadius: theme.radius.lg,
        backgroundColor:
          pressed && onPress ? theme.color.bgSolidCardPressed : theme.color.bgSolidCard,
      })}>
      <Box px="lg" py="md">
        <Inline gap="md">
          {leading ?? null}

          <Stack flex={1} gap="xxs">
            {secondary !== undefined ? (
              // `sm` (8), not the component's 6: the app's spacing ramp has no
              // 6 rung, so this is the nearest one both sides can express.
              // Figma is being moved to 8 to match rather than the app gaining
              // a rung for one gap.
              <Inline gap="sm">
                <Text numberOfLines={1}>{label}</Text>
                <Text color="txTertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {secondary}
                </Text>
              </Inline>
            ) : (
              <Text numberOfLines={1}>{label}</Text>
            )}
            {note ? (
              <Text
                variant={register === 'instrument' ? 'fraktionXs' : 'whyteXs'}
                color="txTertiary"
                numberOfLines={1}>
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
