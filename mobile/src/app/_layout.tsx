import { useEffect } from 'react';
import { ZhiMangXing_400Regular } from '@expo-google-fonts/zhi-mang-xing';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppUpdate } from '@/hooks/use-app-update';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ZhiMangXing_400Regular,
  });
  useAppUpdate();

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen
          name="memory"
          options={{ animation: 'slide_from_right', gestureEnabled: true }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
