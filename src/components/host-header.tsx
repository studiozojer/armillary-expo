import type { ReactNode } from 'react';

import { Box, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The workspace identity header: which machine is serving this screen.
 *
 * Grown out of Explorer's inline header (2026-07-28 visual pass, § 3) when
 * Instances asked for the same thing (David, 2026-08-24) — one component so
 * the two tab roots cannot drift apart. The name is `Host.label`, the same
 * string Settings shows, in the display register.
 *
 * `children` is the caller's own second line — Explorer's composition counts
 * linking to `/composition`; Instances has none today. What goes there is
 * the screen's fact, not the host's, so this component does not decide it.
 *
 * No horizontal inset of its own: Explorer mounts it inside `TreeList`'s
 * header slot, which already wraps in `px="lg"`, and Instances mounts it in
 * the same `Box px="lg"` its create pill sits in. Owning `px` here would
 * double it on one tab or the other.
 */
export function HostHeader({ label, children }: { label: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <Box style={{ paddingTop: theme.space.md, paddingBottom: theme.space.md }}>
      <Text variant="display">{label}</Text>
      {children}
    </Box>
  );
}
