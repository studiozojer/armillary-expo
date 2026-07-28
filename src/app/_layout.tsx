import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { HostProvider } from '@/lib/host-context';
import { fontMap } from '@/theme/fonts.gen';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts(fontMap);

  // preventAutoHideAsync() above holds the splash, so something has to release
  // it — the animated overlay used to, and when it was removed nothing did.
  //
  // Gated on fontsLoaded rather than on mount: releasing it while the early
  // return below still holds would replace the splash with a blank screen,
  // trading a hang for a flash of nothing.
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Render nothing until the faces are registered. A frame drawn before they
  // land renders in system font and then reflows, which reads as a bug in a
  // screen recording even though it corrects itself.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HostProvider>
        <AppTabs />
      </HostProvider>
    </ThemeProvider>
  );
}
