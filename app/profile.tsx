import React, { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, Text, View } from 'react-native';
import { Button, Choice, Copy, Disclosure, Field, Message, Screen, Section } from '../src/ui/components';
import { useStore } from '../src/ui/store';
import type { Mode, Profile as ProfileData } from '../src/domain/types';
import { calculateProposal, goalForDay, isCalendarDay, localDay, parseNumber, validateManualGoal } from '../src/domain/calculations';
import { profileSchema } from '../src/domain/validation';
import { theme as t } from '../src/ui/tokens';

const modes: { label: string; value: Mode }[] = [
  { label: 'Bajar de peso', value: 'lose' },
  { label: 'Mantener', value: 'maintain' },
  { label: 'Solo registrar', value: 'log' },
];
function friendly(error: unknown) { return error instanceof Error ? error.message : 'No se pudo guardar el cambio.'; }

export default function ProfileScreen() {
  const { data, repository, refresh, busy } = useStore();
  const today = localDay();
  const current = goalForDay(data.goals, today);
  const [mode, setMode] = useState<Mode>(current?.mode ?? 'log');
  const [targetType, setTargetType] = useState<'estimate' | 'manual'>(current?.method === 'manual' ? 'manual' : 'estimate');
  const profile = data.profile;
  const [age, setAge] = useState(profile ? String(profile.age) : '');
  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : '');
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '');
  const [physiology, setPhysiology] = useState<'male' | 'female' | null>(profile?.physiology ?? null);
  const [activity, setActivity] = useState<ProfileData['activity']>(profile?.activity ?? 1.4);
  const [excluded, setExcluded] = useState(profile?.excluded ?? false);
  const [manualKcal, setManualKcal] = useState(current?.kcal ? String(current.kcal) : '');
  const [effectiveDay, setEffectiveDay] = useState(today);
  const [proposal, setProposal] = useState<(ReturnType<typeof calculateProposal> & { signature: string }) | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [manualWarningAccepted, setManualWarningAccepted] = useState(false);
  const actionLock = useRef(false);

  const draft = useMemo(() => {
    const read = (value: string) => { try { return parseNumber(value); } catch { return null; } };
    const parsed = { age: read(age), weightKg: read(weight), heightCm: read(height) };
    if (parsed.age === null || parsed.weightKg === null || parsed.heightCm === null || physiology === null || !Number.isInteger(parsed.age)) return null;
    const value: ProfileData = { age: parsed.age, weightKg: parsed.weightKg, heightCm: parsed.heightCm, physiology, activity, excluded };
    const checked = profileSchema.safeParse(value);
    return checked.success ? checked.data : null;
  }, [age, weight, height, physiology, activity, excluded]);
  const proposalSignature = draft ? JSON.stringify([mode, draft]) : '';

  function editProfile<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setProposal(null);
  }

  async function saveProfile() {
    if (!repository || actionLock.current || working) return;
    actionLock.current = true;
    setWorking(true);
    setError(''); setMessage('');
    try {
      if (!draft) throw new Error('Completa edad, peso y estatura para guardar el perfil.');
      await repository.saveProfile(draft);
      await refresh();
      setMessage('Perfil actualizado. La meta aceptada sigue igual.');
      setProposal(null);
    } catch (cause) { setError(friendly(cause)); }
    finally { actionLock.current = false; setWorking(false); }
  }

  function calculate() {
    setError(''); setMessage(''); setProposal(null);
    try {
      if (!draft) throw new Error('Completa edad, peso y estatura con valores válidos.');
      if (mode === 'log') throw new Error('Solo registrar no requiere cálculo de meta.');
      setProposal({ ...calculateProposal(draft, mode), signature: proposalSignature });
    } catch (cause) { setError(friendly(cause)); }
  }

  async function acceptGoal() {
    if (!repository || actionLock.current || working) return;
    actionLock.current = true;
    setError(''); setMessage(''); setWorking(true);
    try {
      if (!isCalendarDay(effectiveDay) || effectiveDay < today) throw new Error('Elige hoy o una fecha futura válida.');
      let kcal: number | null = null;
      let method: 'manual' | 'mifflin' | 'none' = 'none';
      if (mode !== 'log' && targetType === 'estimate') {
        if (!proposal || proposal.signature !== proposalSignature) throw new Error('El perfil cambió después del cálculo. Calcula y revisa una propuesta nueva.');
        if (!draft) throw new Error('Completa el perfil actualizado antes de aceptar.');
        kcal = proposal.target; method = 'mifflin';
        await repository.saveProfile(draft);
      } else if (mode !== 'log') {
        const value = parseNumber(manualKcal);
        if (value === null) throw new Error('Escribe tu meta en kcal.');
        kcal = value; method = 'manual';
        const warning = validateManualGoal(value);
        if (warning && !manualWarningAccepted) {
          setManualWarningAccepted(true);
          setError(`${warning} Vuelve a pulsar Aceptar meta manual para confirmar.`);
          setWorking(false);
          return;
        }
      }
      await repository.saveGoal({ day: effectiveDay, mode, kcal, method });
      await refresh();
      setMessage(mode === 'log' ? `Solo registrar estará vigente desde ${effectiveDay}.` : `Meta de ${Math.round(kcal!)} kcal aceptada desde ${effectiveDay}.`);
      setProposal(null);
      router.back();
    } catch (cause) { setError(friendly(cause)); }
    finally { actionLock.current = false; setWorking(false); }
  }

  return <Screen>
    {error && <Message error>{error}</Message>}
    {message && <Message>{message}</Message>}
    <Section icon="compass-outline" title="Modo de seguimiento">
      <Copy muted size={13}>El cambio se aplica desde la fecha elegida.</Copy>
      <View pointerEvents={working || busy ? 'none' : 'auto'}><Choice value={mode} options={modes} onChange={value => { setMode(value); setProposal(null); setManualWarningAccepted(false); setError(''); }} /></View>
      {mode === 'log' && <Message>Solo registrar muestra comidas e historial. No requiere perfil, meta ni avisos de límite.</Message>}
    </Section>

    {mode !== 'log' && <Section icon="flag-outline" title="Elegir meta">
      <View pointerEvents={working || busy ? 'none' : 'auto'}><Choice value={targetType} options={[{ label: 'Propuesta calculada', value: 'estimate' }, { label: 'Escribir mi meta', value: 'manual' }]} onChange={value => { setTargetType(value); setProposal(null); setManualWarningAccepted(false); setError(''); }} /></View>
      {targetType === 'estimate' ? <>
        <Message>Orientación para adultos; no es una prescripción.</Message>
        <Disclosure title="Cómo se estima" summary="Método y fuentes">
          <Copy muted size={13}>Usa Mifflin–St Jeor y una aproximación de actividad física. No promete resultados.</Copy>
          <LinkText label="Ecuación Mifflin–St Jeor" url="https://pubmed.ncbi.nlm.nih.gov/2305711/" />
          <LinkText label="Rangos de actividad FAO" url="https://www.fao.org/4/y5686e/y5686e07.htm" />
          <LinkText label="Límites para adultos · NIDDK" url="https://www.niddk.nih.gov/bwp" />
        </Disclosure>
        <ProfileFields age={age} setAge={value => editProfile(setAge, value)} weight={weight} setWeight={value => editProfile(setWeight, value)} height={height} setHeight={value => editProfile(setHeight, value)} physiology={physiology} setPhysiology={value => editProfile(setPhysiology, value)} activity={activity} setActivity={value => editProfile(setActivity, value)} excluded={excluded} setExcluded={value => editProfile(setExcluded, value)} disabled={working || busy} />
        {proposal && <View style={{ padding: 16, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: t.rule, backgroundColor: t.surface }}>
          <Copy bold>Revisa la propuesta; todavía no reemplaza tu meta.</Copy>
          <Copy>Reposo estimado: {Math.round(proposal.resting)} kcal/día</Copy>
          <Copy>Mantenimiento estimado: {Math.round(proposal.maintenance)} kcal/día</Copy>
          {mode === 'lose' && <Copy>Déficit usado: {Math.round(proposal.deficit)} kcal/día</Copy>}
          <Copy bold>Meta sugerida: {proposal.target} kcal/día</Copy>
        </View>}
        <Button icon="calculator-outline" title="Calcular propuesta" variant="secondary" onPress={calculate} disabled={!draft || busy || working} />
        <Button title="Guardar perfil sin cambiar mi meta" variant="secondary" onPress={() => void saveProfile()} disabled={!draft || busy || working} busy={working} />
      </> : <>
        <Copy>El perfil es opcional. Escribe la meta que quieres usar; Boceli no la calcula.</Copy>
        <Field label="Meta diaria · kcal" value={manualKcal} editable={!working && !busy} onChangeText={value => { setManualKcal(value); setManualWarningAccepted(false); }} keyboardType="decimal-pad" placeholder="Por ejemplo, 1.800" />
        {draft && <Button title="Guardar perfil aparte" variant="secondary" onPress={() => void saveProfile()} disabled={busy || working} busy={working} />}
      </>}
    </Section>}

    <Section icon="calendar-outline" title="Vigencia">
      <Field label="Fecha de inicio · AAAA-MM-DD" value={effectiveDay} editable={!working && !busy} onChangeText={setEffectiveDay} placeholder={today} autoCapitalize="none" autoCorrect={false} help="Hoy o una fecha futura. El historial conserva metas anteriores." />
      {current && <Copy muted>Meta vigente hoy: {modeName(current.mode)}{current.kcal === null ? '' : ` · ${Math.round(current.kcal)} kcal`} · desde {current.day}</Copy>}
      <Button title={mode === 'log' ? 'Aceptar Solo registrar' : targetType === 'estimate' ? 'Aceptar esta propuesta' : 'Aceptar meta manual'} onPress={() => void acceptGoal()} disabled={busy || !isCalendarDay(effectiveDay) || effectiveDay < today || (mode !== 'log' && targetType === 'estimate' && !proposal)} busy={working} />
    </Section>
  </Screen>;
}

function ProfileFields({ age, setAge, weight, setWeight, height, setHeight, physiology, setPhysiology, activity, setActivity, excluded, setExcluded, disabled }: {
  age: string; setAge: (value: string) => void;
  weight: string; setWeight: (value: string) => void;
  height: string; setHeight: (value: string) => void;
  physiology: 'male' | 'female' | null; setPhysiology: (value: 'male' | 'female' | null) => void;
  activity: ProfileData['activity']; setActivity: (value: ProfileData['activity']) => void;
  excluded: boolean; setExcluded: (value: boolean) => void;
  disabled: boolean;
}) {
  return <View>
    <Field label="Edad · años" value={age} editable={!disabled} onChangeText={setAge} keyboardType="number-pad" placeholder="Edad" />
    <Field label="Peso · kg" value={weight} editable={!disabled} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Peso actual" />
    <Field label="Estatura · cm" value={height} editable={!disabled} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="Estatura" />
    <Copy bold>Parámetro fisiológico requerido por la ecuación</Copy>
    <Copy muted size={13}>La fórmula estima gasto en reposo con uno de dos parámetros corporales estudiados. No pregunta identidad de género.</Copy>
    <View pointerEvents={disabled ? 'none' : 'auto'}><Choice<'not_selected' | 'female' | 'male'> value={physiology ?? 'not_selected'} options={[{ label: 'Elige parámetro', value: 'not_selected' }, { label: 'Femenino', value: 'female' }, { label: 'Masculino', value: 'male' }]} onChange={value => setPhysiology(value === 'not_selected' ? null : value)} /></View>
    <Copy bold>Actividad habitual</Copy>
    <View pointerEvents={disabled ? 'none' : 'auto'}><Choice value={activity} options={[{ label: 'Baja · 1,4', value: 1.4 }, { label: 'Moderada · 1,7', value: 1.7 }, { label: 'Alta · 2,0', value: 2 }]} onChange={setActivity} /></View>
    <Disclosure title="Niveles de actividad" summary="Guía breve">
      <Copy muted size={13}>Baja: mayormente sentado. Moderada: movimiento y ejercicio frecuentes. Alta: actividad intensa frecuente. Son aproximaciones.</Copy>
    </Disclosure>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: excluded, disabled }} disabled={disabled} onPress={() => setExcluded(!excluded)} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, alignItems: 'center' }}>
      <View style={{ width: 24, height: 24, borderWidth: 1, borderColor: t.rule, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: excluded ? t.accentSoft : t.surface }}>{excluded && <Ionicons name="checkmark" size={20} color={t.ink} accessible={false} />}</View>
      <View style={{ flex: 1 }}><Copy bold>Embarazo, lactancia o situación clínica fuera del método</Copy><Copy muted size={12}>Actívalo para bloquear la propuesta automática.</Copy></View>
    </Pressable>
  </View>;
}

function modeName(mode: Mode) { return mode === 'lose' ? 'Bajar de peso' : mode === 'maintain' ? 'Mantener el peso' : 'Solo registrar'; }
function LinkText({ label, url }: { label: string; url: string }) {
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={{ paddingVertical: 4 }}><Text style={{ fontFamily: t.medium, fontSize: 14, color: t.ink, textDecorationLine: 'underline' }}>{label}</Text></Pressable>;
}
