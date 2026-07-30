import { useFonts } from 'expo-font';
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';

import { HostProvider } from '@/lib/host-context';
import { PreferencesProvider } from '@/lib/preferences';
import { navThemeFor, useTheme } from '@/theme';
import { fontMap } from '@/theme/fonts.gen';
import { splashReady } from '@/theme/splash';
import { ThemeModeProvider } from '@/theme/theme-context';

SplashScreen.preventAutoHideAsync();

/**
 * The navigation chrome, themed from the same tokens as the content.
 *
 * A separate component rather than inline in RootLayout because it has to read
 * `useTheme()`, and that hook only sees the app-owned mode from *inside*
 * ThemeModeProvider. The provider order used to be the other way round —
 * ThemeProvider above ThemeModeProvider, reading the raw `useColorScheme()` —
 * which agrees with the content today only because `Appearance.setColorScheme`
 * is process-wide. A mode held in context alone would silently desync the
 * chrome from the screen it frames.
 */
function NavigationChrome({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <ThemeProvider value={navThemeFor(theme)}>{children}</ThemeProvider>;
}

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
 *
 * The instance chat is here too, and for a second reason on top of that one:
 * a screen registered above the tab bar takes the bar with it when pushed, so
 * the chat is entered rather than opened over. That makes this stack the home
 * of both kinds of screen that leave the tabs behind — the shared modal, and
 * the pushed destination.
 */
export default function RootLayout() {
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
    <ThemeModeProvider>
      <NavigationChrome>
        <HostProvider>
          <PreferencesProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="settings"
                options={{ title: 'Settings', presentation: 'modal' }}
              />
              {/* The chat sits on the ROOT stack, not inside the Instances
                  group, so the tab bar belongs to the screen it is pushed
                  from: list and bar translate off together, and the chat comes
                  in over neither. This is UIKit's `hidesBottomBarWhenPushed`
                  obtained by structure rather than by a custom transition —
                  the same reason Settings lives here, one level above the bar.

                  `title` is a FALLBACK, not the header: the screen sets its
                  own title to `@operator` (or `dispatcher`) once attach()
                  resolves. Both it and `headerBackButtonDisplayMode` were
                  inherited from the `(instances)` group layout this route
                  left, and are re-declared here because nothing else would
                  supply them. */}
              <Stack.Screen
                name="instance/[instanceId]"
                options={{ title: 'Instance', headerBackButtonDisplayMode: 'minimal' }}
              />
            </Stack>
          </PreferencesProvider>
        </HostProvider>
      </NavigationChrome>
    </ThemeModeProvider>
  );
}
