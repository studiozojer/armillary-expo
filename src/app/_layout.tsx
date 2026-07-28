import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { HostProvider } from '@/lib/host-context';
import { PreferencesProvider } from '@/lib/preferences';
import { fontMap } from '@/theme/fonts.gen';
import { splashReady } from '@/theme/splash';
import { ThemeModeProvider } from '@/theme/theme-context';

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
  const [fontsLoaded, fontError] = useFonts(fontMap);

  // useFonts never reports loaded=true on failure — it sets fontError and
  // leaves fontsLoaded false forever. Gating purely on fontsLoaded would turn
  // a font-load failure into the same indefinite splash hang Task 3 fixed,
  // reached through a different door. splashReady() treats an error as
  // "proceed in system fonts" rather than "wait forever" — see its doc comment.
  const ready = splashReady(fontsLoaded, fontError);

  // preventAutoHideAsync() above holds the splash, so something has to release
  // it — the animated overlay used to, and when it was removed nothing did.
  //
  // Gated on `ready` rather than on mount: releasing it while the early
  // return below still holds would replace the splash with a blank screen,
  // trading a hang for a flash of nothing.
  useEffect(() => {
    if (!ready) return;
    if (fontError) console.warn('Studio fonts failed to load; rendering in system fonts.', fontError);
    void SplashScreen.hideAsync();
  }, [ready, fontError]);

  // Render nothing until the faces are registered (or have failed to load —
  // see splashReady). A frame drawn before then renders in system font and
  // then reflows, which reads as a bug in a screen recording even though it
  // corrects itself.
  if (!ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ThemeModeProvider>
        <HostProvider>
          <PreferencesProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="settings"
                options={{ title: 'Settings', presentation: 'modal' }}
              />
            </Stack>
          </PreferencesProvider>
        </HostProvider>
      </ThemeModeProvider>
    </ThemeProvider>
  );
}
