import { Text, View } from 'react-native';

import { OverflowScroll } from './overflow-scroll';
import { useTheme } from '@/theme';

/**
 * A fenced block in chat: full-bleed slab, Fraktion.
 *
 * This override also closes the documented library gap (`theme/index.ts`,
 * "KNOWN GAP"): the library styles a fenced block's text from the `em` key,
 * so Fraktion could never reach it through styles alone. Owning the render
 * is the fix that file said it was waiting for.
 */
export function MessageCode({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <OverflowScroll>
      <View style={{ backgroundColor: theme.color.bgSecondary, padding: theme.space.md, minWidth: '100%' }}>
        <Text selectable={false} style={{ ...theme.type.mono, color: theme.color.txPrimary }}>
          {text}
        </Text>
      </View>
    </OverflowScroll>
  );
}
