import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HostProvider } from '@/lib/host-context';
import { PreferencesProvider } from '@/lib/preferences';

SplashScreen.preventAutoHideAsync();

/**
 * The root is a `Stack`, and the tab bar sits inside it.
 *
 * Settings is shared — the host switcher and the dotfile preference both apply
 * to every tab — so it cannot live inside one tab's stack, where only that tab
 * could reach it. Nor can each tab declare its own: sibling groups would
 * collide on the same `/settings` URL. A modal on the root stack is the one
 * place a screen can be presented from either tab while belonging to neither.
 *
 * The tabs screen hides its own header because each group inside it runs its
 * own `Stack` and draws one.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <HostProvider>
        <PreferencesProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
          </Stack>
        </PreferencesProvider>
      </HostProvider>
    </ThemeProvider>
  );
}
