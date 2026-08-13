import { View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { ToolPairRow } from '@/lib/session/project';
import { useTheme } from '@/theme';

/** 412 → "412", 2800 → "2.8k" — a glance number, not an accounting one. */
export function compactChars(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}

/**
 * One tool call in the transcript: machinery of the work, left-aligned mono —
 * the instrument register (design 2026-08-12 D4; centered captions stay the
 * register of session ceremony). One line by definition: the label truncates,
 * never wraps. A refusal shows the machine status verbatim, house rule.
 */
export function ToolRow({ row }: { row: ToolPairRow }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.sm,
        paddingHorizontal: theme.space.lg,
        paddingVertical: theme.space.xxs,
      }}>
      <Text variant="mono" color="txTertiary" numberOfLines={1} style={{ flex: 1 }}>
        {row.label}
      </Text>
      {row.result ? (
        row.result.ok ? (
          <>
            <Icon name="check" size={10} color="txSuccess" />
            <Text variant="fraktionXs" color="txTertiary">{compactChars(row.result.chars)}</Text>
          </>
        ) : (
          <>
            <Icon name="close" size={10} color="txWarning" />
            <Text variant="fraktionXs" color="txWarning">{row.result.status}</Text>
          </>
        )
      ) : null}
    </View>
  );
}
