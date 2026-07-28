import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The entry into Settings, in the header rather than floating — an
 * absolutely-positioned button on a screen that owns no chrome ends up
 * underneath the native tab bar.
 *
 * Shared by both tabs' root screens because Settings is shared. It went missing
 * entirely once already: the old three-section Explorer reached it by tapping
 * the host label, the filesystem rewrite replaced that header, and the only
 * link in the app went with it. A missing link renders exactly like a screen
 * that has no button, so nothing failed — which is the argument for one
 * component both screens use rather than two hand-placed copies.
 */
export function SettingsButton() {
  const theme = useTheme();

  return (
    <Link href="/settings" asChild>
      <Pressable hitSlop={8}>
        <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Settings</Text>
      </Pressable>
    </Link>
  );
}
