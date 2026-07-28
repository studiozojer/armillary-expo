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
  returned = entries.length,
  refreshing = false,
  onRefresh,
  subtitleFor,
  trailingFor,
  header,
}: {
  base: string;
  entries: TreeEntry[];
  /**
   * Required, not optional: both callers always have it (it comes straight off
   * `TreeResponse`), and an optional `total` here was what let the footer read
   * "of undefined" whenever `truncated` was true but a caller forgot to pass
   * one — a type that permits the bug rather than one that rules it out.
   */
  total: number;
  truncated?: boolean;
  /**
   * How many entries the engine actually returned, before any client-side
   * filtering (e.g. the dotfile toggle). Defaults to `entries.length` so
   * callers that pass the engine's response straight through — the common
   * case — need not think about it; only a caller that filters `entries`
   * before handing them to this list needs to pass the pre-filter count.
   */
  returned?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  subtitleFor?: (name: string) => string | undefined;
  /**
   * Given the full path (`base` joined with the entry name), not the bare
   * name — the voicenote inbox keys its state map on the full path so that
   * two identically-named files in different subdirectories cannot collide.
   */
  trailingFor?: (path: string) => string | undefined;
  header?: ReactNode;
}) {
  const theme = useTheme();
  // What the engine sent minus what is on screen: entirely a local filter's
  // doing, since `returned` already reflects the engine's own count.
  const hiddenByFilter = returned - entries.length;

  // Three quantities can be in play at once (rows on screen, what the engine
  // returned, what the directory actually holds), and "500 of 5000 ... 80 more
  // hidden" reads as if the 80 belong to the missing 4500 — inviting the
  // reader to add numbers that don't compose. Each clause below names its own
  // pair, so there is no "more" left to misread.
  const footerText = (() => {
    const parts: string[] = [];
    if (truncated) {
      parts.push(`Showing ${entries.length} of ${returned} returned (${total} in this directory).`);
    } else if (hiddenByFilter > 0) {
      parts.push(`Showing ${entries.length} of ${returned} returned.`);
    }
    if (hiddenByFilter > 0) {
      parts.push(`${hiddenByFilter} hidden by the dotfile setting.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  })();

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
        footerText ? (
          // Said out loud. A list silently cut to its first 500 entries looks
          // exactly like a complete one, and a directory that looks shorter
          // than it is — with nothing saying why — is the same defect one
          // level down from the point of this screen: it must not lie about
          // what the filesystem holds.
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.md,
            }}>
            {footerText}
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
              {trailingFor?.(full) ? (
                <Text style={{ ...theme.type.caption, color: theme.color.txTertiary }}>
                  {trailingFor(full)}
                </Text>
              ) : null}
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
