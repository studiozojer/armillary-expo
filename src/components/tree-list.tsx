import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, RefreshControl } from 'react-native';

import { useTheme } from '@/theme';
import type { TreeEntry } from '@/lib/daemon/types';

import { Box, ListRow, ROW_ICON_LANE, Rule, Text } from './ui';

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
  /** The row's second line — `ListRow`'s `note`, keyed on the bare name. */
  subtitleFor?: (name: string) => string | undefined;
  /**
   * Given the full path (`base` joined with the entry name), not the bare
   * name — the voicenote inbox keys its state map on the full path so that
   * two identically-named files in different subdirectories cannot collide.
   *
   * What it returns takes the row's trailing slot, replacing that row's
   * chevron (see `ListRow`); a row it has nothing to say about keeps one.
   */
  trailingFor?: (path: string) => string | undefined;
  header?: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
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
      // No horizontal padding on the container any more: rows are full-bleed so
      // a pressed row paints edge to edge instead of leaving an unpainted
      // margin either side. Each row carries its own inset, and the three
      // non-row slots below carry theirs.
      contentContainerStyle={{
        paddingBottom: theme.space.xxxl,
      }}
      // The header is the caller's own content, so it gets the inset the
      // container used to give everything.
      ListHeaderComponent={header ? <Box px="lg">{header}</Box> : undefined}
      ListFooterComponent={
        footerText ? (
          // Said out loud. A list silently cut to its first 500 entries looks
          // exactly like a complete one, and a directory that looks shorter
          // than it is — with nothing saying why — is the same defect one
          // level down from the point of this screen: it must not lie about
          // what the filesystem holds.
          <Box px="lg" style={{ paddingTop: theme.space.md }}>
            <Text variant="caption" color="txTertiary">
              {footerText}
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
        const trailing = trailingFor?.(full);
        return (
          <>
            <ListRow
              icon={item.dir ? 'folder' : 'file'}
              label={item.name}
              note={subtitleFor?.(item.name)}
              trailing={
                trailing ? (
                  <Text variant="caption" color="txTertiary">
                    {trailing}
                  </Text>
                ) : undefined
              }
              // `router.push`, not `Link asChild`: `ListRow` derives its
              // accessibility role from its own `onPress`, and a `Link` clone
              // hands navigation down as a press handler on the cloned element
              // rather than through that prop — leaving every row in this list
              // announcing no role at all.
              onPress={() => router.push(`/browse/${full}`)}
            />
            {index < entries.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
          </>
        );
      }}
    />
  );
}
