import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { sharedRenderer } from './markdown-renderer';
import { markedStylesFor, markedThemeFor, useTheme } from '@/theme';

/**
 * One chat message's markdown, as plain Views.
 *
 * Deliberately NOT the library's `<Markdown>` component: that renders its own
 * FlatList with a background hardcoded by SYSTEM scheme and its own padding —
 * the three chat defects diagnosed in the 2026-08-12 design. `useMarkdown`
 * is the library's own escape hatch: the same parser and renderer, no list.
 * Explorer keeps the FlatList form (there the library IS the screen).
 */
export function MessageMarkdown({ source }: { source: string }) {
  const theme = useTheme();
  const elements = useMarkdown(source, {
    colorScheme: theme.scheme,
    renderer: sharedRenderer,
    theme: markedThemeFor(theme),
    styles: markedStylesFor(theme),
  });
  return <View testID="message-markdown">{elements}</View>;
}
