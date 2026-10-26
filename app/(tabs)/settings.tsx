import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Share, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Copy, Field, Message, Screen, Section, Disclosure } from '../../src/ui/components';
import { theme as t } from '../../src/ui/tokens';
import { useStore } from '../../src/ui/store';
import { deleteApiKey, getApiKey, setApiKey } from '../../src/integrations/secrets';
import { exportBackup, parseBackup } from '../../src/data/backup';
import { localDay, goalForDay } from '../../src/domain/calculations';
import { ZodError } from 'zod';
import type { Snapshot } from '../../src/domain/types';

const LINKS = {
  key: 'https://aistudio.google.com/app/apikey',
  terms: 'https://ai.google.dev/gemini-api/terms',
  prices: 'https://ai.google.dev/gemini-api/docs/pricing',
  privacy: 'https://ai.google.dev/gemini-api/docs/usage-policies',
};
const modeName = (mode: string) => mode === 'lose' ? 'Bajar de peso' : mode === 'maintain' ? 'Mantener el peso' : 'Solo registrar';
function friendly(error: unknown, fallback: string) {
  if (error instanceof ZodError) return 'El archivo no cumple el formato esperado. Elige un respaldo válido de Boceli.';
  return error instanceof Error ? error.message : fallback;
}

export default function SettingsScreen() {
  const { data, repository, refresh, busy, generation, maintenance } = useStore();
  const today = localDay();
  const goal = goalForDay(data.goals, today);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyExists, setKeyExists] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [keyError, setKeyError] = useState('');
  const [keyFeedback, setKeyFeedback] = useState('');
  const [keyWorking, setKeyWorking] = useState(false);
  const [replacingKey, setReplacingKey] = useState(false);
  const [keyCheckAttempt, setKeyCheckAttempt] = useState(0);
  const [completedKeyCheck, setCompletedKeyCheck] = useState({ generation: -1, attempt: -1 });
  const aiAccepted = data.preferences.aiConsent;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const operationLock = useRef(false);
  const keyReadToken = useRef(0);
  const preferenceQueue = useRef<Promise<void>>(Promise.resolve());
  const keyCheckPending = busy || completedKeyCheck.generation !== generation || completedKeyCheck.attempt !== keyCheckAttempt;
  const currentKeyStatus = keyCheckPending ? 'checking' : keyStatus;

  function beginOperation() {
    if (!repository || busy || operationLock.current) return false;
    operationLock.current = true;
    setWorking(true);
    return true;
  }
  function finishOperation() {
    operationLock.current = false;
    setWorking(false);
  }

  useEffect(() => {
    let active = true;
    const request = ++keyReadToken.current;
    if (!busy) {
      getApiKey().then(value => {
        if (!active || request !== keyReadToken.current) return;
        setKeyExists(Boolean(value));
        setKeyStatus('ready');
        setKeyError('');
        setKeyFeedback('');
        setCompletedKeyCheck({ generation, attempt: keyCheckAttempt });
        setKeyDraft('');
        setReplacingKey(false);
      }).catch(() => {
        if (!active || request !== keyReadToken.current) return;
        setKeyStatus('error');
        setKeyError('No se pudo comprobar la clave');
        setKeyFeedback('');
        setCompletedKeyCheck({ generation, attempt: keyCheckAttempt });
      });
    }
    return () => {
      active = false;
      if (request === keyReadToken.current) keyReadToken.current += 1;
    };
  }, [generation, busy, keyCheckAttempt]);

  async function updatePreferences(patch: Partial<typeof data.preferences>): Promise<boolean> {
    return persistPreferences(patch);
  }

  async function persistPreferences(patch: Partial<typeof data.preferences>, internal = false, onError: (message: string) => void = setError): Promise<boolean> {
    if (!repository) return false;
    if (busy || (operationLock.current && !internal)) {
      onError('Hay otra operación de datos en curso. Vuelve a intentarlo.');
      return false;
    }
    setError(''); setMessage('');
    const operation = preferenceQueue.current.then(async () => {
      const latest = await repository.load();
      await repository.savePreferences({ ...latest.preferences, ...patch });
      await refresh();
    });
    preferenceQueue.current = operation.catch(() => undefined);
    try { await operation; return true; }
    catch (cause) { onError(friendly(cause, 'No se guardó el ajuste.')); return false; }
  }

  async function drainPreferences() { await preferenceQueue.current; }

  async function saveKey() {
    if (currentKeyStatus !== 'ready' || !keyDraft.trim() || !beginOperation()) return;
    keyReadToken.current += 1;
    setKeyWorking(true);
    setError(''); setMessage('');
    setKeyError(''); setKeyFeedback('');
    try {
      await setApiKey(keyDraft);
      setKeyDraft('');
      setKeyExists(true);
      setKeyStatus('ready');
      setReplacingKey(false);
    } catch { setKeyError('No se pudo guardar la clave.'); }
    finally { setKeyWorking(false); finishOperation(); }
  }

  async function removeKey() {
    if (!beginOperation()) return;
    keyReadToken.current += 1;
    setError(''); setMessage('');
    setKeyError(''); setKeyFeedback('');
    try {
      await drainPreferences();
      await deleteApiKey();
      setKeyExists(false);
      setKeyStatus('ready');
      setKeyDraft('');
      setReplacingKey(false);
      if (await persistPreferences({ aiConsent: false }, true, reason => setKeyError(`La clave se eliminó, pero no se pudo actualizar el permiso de fotos: ${reason}`))) setKeyFeedback('Clave eliminada del llavero seguro.');
    } catch { setKeyError('No se pudo eliminar la clave.'); }
    finally { finishOperation(); }
  }

  function retryKeyCheck() { if (!busy && !working) { setKeyError(''); setKeyFeedback(''); setKeyCheckAttempt(attempt => attempt + 1); } }

  function replaceKey() {
    if (busy || working || currentKeyStatus !== 'ready') return;
    setKeyDraft(''); setKeyError(''); setKeyFeedback(''); setReplacingKey(true);
  }

  function cancelKeyReplacement() {
    setKeyDraft(''); setKeyError(''); setKeyFeedback(''); setReplacingKey(false);
  }

  async function exportData() {
    if (!beginOperation()) return;
    if (!FileSystem.cacheDirectory) { setError('El almacenamiento temporal no está disponible.'); finishOperation(); return; }
    setError(''); setMessage('');
    const uri = `${FileSystem.cacheDirectory}boceli-export-${Date.now()}.json`;
    try {
      await drainPreferences();
      const latest = await repository!.load();
      const text = exportBackup(latest);
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Guardar respaldo de Boceli', UTI: 'public.json' });
      else await Share.share({ message: text, title: 'Respaldo de Boceli' });
    } catch (cause) { setError(friendly(cause, 'No se pudo exportar el respaldo.')); }
    finally { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined); finishOperation(); }
  }

  async function pickImport() {
    if (!beginOperation()) return;
    setError(''); setMessage('');
    let ownedCopy = '';
    let pendingImport: Snapshot | null = null;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'public.json'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (!file) throw new Error('No se pudo abrir el archivo seleccionado.');
      ownedCopy = file.uri;
      const info = file.size === undefined ? await FileSystem.getInfoAsync(file.uri) : { exists: true, size: file.size };
      if (!info.exists) throw new Error('El archivo seleccionado ya no está disponible.');
      if ('size' in info && info.size !== undefined && info.size > 20 * 1024 * 1024) throw new Error('El respaldo supera el máximo de 20 MB.');
      pendingImport = parseBackup(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 }));
    } catch (cause) { setError(friendly(cause, 'No se pudo leer el respaldo.')); }
    finally {
      if (FileSystem.cacheDirectory && ownedCopy.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(ownedCopy, { idempotent: true }).catch(() => undefined);
      if (operationLock.current) finishOperation();
    }
    if (!pendingImport) return;
    const parsed = pendingImport;
    Alert.alert('Reemplazar datos locales', `Se importarán ${parsed.meals.length} comidas. Boceli validó el archivo antes de abrirlo. Esta acción sustituirá tus comidas, productos, favoritos, perfil y metas. La clave de IA actual se conservará.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reemplazar datos', style: 'destructive', onPress: () => { if (!beginOperation()) return; void (async () => { try { await drainPreferences(); await maintenance(async repo => { await repo.replaceAll(parsed); }); setMessage('Respaldo restaurado.'); } catch (cause) { setError(friendly(cause, 'No se pudo restaurar el respaldo.')); } finally { finishOperation(); } })(); } },
    ]);
  }

  async function eraseAll() {
    if (confirmText.trim().toUpperCase() !== 'BORRAR' || !beginOperation()) return;
    keyReadToken.current += 1;
    setKeyError(''); setKeyFeedback('');
    setError(''); setMessage('');
    let keyRemoved = false;
    try {
      await drainPreferences();
      await maintenance(async repo => {
        await deleteApiKey();
        keyRemoved = true;
        setKeyExists(false);
        await repo.clear();
      });
      setKeyExists(false); setKeyDraft(''); setConfirmText(''); setResetting(false);
      setMessage('Datos y clave de IA eliminados de este dispositivo.');
    } catch (cause) { setError(keyRemoved ? `La clave se eliminó, pero no se pudieron borrar los datos locales: ${friendly(cause, 'Error de almacenamiento.')}` : friendly(cause, 'No se completó el borrado.')); }
    finally { finishOperation(); }
  }

  const keySummary = currentKeyStatus === 'checking' ? 'Comprobando clave…' : currentKeyStatus === 'error' ? 'Estado de clave desconocido' : keyExists ? 'Clave configurada' : 'Sin clave';

  return <Screen>
    {(message || error) && <Message error={Boolean(error)}>{error || message}</Message>}
    <Section icon="compass-outline" title="Seguimiento">
      <Pressable accessibilityRole="button" disabled={busy || working} onPress={() => router.push('/profile')} style={rowStyle}>
        <View style={{ width: 44, height: 44, backgroundColor: t.accentSoft, borderRadius: t.radius.sm, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={24} color={t.ink} accessible={false} /></View><View style={{ flex: 1, gap: 4 }}><Copy bold>Perfil y meta diaria</Copy><Copy muted>{goal?.kcal ? `${modeName(goal.mode)} · ${Math.round(goal.kcal)} kcal` : 'Sin meta diaria configurada'}</Copy></View>
        <Ionicons name="chevron-forward" size={20} color={t.muted} accessible={false} />
      </Pressable>
      <Preference label="Aviso al acercarte" value={data.preferences.nearNotice} disabled={busy || working || !goal || goal.mode === 'log'} onChange={value => void updatePreferences({ nearNotice: value })} />
      <Preference label="Aviso al superar la meta" value={data.preferences.overNotice} disabled={busy || working || !goal || goal.mode === 'log'} onChange={value => void updatePreferences({ overNotice: value })} />
      {goal?.mode === 'log' && <Copy muted size={12}>Los avisos de meta están apagados en Solo registrar.</Copy>}
    </Section>

    <Disclosure title="Fotos con IA" summary={`${aiAccepted ? 'Permitida' : 'Sin activar'} · ${keySummary}`}>
      <Message>Google ofrece cuota gratuita limitada. En esa modalidad puede usar las fotos y respuestas para mejorar sus productos, incluida revisión humana. Cuota, modelos y disponibilidad pueden cambiar.</Message>
      <Copy>Google limita Gemini API a desarrollo profesional o empresarial y no a uso de consumo. Tu uso personal puede no cumplir esos términos. Boceli no puede confirmar elegibilidad ni aceptar condiciones por ti. Revisa los detalles antes de activarla.</Copy>
      <Link label="Leer condiciones de Gemini" url={LINKS.terms} />
      <Link label="Consultar cuota y precios" url={LINKS.prices} />
      <Link label="Consultar tratamiento de datos" url={LINKS.privacy} />
      {!aiAccepted && <Button title="Confirmo que revisé las condiciones" variant="secondary" onPress={() => { void updatePreferences({ aiConsent: true }); }} disabled={busy || working} />}
      {aiAccepted && <Preference label="Permitir análisis de fotos con IA" value={data.preferences.aiConsent} disabled={busy || working} onChange={value => { void updatePreferences({ aiConsent: value }); }} />}
      <Copy muted size={12}>Boceli envía solo la foto preparada y una instrucción. Nunca envía tu perfil corporal. Las fotos se eliminan tras revisar el resultado.</Copy>
      <Button title="Abrir Google AI Studio" variant="secondary" onPress={() => void Linking.openURL(LINKS.key)} />
      {currentKeyStatus === 'error' && <>
        <Message error>{keyError}</Message>
        <Button title="Reintentar comprobación" variant="secondary" onPress={retryKeyCheck} disabled={busy || working} />
      </>}
      {currentKeyStatus === 'ready' && keyExists && <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons testID="configured-key-check" name="checkmark-circle" size={20} color={t.ink} accessible={false} /><View style={{ flex: 1 }}><Copy bold>Clave configurada</Copy></View></View>
        <Copy muted size={12}>Guardada en este dispositivo. Esto no confirma que Gemini acepte la clave ni cambia el consentimiento de IA.</Copy>
      </>}
      {keyError && currentKeyStatus === 'ready' && <Message error>{keyError}</Message>}
      {keyFeedback && <Message>{keyFeedback}</Message>}
      {currentKeyStatus === 'ready' && (!keyExists || replacingKey) && <>
        <Field label="Clave personal de Gemini" value={keyDraft} editable={!working && !busy} onChangeText={setKeyDraft} placeholder="Pega la clave una sola vez" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="oneTimeCode" help={replacingKey ? 'La clave guardada no se muestra. Al guardar, esta clave la reemplazará.' : 'Se guarda en el llavero seguro. Guardarla no activa el consentimiento de IA.'} />
        <Button title={keyWorking ? 'Guardando clave…' : 'Guardar clave segura'} onPress={() => void saveKey()} busy={keyWorking} disabled={!keyDraft.trim() || busy || working} />
        {replacingKey && <Button title="Cancelar reemplazo" variant="secondary" onPress={cancelKeyReplacement} disabled={busy || working} />}
      </>}
      {currentKeyStatus === 'ready' && keyExists && !replacingKey && <>
        <Button title="Reemplazar clave" variant="secondary" onPress={replaceKey} disabled={busy || working} />
        <Button title="Eliminar clave" variant="secondary" onPress={() => void removeKey()} busy={working} disabled={busy} />
      </>}
    </Disclosure>

    <Section icon="file-tray-outline" title="Datos locales">
      <Copy>Guardado en este dispositivo. El respaldo incluye tu historial, perfil y ajustes; nunca fotos ni claves de IA.</Copy>
      <Button icon="share-outline" title="Exportar respaldo" variant="secondary" onPress={() => void exportData()} busy={working} disabled={busy} />
      <Button icon="download-outline" title="Importar y revisar respaldo" variant="secondary" onPress={() => void pickImport()} disabled={busy || working} />
    </Section>
    <Section icon="trash-outline" title="Eliminar datos">
      {!resetting ? <Button title="Borrar todos los datos" variant="danger" onPress={() => { setResetting(true); setConfirmText(''); }} /> : <View style={{ borderWidth: 1, borderColor: t.rule, borderRadius: 14, padding: 16, gap: 8 }}>
        <Copy bold>Esto elimina datos locales y la clave de IA. Escribe BORRAR para confirmar.</Copy>
        <Field label="Confirmación" value={confirmText} editable={!working && !busy} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} />
        <Button title="Borrar datos y clave" variant="danger" onPress={() => void eraseAll()} disabled={confirmText.trim().toUpperCase() !== 'BORRAR' || busy} busy={working} />
        <Button title="Cancelar" variant="secondary" disabled={working || busy} onPress={() => { setResetting(false); setConfirmText(''); }} />
      </View>}
    </Section>
  </Screen>;
}

function Preference({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={[rowStyle, { minHeight: 52 }]}><View style={{ flex: 1 }}><Copy>{label}</Copy></View><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: t.rule, true: t.accent }} thumbColor={t.surface} /></View>;
}
function Link({ label, url }: { label: string; url: string }) {
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={{ paddingVertical: 4 }}><Text style={{ color: t.ink, textDecorationLine: 'underline', fontFamily: t.medium, fontSize: 14 }}>{label}</Text></Pressable>;
}
const rowStyle = { backgroundColor: t.surface, borderRadius: t.radius.sm, paddingHorizontal: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 14 };
