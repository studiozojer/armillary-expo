import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { HostProvider } from '@/lib/host-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // preventAutoHideAsync() above holds the splash, so something has to release
  // it. The animated overlay used to; when it was removed nothing did, and the
  // app hung on the splash while tsc and the whole suite stayed green.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HostProvider>
        <AppTabs />
      </HostProvider>
    </ThemeProvider>
  );
}
