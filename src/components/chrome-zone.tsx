import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { Box, CircleButton, Inline } from '@/components/ui';

/**
 * The floating-button zone that replaces the nav header on the two tab roots.
 *
 * One component, mounted above each screen's state switch — never per branch.
 * The scar this rule comes from: a button present on the list state and absent
 * from the error state renders exactly like a screen with no button, which is
 * how Settings went missing once (see instances index).
 *
 * The gear is not a prop: which machine is serving is load-bearing on every
 * root, so the settings entry is the one control this zone always carries.
 */
export function ChromeZone({ trailing, testID }: { trailing?: ReactNode; testID?: string }) {
  const router = useRouter();

  return (
    <Box px="lg" py="sm" testID={testID}>
      <Inline justify="space-between">
        <CircleButton
          icon="settings"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
        />
        <Inline gap="sm">{trailing}</Inline>
      </Inline>
    </Box>
  );
}
