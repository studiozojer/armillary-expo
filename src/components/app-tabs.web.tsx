import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The web tab bar. Instances first, Explorer second.
 *
 * Native still orders these the other way round; Task 11 flips it, after which
 * both platforms agree. Until then the two deliberately differ, and this note
 * is here so the difference reads as scheduled rather than accidental.
 *
 * Rebuilt off the Expo template's themed-text/themed-view wrappers, which
 * carried their own hardcoded palette and could not follow daoUI. Both are
 * deleted; this is the only version of this file that compiles.
 */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <TabBar>
          {/* Group-qualified on both, because both tab indexes resolve to `/`
              and only the group segment tells them apart. Both moved with the
              tabs into `(tabs)`; the unqualified hrefs no longer resolve. */}
          <TabTrigger name="(instances)" href="/(tabs)/(instances)" asChild>
            <TabButton>Instances</TabButton>
          </TabTrigger>
          <TabTrigger name="(explorer)" href="/(tabs)/(explorer)" asChild>
            <TabButton>Explorer</TabButton>
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      style={{
        paddingVertical: theme.space.sm,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.full,
        backgroundColor: isFocused ? theme.color.bgSolidCardSecondary : 'transparent',
      }}>
      <Text
        style={{
          ...theme.type.label,
          color: isFocused ? theme.color.txPrimary : theme.color.txTertiary,
        }}>
        {children}
      </Text>
    </Pressable>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        bottom: theme.space.lg,
        width: '100%',
        alignItems: 'center',
      }}>
      <View
        style={{
          flexDirection: 'row',
          gap: theme.space.xs,
          padding: theme.space.xs,
          borderRadius: theme.radius.full,
          backgroundColor: theme.color.bgSolidCard,
        }}>
        {props.children}
      </View>
    </View>
  );
}
