import { Modal, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Partial text selection lives here, not inline in the chat list: an inline
 * selection collides with the evict long-press and is dismissed by streaming
 * re-renders (spec decision 1). A local Modal rather than an expo-router
 * formSheet route: no params, no session re-attach, and none of the
 * transparent-header-under-liquid-glass behaviour the July sheet work hit.
 * Shows raw text, not rendered markdown — matching what Copy puts on the
 * clipboard.
 */
export function SelectTextSheet({ text, onDone }: { text: string | null; onDone: () => void }) {
  const theme = useTheme();
  return (
    <Modal
      visible={text !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      testID="select-text-modal"
      onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: theme.color.bgSolidBase }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: theme.space.lg,
            paddingTop: theme.space.md,
          }}>
          <Button label="Done" variant="secondary" onPress={onDone} />
        </View>
        <ScrollView contentContainerStyle={{ padding: theme.space.lg }}>
          <Text selectable style={{ ...theme.type.body, color: theme.color.txPrimary }}>
            {text ?? ''}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
