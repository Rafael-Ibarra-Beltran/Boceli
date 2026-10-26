import React from 'react';
import { Image } from 'react-native';
import { Tabs } from 'expo-router';
import { DailyView } from '../../src/ui/DailyView';

export default function Today() {
  return <><Tabs.Screen options={{ headerTitle: () => <Image accessibilityLabel="Boceli" source={require('../../assets/logo_full.png')} resizeMode="contain" style={{ width: 145, height: 56 }} /> }} /><DailyView /></>;
}
