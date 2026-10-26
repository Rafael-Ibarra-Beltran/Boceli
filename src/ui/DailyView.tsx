import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Copy, Field, Message, Screen, Section, Disclosure, FadeIn, Title } from './components';
import { theme as t } from './tokens';
import { useStore } from './store';
import type { Category } from '../domain/types';
import { dayTotal, formatKcal, goalForDay, isCalendarDay, localDay, mealKcal, noticeForDay, shiftDay } from '../domain/calculations';

const categoryIcon: Record<Category, React.ComponentProps<typeof Ionicons>['name']> = { Desayuno: 'cafe-outline', Comida: 'restaurant-outline', Cena: 'moon-outline', Snacks: 'nutrition-outline' };

export function DailyView({ history = false }: { history?: boolean }) {
  const { data, loading, error, busy } = useStore();
  const [day, setDay] = useState(localDay);
  const [dateInput, setDateInput] = useState(day);
  const [dateError, setDateError] = useState('');
  useEffect(() => {
    if (history) return;
    const tick = () => setDay(localDay());
    const timer = setInterval(tick, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [history]);
  const selectDay = (value: string) => { setDay(value); setDateInput(value); setDateError(''); };
  const total = dayTotal(data.meals, day);
  const goal = goalForDay(data.goals, day);
  const target = goal?.mode !== 'log' ? goal?.kcal : null;
  const meals = data.meals.filter(meal => meal.day === day).slice().reverse();
  const notice = noticeForDay(total, goal, data.preferences);
  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', ...(history ? { year: 'numeric' as const } : {}) });
  return <Screen footer={<Button icon="add-outline" title="Registrar comida" disabled={busy || loading || !!error} onPress={() => router.push({ pathname: '/register', params: { day } })} />}>
    {loading ? <ActivityIndicator color={t.ink} /> : error ? <Message error>{error}</Message> : <>
      {!history && <Title subtitle="Un espacio para lo que comes.">Tu día, a tu ritmo</Title>}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
        {history && <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" onPress={() => selectDay(shiftDay(day, -1))} style={{ padding: 12, minHeight: 44, minWidth: 44 }}><Ionicons name="chevron-back" size={22} color={t.ink} /></Pressable>}
        <View style={{ flex: 1 }}><Copy muted size={13}>{dateLabel}</Copy></View>
        {history && <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" onPress={() => selectDay(shiftDay(day, 1))} style={{ padding: 12, minHeight: 44, minWidth: 44 }}><Ionicons name="chevron-forward" size={22} color={t.ink} /></Pressable>}
      </View>
      {history && <Disclosure title="Elegir fecha">
        <Field label="Consultar fecha" value={dateInput} placeholder="AAAA-MM-DD" onChangeText={setDateInput} autoCapitalize="none" maxLength={10} />
        <Button title="Ver día" variant="secondary" onPress={() => isCalendarDay(dateInput) ? selectDay(dateInput) : setDateError('Usa una fecha válida: AAAA-MM-DD.')} />
      </Disclosure>}
      {!!dateError && <Message error>{dateError}</Message>}
      <FadeIn replayKey={day}>
      <View style={daily.summary}>
        <View style={daily.summaryHeading}>
          <View style={daily.summaryLabel}><Ionicons name="restaurant-outline" size={20} color={t.onDark} accessible={false} /><Copy color={t.onDark} bold size={13}>Consumo del día</Copy></View>
          <View style={daily.count}><Copy color={t.onDark} size={12}>{meals.length} {meals.length === 1 ? 'comida' : 'comidas'}</Copy></View>
        </View>
        <View style={daily.figureRow}>
          <Text accessibilityLabel={`${formatKcal(total)} consumidas`} style={daily.figure}>{new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(total)}</Text><Copy color={t.mutedOnDark}>kcal</Copy>
        </View>
        {target != null ? <>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Consumo respecto a la meta" accessibilityValue={{ min: 0, max: target, now: Math.round(Math.min(total, target)), text: `${formatKcal(total)} de ${formatKcal(target)}` }} style={daily.track}>
            <View style={{ height: '100%', width: `${Math.min(100, total / target * 100)}%`, backgroundColor: t.accent, borderRadius: 4 }} />
          </View>
          <View style={daily.meta}>
            <Copy color={t.mutedOnDark} size={13}>Meta · {formatKcal(target)}</Copy>
            <Copy color={t.onDark} bold size={13}>{total > target ? `${formatKcal(total - target)} sobre la meta` : `${formatKcal(target - total)} disponibles`}</Copy>
          </View>
        </> : <>
          <Copy color={t.mutedOnDark} size={13}>Solo registro</Copy>
          {!goal && !history && <Pressable accessibilityRole="button" accessibilityLabel="Elegir modo de seguimiento" onPress={() => router.push('/profile')} style={daily.setup}><Copy color={t.onDark} bold size={13}>Elegir modo de seguimiento</Copy><Ionicons name="arrow-forward" size={20} color={t.onDark} accessible={false} /></Pressable>}
        </>}
      </View>
      </FadeIn>
      {notice && <Message>{notice}</Message>}
      <Section icon="restaurant-outline" title={`Tus comidas${meals.length ? ` · ${meals.length}` : ''}`}>
        {!meals.length ? <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
          <View style={{ padding: 18, borderRadius: t.radius.lg, backgroundColor: t.surfaceTint }}><Ionicons name="restaurant-outline" size={30} color={t.muted} /></View>
          <Copy bold>Aún no hay comidas</Copy><Copy muted size={13}>Tu próxima comida empieza aquí.</Copy>
        </View> : meals.map(meal => <View key={meal.id} style={daily.meal}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${meal.name}, ${formatKcal(mealKcal(meal))}, ${meal.category}${meal.items.some(item => item.estimated) ? ', incluye estimaciones' : ''}`} disabled={busy} onPress={() => router.push({ pathname: '/register', params: { edit: meal.id } })} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ padding: 10, backgroundColor: t.surfaceTint, borderRadius: t.radius.sm }}><Ionicons name={categoryIcon[meal.category]} size={24} color={t.ink} accessible={false} /></View>
            <View style={{ flex: 1, gap: 3 }}><Copy muted size={12}>{meal.category}</Copy><Copy bold size={16}>{meal.name}</Copy><Copy size={13}>{formatKcal(mealKcal(meal))}{meal.items.some(item => item.estimated) ? ' · estimadas' : ''}</Copy></View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Repetir ${meal.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => router.push({ pathname: '/register', params: { repeat: meal.id, day: localDay() } })} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceTint, borderRadius: t.radius.sm }}><Ionicons name="repeat-outline" size={20} color={t.ink} /></Pressable>
        </View>)}
      </Section>

    </>}
  </Screen>;
}

const daily = StyleSheet.create({
  summary: { padding: 24, borderRadius: t.radius.lg, backgroundColor: t.ink, marginBottom: 32, gap: 20 },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  count: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: t.radius.sm, backgroundColor: t.darkSurface },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  figure: { fontFamily: t.extraBold, color: t.onDark, fontSize: 56, lineHeight: 68, letterSpacing: -2, fontVariant: ['tabular-nums'], flexShrink: 1 },
  track: { height: 8, borderRadius: 4, backgroundColor: t.darkSurface, overflow: 'hidden' },
  meta: { gap: 4 },
  setup: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  meal: { padding: 16, backgroundColor: t.surface, borderRadius: t.radius.md, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.rule },
});
