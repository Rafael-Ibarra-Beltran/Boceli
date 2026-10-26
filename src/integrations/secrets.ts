import * as SecureStore from 'expo-secure-store';

const API_KEY = 'boceli.gemini.api-key.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getApiKey(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(API_KEY); }
  catch { throw new Error('No se pudo leer la clave segura. Revisa el acceso al llavero del dispositivo.'); }
}

export async function setApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (!key || key.length > 512) throw new Error('Introduce una clave válida de Gemini.');
  try { await SecureStore.setItemAsync(API_KEY, key, options); }
  catch { throw new Error('No se pudo guardar la clave en el almacenamiento seguro.'); }
}

export async function deleteApiKey(): Promise<void> {
  try { await SecureStore.deleteItemAsync(API_KEY); }
  catch { throw new Error('No se pudo eliminar la clave segura.'); }
}
