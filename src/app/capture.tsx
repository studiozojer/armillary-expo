import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { INBOX_BASE_URL } from '@/lib/config';
import { uploadToInbox } from '@/lib/upload';
import { useTheme } from '@/theme';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending'; name: string }
  | { kind: 'sent'; name: string }
  | { kind: 'failed'; message: string };

export default function Capture() {
  const theme = useTheme();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function pickAndUpload() {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    setStatus({ kind: 'sending', name: asset.name });
    try {
      await uploadToInbox({
        uri: asset.uri,
        filename: asset.name,
        recordedAt: new Date(),
        token: process.env.EXPO_PUBLIC_INBOX_TOKEN ?? '',
      });
      setStatus({ kind: 'sent', name: asset.name });
    } catch (e) {
      setStatus({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const message =
    status.kind === 'idle'
      ? INBOX_BASE_URL
      : status.kind === 'sending'
        ? `sending ${status.name}…`
        : status.kind === 'sent'
          ? `sent ${status.name}`
          : status.message;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Capture' }} />
      <View style={{ flex: 1, padding: theme.space.lg, gap: theme.space.md }}>
        <Text style={{ ...theme.type.body, color: theme.color.txSecondary }}>
          Send a file to the workspace inbox. Replaces the iOS Shortcut.
        </Text>

        <Pressable
          onPress={pickAndUpload}
          style={{
            alignSelf: 'flex-start',
            paddingVertical: theme.space.md,
            paddingHorizontal: theme.space.xl,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.bgAccent,
            borderWidth: theme.border.thin,
            borderColor: theme.color.bdAccent,
          }}>
          <Text style={{ ...theme.type.label, color: theme.color.txAccent }}>Choose a file</Text>
        </Pressable>

        <Text
          style={{
            ...theme.type.caption,
            color: status.kind === 'failed' ? theme.color.txError : theme.color.txTertiary,
          }}>
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}
