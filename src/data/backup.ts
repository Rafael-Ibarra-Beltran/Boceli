import { snapshotSchema } from '../domain/validation';
import type { Snapshot } from '../domain/types';

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS = 100_000;

export function exportBackup(snapshot: Snapshot): string {
  const safeSnapshot = snapshotSchema.parse({
    ...snapshot,
    preferences: { ...snapshot.preferences, aiConsent: false },
  });
  const records = safeSnapshot.goals.length + safeSnapshot.meals.length + safeSnapshot.meals.reduce((total, meal) => total + meal.items.length, 0) + safeSnapshot.products.length + safeSnapshot.favorites.length + safeSnapshot.favorites.reduce((total, meal) => total + meal.items.length, 0);
  if (records > MAX_RECORDS) throw new Error('El respaldo supera el máximo de registros.');
  const encoded = JSON.stringify({ format: 'boceli', version: 1, exportedAt: new Date().toISOString(), snapshot: safeSnapshot });
  if (new TextEncoder().encode(encoded).byteLength > MAX_BACKUP_BYTES) throw new Error('El respaldo supera 20 MB.');
  return encoded;
}

export function parseBackup(text: string): Snapshot {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('El respaldo supera 20 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('El respaldo tiene un formato incorrecto.');
  const backup = parsed as Record<string, unknown>;
  if (backup.format !== 'boceli' || backup.version !== 1) throw new Error('Este formato o versión de respaldo no es compatible.');
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('El respaldo no contiene una fecha de exportación válida.');
  const snapshot = snapshotSchema.parse(backup.snapshot);
  const records = snapshot.goals.length + snapshot.meals.length + snapshot.meals.reduce((total, meal) => total + meal.items.length, 0) + snapshot.products.length + snapshot.favorites.length + snapshot.favorites.reduce((total, meal) => total + meal.items.length, 0);
  if (records > MAX_RECORDS) throw new Error('El respaldo supera el máximo de registros.');
  return { ...snapshot, preferences: { ...snapshot.preferences, aiConsent: false } };
}
