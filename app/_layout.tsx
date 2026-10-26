import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/ui/store';
import { theme as t } from '../src/ui/tokens';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
    Manrope_500Medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
    Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
    Manrope_800ExtraBold: require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf'),
  });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: t.background, justifyContent: 'center' }}><ActivityIndicator color={t.ink} /></View>;
  return <SafeAreaProvider><StoreProvider><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: t.background }, headerTintColor: t.ink, headerShadowVisible: false, contentStyle: { backgroundColor: t.background }, headerTitleStyle: { fontFamily: t.bold }, headerBackTitle: 'Volver' }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="register" options={{ title: 'Registrar comida', presentation: 'formSheet', headerShown: Platform.OS === 'ios', sheetAllowedDetents: [0.8, 0.95], sheetInitialDetentIndex: 0, sheetGrabberVisible: true, sheetCornerRadius: t.radius.lg }} />
    <Stack.Screen name="profile" options={{ title: 'Perfil y meta' }} />
  </Stack></StoreProvider></SafeAreaProvider>;
}
