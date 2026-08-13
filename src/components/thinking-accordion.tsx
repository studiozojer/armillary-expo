import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { compactChars } from '@/components/tool-row';
import type { ThinkingBlock } from '@/lib/session/events';
import { useTheme } from '@/theme';

/**
 * The round's reasoning, folded above the reply it produced — thinking
 * precedes the answer, so the transcript reads chronologically (design
 * 2026-08-12 D7, David's call resolving the same-day collision with the
 * turn-in-flight design's below-the-reply form). Mono register: machinery
 * wears the instrument uniform (D4).
 *
 * `redacted_thinking` can never be shown — it arrives encrypted — so it
 * renders as a named state, never a blank body.
 */
/**
 * `blocks` is a closed TS union of two variants, but `data.thinking` arrives
 * as an unvalidated `as`-cast off the wire (`project.ts`), so a future
 * provider block type is a real runtime possibility, not just a type-system
 * exercise. Matching `'thinking'` and `'redacted_thinking'` explicitly (never
 * an `else`) means an unrecognized type falls to the default arm below rather
 * than silently reading as "redacted" — a specific, false claim about
 * content. Same house rule `project.ts`'s `unhandled event type: …` default
 * arm follows: name it verbatim, never fold it into a neighbour.
 */
function blockText(block: ThinkingBlock): string {
  switch (block.type) {
    case 'thinking':
      return block.thinking;
    case 'redacted_thinking':
      return 'Some reasoning was redacted.';
    default:
      return `unhandled thinking block type: ${(block as { type: string }).type}`;
  }
}

export function ThinkingAccordion({ blocks }: { blocks: ThinkingBlock[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const visibleChars = blocks.reduce((n, b) => n + (b.type === 'thinking' ? b.thinking.length : 0), 0);

  return (
    <View style={{ paddingBottom: theme.space.xs }}>
      <Pressable
        testID="thinking-toggle"
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide thinking' : 'Show thinking'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs + theme.space.xxs }}>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={10} color="txTertiary" />
        <Text variant="mono" color="txTertiary">{`thinking · ${compactChars(visibleChars)}`}</Text>
      </Pressable>
      {open ? (
        <View style={{ paddingTop: theme.space.xxs, paddingLeft: theme.space.xxl + theme.space.sm, gap: theme.space.xs }}>
          {blocks.map((block, i) => (
            <Text key={i} variant="label" color="txTertiary">
              {blockText(block)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
