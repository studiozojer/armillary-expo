import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InstanceCard } from '@/components/instance-card';
import type { Instance } from '@/lib/session/events';
import { MockSessionAPI } from '@/lib/session/mock';
import { useTheme } from '@/theme';

const api = new MockSessionAPI();

export default function Instances() {
  const theme = useTheme();
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    void api.list().then(setInstances);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      {/* The banner is the point. A stub that looks live is a lie the screen
          tells every time it is opened, and this one will sit here for at least
          a sprint. */}
      <View
        style={{
          margin: theme.space.lg,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.bgWarning,
          borderWidth: theme.border.thin,
          borderColor: theme.color.bdSecondary,
        }}>
        <Text style={{ ...theme.type.label, color: theme.color.txWarning }}>Not live yet</Text>
        <Text
          style={{
            ...theme.type.caption,
            color: theme.color.txSecondary,
            paddingTop: theme.space.xxs,
          }}>
          Fixture data behind the SessionAPI seam. The engine has no loop in sprint 1.
        </Text>
      </View>

      <FlatList
        data={instances}
        keyExtractor={(instance) => instance.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.lg }}
        renderItem={({ item }) => <InstanceCard instance={item} />}
      />
    </SafeAreaView>
  );
}
