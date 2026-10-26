import React, { useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme as t } from './tokens';

export function RegisterSheetScroll({ children, finalAction, resetKey }: {
  children: React.ReactNode;
  finalAction?: React.ReactNode;
  resetKey: string;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();
  const previousKey = useRef(resetKey);
  useEffect(() => {
    if (previousKey.current === resetKey) return;
    previousKey.current = resetKey;
    // UIKit owns the top offset when iOS applies automatic header insets.
    if (Platform.OS === 'ios') return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [resetKey]);

  // iOS formSheet needs a direct ScrollView child to track its viewport when dragged.
  return <ScrollView
    ref={scroll}
    style={styles.viewport}
    contentContainerStyle={[styles.content, { paddingBottom: 20 + (Platform.OS === 'android' ? insets.bottom : 0) }]}
    contentInsetAdjustmentBehavior="automatic"
    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    keyboardShouldPersistTaps="handled"
    removeClippedSubviews={false}
  >
    {children}
    {finalAction && <View style={styles.finalAction}>{finalAction}</View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: t.background },
  content: { padding: 20, maxWidth: 680, width: '100%', alignSelf: 'center' },
  finalAction: { gap: 12, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: t.rule },
});
