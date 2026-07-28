import { useRouter } from 'expo-router';
import { FlatList, RefreshControl } from 'react-native';

import { useTheme } from '@/theme';
import type { TreeEntry } from '@/lib/daemon/types';

import { Box, ListRow, ROW_ICON_LANE, Rule, Text } from './ui';

export function TreeList({
  base,
  entries,
  total,
  truncated = false,
  refreshing = false,
  onRefresh,
}: {
  base: string;
  entries: TreeEntry[];
  total?: number;
  truncated?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.name}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{
        paddingBottom: theme.space.xxxl,
      }}
      ListFooterComponent={
        truncated ? (
          // Said out loud. A list silently cut to its first 500 entries looks
          // exactly like a complete one.
          <Box px="lg" style={{ paddingTop: theme.space.md }}>
            <Text variant="caption" color="txTertiary">
              Showing {entries.length} of {total} — this directory is too large to list in full.
            </Text>
          </Box>
        ) : null
      }
      ListEmptyComponent={
        <Box px="lg" style={{ paddingTop: theme.space.lg }}>
          <Text color="txTertiary">Empty.</Text>
        </Box>
      }
      renderItem={({ item, index }) => {
        const full = base ? `${base}/${item.name}` : item.name;
        return (
          <>
            <ListRow
              icon={item.dir ? 'folder' : 'file'}
              label={item.name}
              onPress={() => router.push(`/browse/${full}`)}
            />
            {index < entries.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
          </>
        );
      }}
    />
  );
}
