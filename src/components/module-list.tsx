import { Link } from 'expo-router';
import { RefreshControl, SectionList, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import type { Composition, Module } from '@/lib/daemon/types';

type Section = { title: string; data: Module[] };

function sections(composition: Composition): Section[] {
  return [
    { title: 'OPERATORS', data: composition.operators },
    { title: 'COMMONS', data: composition.commons },
    { title: 'REPOS', data: composition.repos },
    // C-4 as UI: a section that composes nothing is omitted rather than shown
    // empty. A bare clone is a working host, so an empty workspace should read
    // as a workspace and not as a failure.
  ].filter((section) => section.data.length > 0);
}

export function ModuleList({
  composition,
  hostLabel,
  refreshing = false,
  onRefresh,
}: {
  composition: Composition;
  hostLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  const data = sections(composition);

  return (
    <SectionList
      sections={data}
      keyExtractor={(item) => item.path}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: theme.space.lg,
        paddingBottom: theme.space.xxxl,
      }}
      ListHeaderComponent={
        <View style={{ paddingTop: theme.space.lg }}>
          <Text style={{ ...theme.type.title, color: theme.color.txPrimary }}>Loaded modules</Text>
          {/* Which armillary you are looking at, always visible. Two machines
              can both be serving a workspace, and only the host tells them apart. */}
          <Link href="/settings" asChild>
            <Text
              style={{
                ...theme.type.caption,
                color: theme.color.txAccent,
                paddingTop: theme.space.xxs,
              }}>
              {hostLabel} ›
            </Text>
          </Link>
        </View>
      }
      ListEmptyComponent={
        <Text
          style={{
            ...theme.type.body,
            color: theme.color.txTertiary,
            paddingTop: theme.space.lg,
          }}>
          This workspace composes nothing. That is a working state, not an error.
        </Text>
      }
      renderSectionHeader={({ section }) => (
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txTertiary,
            letterSpacing: 1,
            paddingTop: theme.space.xl,
            paddingBottom: theme.space.xs,
          }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <Link href={`/browse/${item.path}` as never} asChild>
          <View
            style={{
              paddingVertical: theme.space.sm,
              borderBottomWidth: theme.border.hairline,
              borderBottomColor: theme.color.bdPrimary,
            }}>
            <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>{item.name}</Text>
            {item.note ? (
              <Text
                style={{
                  ...theme.type.caption,
                  color: theme.color.txTertiary,
                  paddingTop: theme.space.xxs,
                }}
                numberOfLines={2}>
                {item.note}
              </Text>
            ) : null}
          </View>
        </Link>
      )}
    />
  );
}
