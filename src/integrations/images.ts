import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export interface PreparedImage { uri: string; base64: string; mimeType: 'image/jpeg' }

const ownPrefix = 'boceli-photo-';
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const cacheDir = () => {
  if (!FileSystem.cacheDirectory) throw new Error('No hay almacenamiento temporal disponible en el dispositivo.');
  return FileSystem.cacheDirectory;
};

function decodedFilePath(uri: string): string | null {
  if (!/^file:\/\/\//i.test(uri) || /[?#\\]/.test(uri)) return null;
  try {
    const path = decodeURIComponent(uri.slice('file://'.length));
    if (!path.startsWith('/') || path.includes('\0') || path.includes('\\')) return null;
    if (path.split('/').some((part) => part === '.' || part === '..')) return null;
    return path.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function prepareImage(uri: string): Promise<PreparedImage> {
  if (!uri) throw new Error('Selecciona una imagen antes de continuar.');
  const maxSide = 1600;
  let transformed: ImageManipulator.ImageResult | undefined;
  let destination: string | undefined;
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    }).catch(() => { throw new Error('No pudimos leer la imagen. Revisa el permiso de Fotos y elige otra foto.'); });
    const scale = Math.min(1, maxSide / Math.max(dimensions.width, dimensions.height));
    destination = `${cacheDir()}${ownPrefix}${makeId()}.jpg`;
    transformed = await ImageManipulator.manipulateAsync(uri, [{ resize: {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    } }], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!transformed.base64) throw new Error('No pudimos preparar la imagen. Selecciona otra foto.');
    await FileSystem.copyAsync({ from: transformed.uri, to: destination });
    return { uri: destination, base64: transformed.base64, mimeType: 'image/jpeg' };
  } catch (error) {
    if (destination) await cleanupImage(destination).catch(() => undefined);
    if (error instanceof Error && error.message.startsWith('No pudimos')) throw error;
    throw new Error('No pudimos preparar la imagen. Revisa el permiso de Fotos y selecciona otra foto.');
  } finally {
    if (transformed) await FileSystem.deleteAsync(transformed.uri, { idempotent: true }).catch(() => undefined);
    await cleanupPickerImage(uri).catch(() => undefined);
  }
}

export async function cleanupPickerImage(uri: string): Promise<void> {
  const pickerUriPath = decodedFilePath(uri);
  const cachePath = decodedFilePath(cacheDir());
  if (!pickerUriPath || !cachePath) return;
  const pickerPrefix = `${cachePath}/ImagePicker/`;
  const name = pickerUriPath.startsWith(pickerPrefix) ? pickerUriPath.slice(pickerPrefix.length) : '';
  if (!name || name.includes('/')) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function cleanupImage(uri: string): Promise<void> {
  const root = decodedFilePath(cacheDir());
  const path = decodedFilePath(uri);
  if (!root || !path || !path.startsWith(`${root}/`)) return;
  const name = path.slice(root.length + 1);
  if (!/^boceli-photo-[a-z0-9-]+\.jpg$/.test(name)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function cleanupTemporaryImages(): Promise<void> {
  const root = cacheDir();
  const files = await FileSystem.readDirectoryAsync(root);
  await Promise.all(files.filter((file) => file.startsWith(ownPrefix)).map((file) =>
    cleanupImage(`${root}${file}`).catch(() => undefined)));
}
