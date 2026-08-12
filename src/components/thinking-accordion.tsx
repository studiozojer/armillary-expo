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
export function ThinkingAccordion({ blocks }: { blocks: ThinkingBlock[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ paddingTop: theme.space.xs }}>
      <Pressable
        testID="thinking-toggle"
        onPress={() => setOpen(!open)}
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
              {block.type === 'thinking' ? block.thinking : 'Some reasoning was redacted.'}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
