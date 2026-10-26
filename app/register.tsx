import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Choice, Copy, Disclosure, Field, Message, Section, Title } from '../src/ui/components';
import { FoodEditor, draftItem, resolveDraft, type ItemDraft } from '../src/ui/FoodEditor';
import { theme as t } from '../src/ui/tokens';
import { useStore } from '../src/ui/store';
import { formatKcal, isCalendarDay, itemKcal, localDay } from '../src/domain/calculations';
import { mealSchema } from '../src/domain/validation';
import type { Category, FoodItem, Meal } from '../src/domain/types';
import { analyzeFood, type Analysis } from '../src/integrations/ai';
import { getApiKey } from '../src/integrations/secrets';
import { cleanupImage, prepareImage, type PreparedImage } from '../src/integrations/images';
import { registerSheetDetents } from '../src/ui/registerSheet';
import { RegisterSheetScroll } from '../src/ui/RegisterSheetScroll';

type Method = 'menu' | 'plate' | 'saved' | 'edit';
type SavingTarget = 'meal' | 'favorite';
const categories: Category[] = ['Desayuno', 'Comida', 'Cena', 'Snacks'];
const sourceLabels = { ai: 'Estimación IA', label: 'Etiqueta', off: 'Open Food Facts', manual: 'Manual' };
export default function Register() {
  const params = useLocalSearchParams<{ day?: string; edit?: string; repeat?: string }>();
  const { data, repository, refresh, busy: maintenanceBusy, generation } = useStore();
  const original = params.edit ? data.meals.find(meal => meal.id === params.edit) : undefined;
  const repeated = params.repeat ? data.meals.find(meal => meal.id === params.repeat) : undefined;
  const seed = original ?? repeated;
  const [method, setMethod] = useState<Method>(seed ? 'edit' : 'menu');
  const [name, setName] = useState(seed?.name ?? '');
  const [day, setDay] = useState(original?.day ?? (isCalendarDay(params.day ?? '') ? params.day! : localDay()));
  const [category, setCategory] = useState<Category>(seed?.category ?? 'Comida');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [items, setItems] = useState<ItemDraft[]>(() => seed?.items.map(item => draftItem(item)) ?? []);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingTarget, setSavingTarget] = useState<SavingTarget | null>(null);
  const [favoriteSavedSignature, setFavoriteSavedSignature] = useState<string | null>(null);
  const [favoriteFeedback, setFavoriteFeedback] = useState<{ signature: string; message: string; error: boolean } | null>(null);
  const [sheetAllowedDetents] = useState(() => {
    const { height, fontScale } = Dimensions.get('screen');
    return registerSheetDetents(height, fontScale);
  });
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [clarification, setClarification] = useState('');
  const saveId = useRef(original?.id ?? Crypto.randomUUID());
  const lock = useRef(false);
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const photoRef = useRef<PreparedImage | null>(null);
  const initialGeneration = useRef(generation);
  const alive = () => mounted.current && initialGeneration.current === generation;
  const favoriteSignature = JSON.stringify({ name, notes, itemsDraft: items });
  const favoriteIsSaved = favoriteSavedSignature === favoriteSignature;
  const favoriteSaving = savingTarget === 'favorite' && !favoriteIsSaved;
  const currentFavoriteFeedback = favoriteFeedback?.signature === favoriteSignature ? favoriteFeedback : null;
  const operationBusy = busy || savingTarget !== null;
  const leavingDisabled = operationBusy || maintenanceBusy;
  useEffect(() => () => { mounted.current = false; operation.current?.abort(); if (photoRef.current) void cleanupImage(photoRef.current.uri).catch(() => undefined); }, []);
  useEffect(() => { if (initialGeneration.current !== generation) { operation.current?.abort(); router.back(); } }, [generation]);
  const errorText = (err: unknown) => err instanceof Error ? err.message : 'No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.';
  const fail = (err: unknown) => setError(errorText(err));
  const replaceItems = (foods: FoodItem[], ask = false) => { setItems(foods.map(item => draftItem(item, ask))); setMethod('edit'); };

  async function analyze(prepared = photo) {
    if (!prepared || lock.current || maintenanceBusy) return;
    lock.current = true; setBusy(true); setError(''); setStatus('Analizando la imagen. Revisa el resultado antes de guardar.');
    const controller = new AbortController(); operation.current = controller;
    try {
      if (!data.preferences.aiConsent) throw new Error('Revisa las condiciones y configura Gemini en Ajustes antes de enviar fotografías.');
      const key = await getApiKey();
      if (!key) throw new Error('Añade tu clave de Gemini en Ajustes. También puedes registrar manualmente.');
      const result = await analyzeFood({ imageBase64: prepared.base64, mimeType: prepared.mimeType, kind: 'plate', clarification }, key, controller.signal);
      if (!alive() || controller.signal.aborted) return;
      setAnalysis(result);
      if (result.usable) setItems(result.items.map(item => draftItem(item)));
      else setItems([]);
      setStatus(result.usable ? 'Resultado listo para revisar. Escribe la cantidad que consumiste.' : 'La imagen necesita aclaración o una nueva foto.');
    } catch (err) { if (alive() && !controller.signal.aborted) { fail(err); setStatus(''); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  async function pickPhoto(camera: boolean) {
    if (lock.current || maintenanceBusy) return;
    setError('');
    if (!data.preferences.aiConsent) { setError('Primero configura Gemini y revisa sus condiciones en Ajustes. Puedes registrar manualmente sin IA.'); return; }
    lock.current = true; setBusy(true);
    let prepared: PreparedImage | null = null;
    try {
      if (camera) {
        const access = await ImagePicker.requestCameraPermissionsAsync();
        if (!access.granted) { setError('Permiso de cámara denegado. Puedes elegir una imagen o abrir Ajustes del sistema.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      setStatus('Preparando imagen…');
      prepared = await prepareImage(result.assets[0].uri);
      if (!alive()) { await cleanupImage(prepared.uri); return; }
      if (photoRef.current) await cleanupImage(photoRef.current.uri).catch(() => undefined);
      photoRef.current = prepared; setPhoto(prepared); setAnalysis(null); setItems([]);
    } catch (err) { if (alive()) { fail(err); setStatus(''); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
    if (prepared && alive()) await analyze(prepared);
  }

  async function save(favorite = false) {
    if (lock.current || maintenanceBusy || !repository) return;
    lock.current = true;
    const target: SavingTarget = favorite ? 'favorite' : 'meal';
    setSavingTarget(target);
    if (!favorite) setBusy(true);
    setError('');
    const signature = favorite ? JSON.stringify({ name, notes, itemsDraft: items }) : null;
    if (favorite) setFavoriteFeedback(null);
    try {
      if (!favorite && !isCalendarDay(day)) throw new Error('Escribe una fecha válida: AAAA-MM-DD.');
      const foods = items.map(resolveDraft);
      if (!foods.length) throw new Error('Añade al menos un alimento con cantidad y calorías.');
      if (favorite) {
        const favoriteDraft = { id: `favorite-${saveId.current}`, name: name.trim() || foods[0]!.name, items: foods, notes };
        await repository.saveFavorite(favoriteDraft);
        if (alive() && signature) {
          setFavoriteSavedSignature(signature);
          setFavoriteFeedback({ signature, message: 'Guardada en favoritos', error: false });
        }
        try { await refresh(); } catch (err) {
          if (alive() && signature) {
            setFavoriteFeedback({ signature, message: `Guardada en favoritos. No se pudo actualizar la vista local: ${errorText(err)}`, error: true });
          }
        }
        return;
      }
      const now = new Date();
      const meal: Meal = { id: saveId.current, name: name.trim() || foods[0]!.name, day, createdAt: original?.createdAt ?? now.toISOString(), offsetMinutes: original?.offsetMinutes ?? -now.getTimezoneOffset(), category, items: foods, notes };
      const validation = mealSchema.safeParse(meal);
      if (!validation.success) throw new Error('Revisa el nombre, la fecha y los alimentos antes de guardar.');
      await repository.saveMeal(validation.data); await refresh();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (photoRef.current) { await cleanupImage(photoRef.current.uri).catch(() => undefined); photoRef.current = null; }
      router.back();
    } catch (err) {
      if (favorite && signature) {
        if (alive()) setFavoriteFeedback({ signature, message: errorText(err), error: true });
      } else fail(err);
    }
    finally {
      lock.current = false;
      if (mounted.current) { setSavingTarget(null); if (!favorite) setBusy(false); }
    }
  }

  const removeMeal = () => Alert.alert('Eliminar comida', 'Este registro se eliminará del historial y se actualizará el total del día.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => {
    if (!original || !repository || lock.current || maintenanceBusy) return;
    lock.current = true; setBusy(true);
    try { await repository.deleteMeal(original.id); await refresh(); router.back(); } catch (err) { fail(err); } finally { lock.current = false; setBusy(false); }
  } }]);
  const total = items.reduce((sum, item) => { try { return sum + itemKcal(resolveDraft(item)); } catch { return sum; } }, 0);
  const hasEditor = method === 'edit' || (method === 'plate' && !!analysis?.usable);
  const closeModal = () => { if (!leavingDisabled) router.back(); };
  const closeControl = <Pressable accessibilityRole="button" accessibilityLabel="Cerrar registro" accessibilityState={{ disabled: leavingDisabled }} disabled={leavingDisabled} onPress={closeModal} style={[register.close, { opacity: leavingDisabled ? 0.45 : 1 }]}><Ionicons name="close" size={22} color={t.ink} accessible={false} /></Pressable>;
  return <>
  <Stack.Screen options={{ title: 'Registrar comida', sheetAllowedDetents, ...(Platform.OS === 'ios' ? { headerRight: () => closeControl } : {}) }} />
  <RegisterSheetScroll resetKey={method} finalAction={hasEditor ? <><View style={register.total}><Copy muted size={13}>Total de la comida</Copy><Copy bold>{formatKcal(total)}</Copy></View><Button icon="checkmark-outline" title={original ? 'Guardar cambios' : 'Guardar comida'} busy={savingTarget === 'meal' || (busy && savingTarget === null)} disabled={maintenanceBusy || savingTarget === 'favorite' || !items.length} onPress={() => void save()} /></> : undefined}>
    {Platform.OS === 'android' && <View style={register.androidHeader}><View style={{ flex: 1, minWidth: 0 }}><Copy bold size={18}>Registrar comida</Copy></View>{closeControl}</View>}
    {!!error && <Message error>{error}</Message>}
    {!!status && <Message>{status}</Message>}
    {method !== 'menu' && <Pressable accessibilityRole="button" accessibilityLabel="Volver a métodos de registro" accessibilityState={{ disabled: leavingDisabled }} disabled={leavingDisabled} onPress={() => { setMethod('menu'); setError(''); setStatus(''); }} style={({ pressed }) => [register.back, { opacity: leavingDisabled ? 0.45 : pressed ? 0.65 : 1 }]}><Ionicons name="arrow-back" size={24} color={t.ink} accessible={false} /></Pressable>}
    {method === 'menu' && <>
      <Title subtitle="Elige cómo quieres añadir tu comida.">¿Qué comiste?</Title>
      <View style={{ gap: 10 }}>{([
        ['plate', 'camera-outline', 'Foto del plato', 'Fotografía, revisa y guarda.'],
        ['edit', 'create-outline', 'Entrada manual', 'Añade alimentos y cantidades.'],
        ['saved', 'bookmark-outline', 'Comidas guardadas', 'Vuelve a tus favoritos y recientes.'],
      ] as const).map(([value, icon, title, description]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={title} disabled={busy || maintenanceBusy} onPress={() => { setMethod(value); setError(''); setStatus(''); if (value === 'edit' && !items.length) setItems([draftItem(undefined, true)]); }} accessibilityState={{ disabled: busy || maintenanceBusy }} style={({ pressed }) => [register.method, value === 'plate' && register.featured, { opacity: busy || maintenanceBusy ? 0.5 : pressed ? 0.75 : 1 }]}>
        <View style={[register.methodIcon, value === 'plate' && { backgroundColor: t.accent }]}><Ionicons name={icon} size={value === 'plate' ? 32 : 24} color={t.ink} accessible={false} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Copy bold size={value === 'plate' ? 20 : 16}>{title}</Copy><Copy muted size={13}>{description}</Copy></View><Ionicons name="arrow-forward" size={20} color={t.ink} accessible={false} />
      </Pressable>)}</View>
      <View style={register.privacy}><Ionicons name="shield-checkmark-outline" size={16} color={t.muted} accessible={false} /><View style={{ flex: 1 }}><Copy muted size={12}>Las fotos solo se envían al analizarlas; no se guardan en el historial.</Copy></View></View>
    </>}
    {method === 'plate' && <View style={{ marginTop: 24 }}>
      <Title subtitle="Revisa los alimentos y la porción antes de guardar.">Fotografiar tu plato</Title>
      {!data.preferences.aiConsent && <Message>Configura tu clave y revisa las condiciones de Gemini en Ajustes. Las otras formas de registro siguen disponibles.</Message>}
      <View style={{ gap: 10 }}><Button icon="camera-outline" title="Tomar foto" onPress={() => void pickPhoto(true)} disabled={operationBusy || maintenanceBusy} /><Button icon="image-outline" title="Elegir imagen" variant="secondary" onPress={() => void pickPhoto(false)} disabled={operationBusy || maintenanceBusy} /></View>
      {error.includes('Permiso') && <Button title="Abrir ajustes del sistema" variant="secondary" onPress={() => void Linking.openSettings()} />}
      {photo && <Image source={{ uri: photo.uri }} accessibilityLabel="Imagen seleccionada para analizar" resizeMode="contain" style={{ width: '100%', height: 200, borderRadius: 12, marginVertical: 20 }} />}
      {photo && !analysis && !operationBusy && <Button title="Reintentar análisis" variant="secondary" disabled={maintenanceBusy} onPress={() => void analyze()} />}
      {analysis && <>
        {analysis.warnings.map((warning, i) => <Copy key={`w${i}`} muted>{warning}</Copy>)}
        {analysis.questions.length > 0 && <Section title="Para afinar la estimación">{analysis.questions.map((question, i) => <Copy key={i}>{question}</Copy>)}</Section>}
        <Field label="Aclaración para la IA" value={clarification} onChangeText={setClarification} maxLength={500} multiline placeholder="Ej.: porción de 200 g, una cucharadita de aceite…" />
        <Button title="Analizar con aclaración" variant="secondary" onPress={() => void analyze()} disabled={operationBusy || !clarification.trim()} />
      </>}
      {busy && <Button title="Cancelar análisis" variant="secondary" onPress={() => { operation.current?.abort(); setStatus('Análisis cancelado. Puedes registrar manualmente.'); }} />}
    </View>}
    {method === 'saved' && <View style={{ marginTop: 24 }}>
      <Title>Comidas guardadas</Title>
      <Section icon="heart-outline" title="Favoritos">{!data.favorites.length && <Copy muted>Abre una comida y elige Guardar en favoritos.</Copy>}{data.favorites.map(favorite => <View key={favorite.id} style={{ borderBottomWidth: 1, borderColor: t.rule, paddingVertical: 12, gap: 8 }}><Button title={favorite.name} variant="secondary" onPress={() => { setName(favorite.name); setNotes(favorite.notes); replaceItems(favorite.items); }} /><Button title="Quitar de favoritos" variant="danger" onPress={async () => {
        if (!repository) return;
        try {
          await repository.deleteFavorite(favorite.id);
          if (favorite.id === `favorite-${saveId.current}`) {
            setFavoriteSavedSignature(null);
            setFavoriteFeedback(null);
          }
          await refresh();
        } catch (err) { fail(err); }
      }} /></View>)}</Section>
      <Section icon="time-outline" title="Comidas recientes">{!data.meals.length && <Copy muted>Tus comidas aparecerán aquí después de guardarlas.</Copy>}{data.meals.slice(-20).reverse().map(meal => <Button key={meal.id} title={`${meal.name} · ${meal.day}`} variant="secondary" onPress={() => { setName(meal.name); setCategory(meal.category); setNotes(meal.notes); replaceItems(meal.items); }} />)}</Section>
    </View>}
    {hasEditor && <View style={{ marginTop: 28 }}>
      <Title>{original ? 'Editar comida' : 'Revisar comida'}</Title>
      <Field label="Nombre de la comida" value={name} onChangeText={setName} placeholder="Ej.: comida de hoy" maxLength={160} />
      <Field label="Fecha del consumo" value={day} onChangeText={setDay} placeholder="AAAA-MM-DD" maxLength={10} />
      <Choice<Category> value={category} options={categories.map(value => ({ value, label: value }))} onChange={setCategory} />
      {items.map((draft, index) => <FoodEditor key={draft.item.id} draft={draft} onChange={updated => setItems(previous => previous.map((value, i) => i === index ? updated : value))} onRemove={() => setItems(previous => previous.filter((_, i) => i !== index))} />)}
      <Button icon="add-outline" title="Añadir alimento" variant="secondary" onPress={() => setItems(previous => [...previous, draftItem(undefined, true)])} disabled={operationBusy || maintenanceBusy} />
      <View style={{ marginTop: 20 }}>
        <Disclosure title="Notas" summary={notes ? 'Con nota' : 'Opcional'} initiallyOpen={!!notes}>
          <Field label="Notas de la comida" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="Preparación o aclaraciones" />
        </Disclosure>
      </View>
      <Copy muted size={12}>{[...new Set(items.map(draft => sourceLabels[draft.item.source]))].join(' · ')}. Las calorías se calculan con las cantidades revisadas.</Copy>
      <View style={{ gap: 10, marginTop: 20 }} accessibilityLiveRegion="polite">
        {currentFavoriteFeedback?.error && <Message error>{currentFavoriteFeedback.message}</Message>}
        <Button icon={favoriteIsSaved ? 'bookmark' : 'bookmark-outline'} title={favoriteSaving ? 'Guardando…' : favoriteIsSaved ? 'Guardada en favoritos' : 'Guardar en favoritos'} variant="secondary" busy={favoriteSaving} disabled={operationBusy || maintenanceBusy || !items.length || favoriteIsSaved} onPress={() => void save(true)} />
        {original && <Button title="Eliminar comida" variant="danger" disabled={operationBusy || maintenanceBusy} onPress={removeMeal} />}
      </View>
    </View>}
  </RegisterSheetScroll>
  </>;
}

const register = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceTint, borderRadius: t.radius.sm, marginBottom: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  androidHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  method: { minHeight: 92, padding: 20, borderRadius: t.radius.md, backgroundColor: t.surface, borderWidth: 1, borderColor: t.rule, flexDirection: 'row', alignItems: 'center', gap: 16 },
  featured: { minHeight: 128, backgroundColor: t.accentSoft, borderColor: t.accentSoft, marginBottom: 4 },
  methodIcon: { width: 48, height: 48, borderRadius: t.radius.sm, backgroundColor: t.surfaceTint, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20 },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
});
