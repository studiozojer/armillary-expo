import { Link, useRouter } from 'expo-router';
import { Pressable, RefreshControl, SectionList } from 'react-native';

import { useTheme } from '@/theme';
import type { Composition, Module } from '@/lib/daemon/types';

import { Box, ListRow, ROW_ICON_LANE, Rule, SectionHeader, Text } from './ui';

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
  const router = useRouter();
  const data = sections(composition);

  return (
    <SectionList
      sections={data}
      keyExtractor={(item) => item.path}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{
        paddingBottom: theme.space.xxxl,
      }}
      ListHeaderComponent={
        <Box px="lg" style={{ paddingTop: theme.space.lg }}>
          <Text variant="title">Loaded modules</Text>
          {/* Which armillary you are looking at, always visible. Two machines
              can both be serving a workspace, and only the host tells them apart.
              Wrapped in a Pressable rather than handing Link's `asChild` clone
              straight to the kit's Text: that Text only forwards the named
              props it declares, so an injected `onPress` lands on a component
              that drops it on the floor — the same silent-no-onPress shape
              Sprint 1 shipped once already, just with Text standing in for the
              View it happened to on. Pressable is a real host component and
              takes the clone correctly. */}
          <Link href="/settings" asChild>
            <Pressable hitSlop={8}>
              <Text variant="caption" color="txAccent" style={{ paddingTop: theme.space.xxs }}>
                {hostLabel} ›
              </Text>
            </Pressable>
          </Link>
        </Box>
      }
      ListEmptyComponent={
        <Box px="lg" style={{ paddingTop: theme.space.lg }}>
          <Text color="txTertiary">
            This workspace composes nothing. That is a working state, not an error.
          </Text>
        </Box>
      }
      renderSectionHeader={({ section }) => <SectionHeader>{section.title}</SectionHeader>}
      renderItem={({ item, index, section }) => (
        <>
          <ListRow
            icon="folder"
            label={item.name}
            note={item.note}
            onPress={() => router.push(`/browse/${item.path}`)}
          />
          {index < section.data.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
        </>
      )}
    />
  );
}
