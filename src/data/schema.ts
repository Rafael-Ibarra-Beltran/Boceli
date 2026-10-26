import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null | Uint8Array;

export interface SqlDriver {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastInsertRowId?: number }>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export const schemaSql = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS goals (
    day TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    kcal REAL,
    method TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at TEXT NOT NULL,
    offset_minutes INTEGER NOT NULL,
    category TEXT NOT NULL,
    notes TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meals_by_day ON meals(day, created_at);
  CREATE TABLE IF NOT EXISTS meal_items (
    meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY(meal_id, id),
    UNIQUE(meal_id, position)
  );
  CREATE INDEX IF NOT EXISTS items_by_meal ON meal_items(meal_id, position);
  CREATE TABLE IF NOT EXISTS products (
    barcode TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
`;

export async function createSqlDriver(db: SQLiteDatabase): Promise<SqlDriver> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version && version.user_version > 1) throw new Error('La base Boceli usa una versión más nueva.');
  if (!version || version.user_version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(schemaSql);
      await db.execAsync('PRAGMA user_version = 1');
    });
  }

  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const result = await db.runAsync(sql, ...params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, ...params),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, ...params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

export async function openSqlDriver(): Promise<SqlDriver> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const database = await openDatabaseAsync('boceli.db');
  await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return createSqlDriver(database);
}
