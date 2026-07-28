import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { Instance } from '@/lib/session/events';
import { useTheme } from '@/theme';

export function InstanceCard({ instance }: { instance: Instance }) {
  const theme = useTheme();

  return (
    <Link href={`/(tabs)/(instances)/${instance.id}`} asChild>
      <Pressable
        style={({ pressed }) => ({
          opacity: pressed ? 0.6 : 1,
          paddingVertical: theme.space.md,
          borderBottomWidth: theme.border.hairline,
          borderBottomColor: theme.color.bdPrimary,
        })}>
        <View>
          <Text style={{ ...theme.type.heading, color: theme.color.txPrimary }}>
            {instance.operator ?? 'dispatcher'}
          </Text>
          <Text
            style={{
              ...theme.type.caption,
              color: theme.color.txTertiary,
              paddingTop: theme.space.xxs,
            }}>
            {instance.stream} · seq {instance.lastSeq}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
