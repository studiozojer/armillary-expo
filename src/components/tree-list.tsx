import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text } from 'react-native';

import { useTheme } from '@/theme';
import type { TreeEntry } from '@/lib/daemon/types';

export function TreeList({
  base,
  entries,
  refreshing = false,
  onRefresh,
}: {
  base: string;
  entries: TreeEntry[];
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.name}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: theme.space.lg,
        paddingBottom: theme.space.xxxl,
      }}
      ListEmptyComponent={
        <Text
          style={{
            ...theme.type.body,
            color: theme.color.txTertiary,
            paddingTop: theme.space.lg,
          }}>
          Empty.
        </Text>
      }
      renderItem={({ item }) => {
        const full = base ? `${base}/${item.name}` : item.name;
        return (
          <Link href={`/browse/${full}`} asChild>
            <Pressable
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.sm,
                paddingVertical: theme.space.sm,
                borderBottomWidth: theme.border.hairline,
                borderBottomColor: theme.color.bdPrimary,
              })}>
              <Text style={{ ...theme.type.body, color: theme.color.txTertiary, width: 14 }}>
                {item.dir ? '▸' : '·'}
              </Text>
              <Text
                style={{
                  ...theme.type.body,
                  color: item.dir ? theme.color.txPrimary : theme.color.txSecondary,
                  flex: 1,
                }}
                numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
