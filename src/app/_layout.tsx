import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { HostProvider } from '@/lib/host-context';
import { PreferencesProvider } from '@/lib/preferences';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <HostProvider>
        <PreferencesProvider>
          <AppTabs />
        </PreferencesProvider>
      </HostProvider>
    </ThemeProvider>
  );
}
