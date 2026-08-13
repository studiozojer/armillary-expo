import { type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { OverflowScroll } from './overflow-scroll';
import { useTheme } from '@/theme';

/**
 * A markdown table in chat: fixed columns at 45% of window width — the
 * library's own sizing rule, kept deliberately so a 3+ column table always
 * overflows into OverflowScroll's fade, with the third column's glyphs
 * visibly broken at the edge (a cut in gutter dead-space reads as a finished
 * table; the Figma iteration proved the difference).
 */
export function MessageTable({ header, rows }: { header: ReactNode[][]; rows: ReactNode[][][] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const colWidth = Math.floor(width * 0.45);
  const renderRow = (cells: ReactNode[][], key: string) => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        borderBottomWidth: theme.border.hairline,
        borderBottomColor: theme.color.bdPrimary,
      }}>
      {cells.map((cell, i) => (
        <View key={i} style={{ width: colWidth, paddingVertical: theme.space.sm, paddingRight: theme.space.md }}>
          {cell}
        </View>
      ))}
    </View>
  );
  return (
    <OverflowScroll>
      <View>
        {renderRow(header, 'head')}
        {rows.map((cells, i) => renderRow(cells, `row-${i}`))}
      </View>
    </OverflowScroll>
  );
}
