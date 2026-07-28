import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import type { TreeEntry } from '@/lib/daemon/types';

export function TreeList({
  base,
  entries,
  total,
  truncated = false,
  refreshing = false,
  onRefresh,
  subtitleFor,
  trailingFor,
  header,
}: {
  base: string;
  entries: TreeEntry[];
  total?: number;
  truncated?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  subtitleFor?: (name: string) => string | undefined;
  /** Unused in this task — consumed by the voicenote inbox (per-file state). */
  trailingFor?: (name: string) => string | undefined;
  header?: ReactNode;
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
      // `ListHeaderComponent` is typed narrower than ReactNode (no bare string/
      // number/null); every caller passes a JSX element or omits the prop, so
      // the cast just bridges our looser public prop type to that.
      ListHeaderComponent={header as React.ComponentType | React.JSX.Element | undefined}
      ListFooterComponent={
        truncated ? (
          // Said out loud. A list silently cut to its first 500 entries looks
          // exactly like a complete one.
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.md,
            }}>
            Showing {entries.length} of {total} — this directory is too large to list in full.
          </Text>
        ) : null
      }
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
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    ...theme.type.body,
                    color: item.dir ? theme.color.txPrimary : theme.color.txSecondary,
                  }}
                  numberOfLines={1}>
                  {item.name}
                </Text>
                {subtitleFor?.(item.name) ? (
                  <Text
                    style={{ ...theme.type.caption, color: theme.color.txTertiary }}
                    numberOfLines={1}>
                    {subtitleFor(item.name)}
                  </Text>
                ) : null}
              </View>
              {trailingFor?.(item.name) ? (
                <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
                  {trailingFor(item.name)}
                </Text>
              ) : null}
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
