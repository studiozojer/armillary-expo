import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import type { ThinkingBlock } from '@/lib/session/events';
import { useTheme } from '@/theme';

/**
 * The round's reasoning, collapsed under the reply it belongs to.
 *
 * **Typographically de-emphasized on purpose, and the de-emphasis is
 * honesty rather than decoration.** Thinking text is the model's scratchpad,
 * not prose written for a reader; rendering it at body weight would present
 * it as something it is not.
 *
 * `redacted_thinking` can never be shown — it arrives encrypted from the API
 * — so it renders as a named state instead. Never a blank body, which reads
 * as broken.
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

  return (
    <View style={{ paddingTop: theme.space.xs }}>
      <Pressable
        testID="thinking-toggle"
        onPress={() => setOpen(!open)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide thinking' : 'Show thinking'}>
        <Text variant="caption" color="txTertiary">
          {open ? 'Hide thinking' : 'Show thinking'}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ paddingTop: theme.space.xs, gap: theme.space.xs }}>
          {blocks.map((block, i) => (
            <Text
              // Index keys: these are a fixed, never-reordered slice of one
              // durable event, so there is nothing for a stable key to buy.
              key={i}
              variant="caption"
              color="txSecondary">
              {blockText(block)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
