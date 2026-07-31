import { Link, useRouter } from 'expo-router';
import { Pressable, RefreshControl, SectionList } from 'react-native';

import { useTheme } from '@/theme';
import type { Composition, Module, SyncReport, SyncRepo, SyncSkipReason } from '@/lib/daemon/types';

import { Box, Button, ListRow, ROW_ICON_LANE, Rule, SectionHeader, Text } from './ui';

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

/** Every skip/error reason the wire can carry, in words rather than enum
 *  spelling. `Record<SyncSkipReason, string>` on purpose: a new member of the
 *  union without a label here is a compile error, not a row reading
 *  `task-failed`. */
const SKIP_LABELS: Record<SyncSkipReason, string> = {
  dirty: 'dirty',
  diverged: 'diverged',
  detached: 'detached HEAD',
  timeout: 'timed out',
  'no-upstream': 'no upstream',
  'git-error': 'git error',
  'task-failed': 'failed',
};

/**
 * What a row says about itself. Named for what happened, not for the enum —
 * "no upstream" rather than "no-upstream", "+2" rather than "synced", because
 * the row is read at a glance and the count is the information.
 */
export function syncLabel(repo: SyncRepo): string {
  switch (repo.status) {
    case 'synced':
      return `+${repo.commits ?? 0}`;
    case 'behind':
      return `behind ${repo.commits ?? 0}`;
    case 'current':
      return 'current';
    case 'skipped':
      return repo.reason ? SKIP_LABELS[repo.reason] : 'skipped';
    case 'error':
      return repo.reason ? SKIP_LABELS[repo.reason] : 'error';
  }
}

export function ModuleList({
  composition,
  hostLabel,
  refreshing = false,
  onRefresh,
  sync,
  syncing = false,
  onSync,
}: {
  composition: Composition;
  hostLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Absent until `/sync` answers — the list renders without waiting on it. */
  sync?: SyncReport;
  syncing?: boolean;
  onSync?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const data = sections(composition);
  const byPath = new Map((sync?.repos ?? []).map((r) => [r.path, r]));

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
          {sync && !sync.fetched ? (
            <Text variant="caption" color="txTertiary" style={{ paddingTop: theme.space.xxs }}>
              Statuses as of last sync
            </Text>
          ) : null}
          {sync?.enabled && onSync ? (
            <Box style={{ paddingTop: theme.space.sm }}>
              <Button
                testID="sync-action"
                label={syncing ? 'Syncing…' : 'Sync'}
                onPress={onSync}
                disabled={syncing}
              />
            </Box>
          ) : null}
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
      renderItem={({ item, index, section }) => {
        const status = byPath.get(item.path);
        return (
          <>
            <ListRow
              icon="folder"
              label={item.name}
              note={item.note}
              testID={`module-row-${item.path}`}
              trailing={
                status ? (
                  <Text
                    variant="caption"
                    color={
                      status.status === 'skipped' || status.status === 'error'
                        ? 'txTertiary'
                        : 'txSecondary'
                    }>
                    {syncLabel(status)}
                  </Text>
                ) : undefined
              }
              onPress={() => router.push(`/browse/${item.path}`)}
            />
            {index < section.data.length - 1 ? <Rule inset={ROW_ICON_LANE} /> : null}
          </>
        );
      }}
      ListFooterComponent={
        sync && (sync.not_composed.length > 0 || sync.repos.some((r) => r.submodules)) ? (
          <Box px="lg" style={{ paddingTop: theme.space.lg }}>
            {sync.not_composed.length > 0 ? (
              <Text variant="caption" color="txTertiary">
                {/* The sweep's blind spot, made visible. Skipping an undeclared
                    checkout in silence reads identically to having nothing to
                    skip. */}
                Not composed, and not synced:{' '}
                {sync.not_composed.map((n) => n.path).join(', ')}
              </Text>
            ) : null}
            {sync.repos.some((r) => r.submodules) ? (
              <Text
                variant="caption"
                color="txTertiary"
                style={{ paddingTop: theme.space.xxs }}>
                {/* D5, said out loud: the pointer moved, the checkout did not.
                    A deliberate limit nobody can see reads as a bug. */}
                Submodules not updated:{' '}
                {sync.repos.filter((r) => r.submodules).map((r) => r.name).join(', ')}
              </Text>
            ) : null}
          </Box>
        ) : null
      }
    />
  );
}
