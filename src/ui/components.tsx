import React, { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, useReduceMotion } from './motion';
import { theme as t } from './tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export { FadeIn };

export function Copy({ children, muted = false, size = 15, bold = false, color }: { children: React.ReactNode; muted?: boolean; size?: number; bold?: boolean; color?: string }) {
  return <Text style={{ color: color ?? (muted ? t.muted : t.ink), fontFamily: bold ? t.bold : t.regular, fontSize: size, lineHeight: size * 1.5 }}>{children}</Text>;
}
export function Title({ children, subtitle }: { children: string; subtitle?: string }) {
  return <View style={{ gap: 5, marginBottom: 24 }}><Text accessibilityRole="header" style={styles.title}>{children}</Text>{subtitle && <Copy muted>{subtitle}</Copy>}</View>;
}
export function Screen({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 28 + (footer ? 0 : insets.bottom) }]}>{children}</ScrollView>
    {footer && <View style={[styles.footerSurface, { paddingBottom: Math.max(insets.bottom, 16) }]}><View style={styles.footer}>{footer}</View></View>}
  </KeyboardAvoidingView>;
}
export function Button({ title, onPress, variant = 'primary', disabled = false, busy = false, icon, style }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; busy?: boolean; icon?: IoniconName; style?: ViewStyle }) {
  const reducedMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!disabled && !busy && !reducedMotion) return;
    animation.current?.stop();
    animation.current = null;
    scale.setValue(1);
  }, [busy, disabled, reducedMotion, scale]);
  useEffect(() => () => animation.current?.stop(), []);

  const animateScale = (toValue: number) => {
    if (disabled || busy || reducedMotion) {
      animation.current?.stop();
      animation.current = null;
      scale.setValue(1);
      return;
    }
    animation.current?.stop();
    const next = Animated.timing(scale, { toValue, duration: t.motion.press, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.current = next;
    next.start(({ finished }) => {
      if (finished && animation.current === next) animation.current = null;
    });
  };

  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} onPressIn={() => animateScale(0.98)} onPressOut={() => animateScale(1)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={[
      styles.button,
      variant === 'primary' ? styles.primary : styles.secondary,
      style,
      { transform: [{ scale }], opacity: disabled && !busy ? 0.5 : hovered ? 0.96 : 1, borderColor: focused ? t.focus : hovered ? t.muted : 'transparent' },
    ]}>
      <View style={styles.buttonContents}>
        {busy ? <ActivityIndicator color={variant === 'danger' ? t.danger : t.ink} size="small" accessibilityElementsHidden importantForAccessibility="no" /> : icon && <Ionicons name={icon} size={20} color={variant === 'danger' ? t.danger : t.ink} accessibilityElementsHidden importantForAccessibility="no" />}
        <Text style={[styles.buttonText, variant === 'danger' && { color: t.danger }]}>{title}</Text>
      </View>
  </AnimatedPressable>;
}
export function Field({ label, help, ...props }: TextInputProps & { label: string; help?: string }) {
  const [focused, setFocused] = useState(false);
  const { onFocus, onBlur, editable = true, style, ...inputProps } = props;
  return <View style={{ gap: 6, marginBottom: 16 }}><Copy bold size={13}>{label}</Copy><TextInput accessibilityLabel={label} placeholderTextColor={t.muted} {...inputProps} editable={editable} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={[styles.input, style, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, !editable && styles.inputDisabled, focused && editable && styles.inputFocused]} />{help && <Copy muted size={12}>{help}</Copy>}</View>;
}
export function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: IoniconName }) {
  return <View style={{ marginBottom: 28, gap: 12 }}><View style={styles.sectionHeading}>{icon && <Ionicons name={icon} size={20} color={t.ink} accessibilityElementsHidden importantForAccessibility="no" />}<Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}
export function Message({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.message, error ? styles.messageError : styles.messageInfo]}>
    <Ionicons name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={20} color={error ? t.danger : t.muted} accessibilityElementsHidden importantForAccessibility="no" />
    <View style={{ flex: 1 }}><Copy>{children}</Copy></View>
  </View>;
}
export function Disclosure({ title, summary, initiallyOpen = false, children }: { title: string; summary?: string; initiallyOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={styles.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={summary ? `${title}, ${summary}` : title} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={({ pressed }) => [styles.disclosureHeader, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ flex: 1, gap: 4 }}><Copy bold>{title}</Copy>{summary && <Copy muted size={12}>{summary}</Copy>}</View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.muted} />
    </Pressable>
    <View style={{ display: open ? 'flex' : 'none', padding: 16, paddingTop: 4, gap: 12 }} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>{children}</View>
  </View>;
}
export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (value: T) => void }) {
  return <View style={styles.choices}>{options.map(option => {
    const selected = value === option.value;
    return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onChange(option.value)} style={[styles.choice, selected && { backgroundColor: t.accentSoft, borderColor: t.ink }]}>
      <View style={styles.choiceContents}><View style={{ flexShrink: 1 }}><Copy size={13} bold={selected}>{option.label}</Copy></View>{selected && <Ionicons name="checkmark-circle" size={16} color={t.ink} accessibilityElementsHidden importantForAccessibility="no" />}</View>
    </Pressable>;
  })}</View>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: 20, paddingTop: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  title: { fontFamily: t.extraBold, fontSize: 30, color: t.ink, letterSpacing: -1, lineHeight: 39 },
  sectionTitle: { fontFamily: t.bold, fontSize: 18, color: t.ink, flexShrink: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { minHeight: 52, paddingHorizontal: 20, paddingVertical: 14, borderRadius: t.radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: t.accent }, secondary: { backgroundColor: t.surfaceTint },
  buttonContents: { maxWidth: '100%', flexShrink: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: t.ink, fontFamily: t.bold, fontSize: 15, textAlign: 'center', flexShrink: 1 },
  input: { backgroundColor: t.surface, borderColor: t.rule, borderWidth: 2, borderRadius: t.radius.sm, minHeight: 52, padding: 14, fontSize: 16, color: t.ink, fontFamily: t.regular },
  inputDisabled: { backgroundColor: t.surfaceTint, color: t.ink },
  inputFocused: { borderColor: t.focus },
  footerSurface: { backgroundColor: t.background },
  footer: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 14, gap: 8 },
  message: { padding: 14, marginBottom: 16, borderRadius: t.radius.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  messageError: { backgroundColor: t.errorSoft },
  messageInfo: { backgroundColor: t.accentSoft },
  disclosure: { backgroundColor: t.surface, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.rule, marginBottom: 12, overflow: 'hidden' },
  disclosureHeader: { padding: 16, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  choice: { maxWidth: '100%', flexShrink: 1, padding: 12, minHeight: 46, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.rule, backgroundColor: t.surface, justifyContent: 'center' },
  choiceContents: { maxWidth: '100%', flexDirection: 'row', flexShrink: 1, alignItems: 'center', gap: 7 },
});
