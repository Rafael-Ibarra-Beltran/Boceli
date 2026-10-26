import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme as t } from '../../src/ui/tokens';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: t.background }, headerTitleStyle: { fontFamily: t.bold, color: t.ink }, headerShadowVisible: false, tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.rule }, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.muted, tabBarLabelStyle: { fontFamily: t.bold, fontSize: 11 }, tabBarItemStyle: { paddingVertical: 2 } }}>
    <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? "sunny" : "sunny-outline"} focused={focused} size={size} /> }} />
    <Tabs.Screen name="history" options={{ title: 'Historial', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? "calendar" : "calendar-outline"} focused={focused} size={size} /> }} />
    <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? "options" : "options-outline"} focused={focused} size={size} /> }} />
  </Tabs>;
}

function TabIcon({ name, focused, size }: { name: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; size: number }) {
  return <View style={{ width: 52, height: size, borderRadius: t.radius.md, backgroundColor: focused ? t.accentSoft : t.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={name} size={size} color={focused ? t.ink : t.muted} style={{ lineHeight: size, includeFontPadding: false }} accessible={false} /></View>;
}
