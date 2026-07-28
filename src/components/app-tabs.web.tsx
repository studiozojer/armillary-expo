import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The web tab bar. Mirrors the native pill: Instances first, Explorer second.
 *
 * Rebuilt off the Expo template's ThemedText/ThemedView, which carried their
 * own hardcoded palette and could not follow daoUI.
 */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="(instances)" href="/(instances)" asChild>
            <TabButton>Instances</TabButton>
          </TabTrigger>
          <TabTrigger name="(explorer)" href="/" asChild>
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
