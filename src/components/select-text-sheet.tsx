import { Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';

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
 *
 * The text element is platform-split, and both halves are load-bearing
 * (device-verified 2026-08-06): on iOS a selectable Text gives only the
 * select-all copy callout — drag handles do not exist for Text there, so a
 * non-editable multiline TextInput (a real UITextView) is the only route to
 * partial selection. On Android it is exactly reversed: selectable Text has
 * proper handles, while a non-editable TextInput refuses selection outright.
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
          {Platform.OS === 'ios' ? (
            <TextInput
              value={text ?? ''}
              editable={false}
              multiline
              scrollEnabled={false}
              style={{ ...theme.type.body, color: theme.color.txPrimary }}
            />
          ) : (
            <Text selectable style={{ ...theme.type.body, color: theme.color.txPrimary }}>
              {text ?? ''}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
