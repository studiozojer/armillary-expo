import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { HostProvider } from '@/lib/host-context';
import { fontMap } from '@/theme/fonts.gen';
import { splashReady } from '@/theme/splash';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
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
      <HostProvider>
        <AppTabs />
      </HostProvider>
    </ThemeProvider>
  );
}
