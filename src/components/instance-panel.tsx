import { ScrollView, View } from 'react-native';

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
}: {
  instance: Instance | null;
  onDismiss: () => void;
  onInterrupt?: () => void;
  canInterrupt?: boolean;
}) {
  const theme = useTheme();
  const operator = instance?.operator ?? 'dispatcher';
  const { model, provider } = splitModel(instance?.model ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }} testID="instance-panel">
      <PanelHeader
        leading={<Roundel name={operator} />}
        title={operator}
        subtitle={instance ? instance.id.slice(0, 8) : undefined}
        onDismiss={onDismiss}
        dismissLabel="Close instance panel"
      />

      <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl }}>
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
              Archive belongs here by design — this panel is the entry point the
              drawing gives it — but it is being built on `feat/instance-archive`
              in a parallel window. Left inert on purpose rather than
              implemented twice; whoever merges wires this one button.
            */}
            <Button label="Archive" variant="secondary" onPress={noop} disabled testID="panel-archive" />
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
