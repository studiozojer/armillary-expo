import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Instance } from '@/lib/session/events';
import { useTheme } from '@/theme';

import { Box, Button, Inline, PanelHeader, Roundel, SectionHeader, Stack, Text } from './ui';

/**
 * Split a pinned model slug into the two things the panel shows.
 *
 * The engine records the FULL prefixed string as the instance's model —
 * `zen/deepseek-v4-flash` selects the OpenAI-compatible provider, a bare slug
 * is Anthropic's. So the provider is not a separate field to fetch; it is the
 * prefix, and its absence is itself the answer.
 *
 * `null` means nothing was pinned at creation and the engine's own default
 * pilots. We deliberately do NOT guess what that default is: the catalog is a
 * host fact (`~/.config/armillary/models.toml`) and this client has never been
 * told it. Naming it would be inventing a reading.
 */
export function splitModel(model: string | null): { model: string; provider: string | null } {
  if (model === null) return { model: 'engine default', provider: null };
  const slash = model.indexOf('/');
  if (slash === -1) return { model, provider: null };
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

/** A label/value pair in the CONTEXT block. */
function Reading({ label, value }: { label: string; value: string }) {
  return (
    <Inline justify="space-between">
      <Text variant="whyteXs" color="txTertiary">
        {label}
      </Text>
      <Text variant="whyteXs" numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </Text>
    </Inline>
  );
}

/**
 * What a section shows when the engine does not serve its data yet.
 *
 * Deliberately not a plausible number. A rendered `$2.11` is indistinguishable
 * from a measured one and will be believed — by the reader, and by whoever
 * picks this up in three weeks and wires a feature on top of it. The stub has
 * to say what is missing and why, or it is worse than an empty section.
 */
function NotYetServed({ what }: { what: string }) {
  return (
    // Dashed, which is the whole point: a solid card reads as a surface holding
    // content, and this one is holding an absence.
    <Box px="lg" py="md" radius="md" border="thin" borderColor="bdSecondary" style={{ borderStyle: 'dashed' }}>
      <Text variant="whyteXs" color="txDisabled">
        {what}
      </Text>
    </Box>
  );
}

/** A disabled control still needs a handler the types accept; it is never called. */
const noop = () => {};

/**
 * The instance panel — the drawer's content.
 *
 * Its shape is daoUI's, drawn in `bbjHiHEBoR3xWWruoprPkH` (`444:194`): a
 * `PanelHeader`, then CONTEXT / ACTIONS / SUMMARY / ARTIFACTS.
 *
 * **Only CONTEXT's first two readings are real.** `Instance` is
 * `id · operator · stream · startedAt · lastSeq · model` and nothing else, so
 * token counts, percentage-used and spend have no source on the wire — that is
 * engine work, not a rendering gap, and `instance-card.tsx` has said so in a
 * comment since 2026-07-28. Everything else here is a labelled stub.
 */
export function InstancePanel({
  instance,
  onDismiss,
  onInterrupt,
  canInterrupt = false,
  onArchive,
}: {
  instance: Instance | null;
  onDismiss: () => void;
  onInterrupt?: () => void;
  canInterrupt?: boolean;
  /**
   * Archive or unarchive, whichever the instance is not. One callback rather
   * than two: the verb is a function of `instance.archived`, so a caller that
   * had to pick would be re-deriving state this component already reads, and
   * the two could disagree.
   */
  onArchive?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const operator = instance?.operator ?? 'dispatcher';
  const { model, provider } = splitModel(instance?.model ?? null);

  return (
    // The SURFACE bleeds to the screen edge and the CONTENT is inset — not the
    // other way round. Once the drawer moved above the Stack it stopped being
    // clipped by the navigation header, which is the point, but it also means
    // nothing insets it any more: the panel spans the full window, status bar
    // and home indicator included (David, on device, 2026-08-12).
    //
    // Padding the container instead of the content would leave a transparent
    // band above the panel showing whatever is behind the drawer, which reads
    // as a gap rather than as a surface. So the fill stays full-bleed and only
    // what you read gets pushed clear.
    <View style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }} testID="instance-panel">
      <View style={{ paddingTop: insets.top }} testID="panel-top-inset" />
      <PanelHeader
        leading={<Roundel name={operator} />}
        title={operator}
        subtitle={instance ? instance.id.slice(0, 8) : undefined}
        onDismiss={onDismiss}
        dismissLabel="Close instance panel"
      />

      {/* The bottom edge has the same problem as the top: full-window means the
          home indicator sits over the last row. `xxxl` alone was a guess made
          when the drawer was still clipped by the screen it lived in. */}
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl + insets.bottom }}>
        <SectionHeader>Context</SectionHeader>
        <Box px="lg">
          <Stack gap="xs">
            <Reading label="model" value={model} />
            <Reading label="provider" value={provider ?? 'anthropic (default)'} />
            <Reading label="stream" value={instance?.stream ?? '—'} />
            <Reading label="seq" value={instance ? String(instance.lastSeq) : '—'} />
          </Stack>
        </Box>
        <Box px="lg" py="md">
          <NotYetServed what="Token usage, context percentage and spend are not on the wire yet — the engine does not serve them. This block fills in when it does." />
        </Box>

        <SectionHeader>Actions</SectionHeader>
        <Box px="lg" py="sm">
          <Inline gap="sm">
            <Button
              label="Interrupt"
              onPress={onInterrupt ?? noop}
              disabled={!canInterrupt}
              testID="panel-interrupt"
            />
            {/*
              Live as of 2026-08-12. `feat/instance-archive` shipped the verb as
              a long press on the instance row, which is discoverable only by
              accident; this is the same `api.archive` / `api.unarchive` pair
              reached from where the drawing put it. Two entry points, one path
              — deliberately not a second implementation.

              No confirm, matching the list (design 2026-08-11 D4): the verb acts
              immediately and the Archived filter is the undo.
            */}
            <Button
              label={instance?.archived ? 'Unarchive' : 'Archive'}
              variant="secondary"
              onPress={onArchive ?? noop}
              disabled={!instance || !onArchive}
              testID="panel-archive"
            />
          </Inline>
        </Box>

        <SectionHeader>Summary</SectionHeader>
        <Box px="lg" py="md">
          <NotYetServed what="No summary is generated yet. The engine would have to produce one; nothing in the log carries it today." />
        </Box>

        <SectionHeader>Artifacts</SectionHeader>
        <Box px="lg" py="md">
          <NotYetServed what="No artifacts. Nothing in the event schema marks a message as producing one, so this list has no source to read." />
        </Box>
      </ScrollView>
    </View>
  );
}
