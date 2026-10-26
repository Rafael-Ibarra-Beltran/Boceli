import type { Preferences, Profile, GoalVersion, Meal, Product, SavedMeal, Snapshot } from '../domain/types';
import { emptySnapshot } from '../domain/types';
import { goalSchema, mealSchema, profileSchema, snapshotSchema } from '../domain/validation';
import { openSqlDriver, type SqlDriver } from './schema';

export interface Repository {
  load(): Promise<Snapshot>;
  saveMeal(meal: Meal): Promise<void>;
  deleteMeal(id: string): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
  savePreferences(preferences: Preferences): Promise<void>;
  saveGoal(goal: GoalVersion): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  saveFavorite(meal: SavedMeal): Promise<void>;
  deleteFavorite(id: string): Promise<void>;
  replaceAll(snapshot: Snapshot): Promise<void>;
  clear(): Promise<void>;
}

export function createRepository(db: SqlDriver): Repository {
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  }

  async function writeSnapshot(snapshot: Snapshot): Promise<void> {
    await db.runAsync('DELETE FROM meal_items');
    await db.runAsync('DELETE FROM meals');
    await db.runAsync('DELETE FROM goals');
    await db.runAsync('DELETE FROM products');
    await db.runAsync('DELETE FROM favorites');
    await db.runAsync('DELETE FROM profile');
    await db.runAsync('DELETE FROM preferences');
    if (snapshot.profile) await db.runAsync('INSERT INTO profile(id,json) VALUES(1,?)', [JSON.stringify(snapshot.profile)]);
    await db.runAsync('INSERT INTO preferences(id,json) VALUES(1,?)', [JSON.stringify(snapshot.preferences)]);
    for (const goal of snapshot.goals) await db.runAsync('INSERT INTO goals(day,mode,kcal,method) VALUES(?,?,?,?)', [goal.day, goal.mode, goal.kcal, goal.method]);
    for (const meal of snapshot.meals) await insertMeal(meal);
    for (const product of snapshot.products) await db.runAsync('INSERT INTO products(barcode,json) VALUES(?,?)', [product.barcode, JSON.stringify(product)]);
    for (const favorite of snapshot.favorites) await db.runAsync('INSERT INTO favorites(id,json) VALUES(?,?)', [favorite.id, JSON.stringify(favorite)]);
  }

  async function insertMeal(meal: Meal): Promise<void> {
    await db.runAsync('INSERT INTO meals(id,name,day,created_at,offset_minutes,category,notes) VALUES(?,?,?,?,?,?,?)', [meal.id, meal.name, meal.day, meal.createdAt, meal.offsetMinutes, meal.category, meal.notes]);
    for (const [position, item] of meal.items.entries()) {
      await db.runAsync('INSERT INTO meal_items(id,meal_id,position,json) VALUES(?,?,?,?)', [item.id, meal.id, position, JSON.stringify(item)]);
    }
  }

  return {
    load: () => serialized(async () => {
      const profile = await db.getFirstAsync<{ json: string }>('SELECT json FROM profile WHERE id=1');
      const preferences = await db.getFirstAsync<{ json: string }>('SELECT json FROM preferences WHERE id=1');
      const goalRows = await db.getAllAsync<{ day: string; mode: GoalVersion['mode']; kcal: number | null; method: GoalVersion['method'] }>('SELECT day,mode,kcal,method FROM goals ORDER BY day');
      const mealRows = await db.getAllAsync<{ id: string; name: string; day: string; created_at: string; offset_minutes: number; category: Meal['category']; notes: string }>('SELECT id,name,day,created_at,offset_minutes,category,notes FROM meals ORDER BY created_at');
      const itemRows = await db.getAllAsync<{ meal_id: string; json: string }>('SELECT meal_id,json FROM meal_items ORDER BY meal_id,position');
      const itemsByMeal = new Map<string, Meal['items']>();
      for (const row of itemRows) {
        const list = itemsByMeal.get(row.meal_id) ?? [];
        list.push(JSON.parse(row.json));
        itemsByMeal.set(row.meal_id, list);
      }
      const productRows = await db.getAllAsync<{ json: string }>('SELECT json FROM products ORDER BY barcode');
      const favoriteRows = await db.getAllAsync<{ json: string }>('SELECT json FROM favorites ORDER BY id');
      const data: Snapshot = {
        profile: profile ? JSON.parse(profile.json) : null,
        preferences: preferences ? JSON.parse(preferences.json) : { ...emptySnapshot().preferences },
        goals: goalRows,
        meals: mealRows.map((row) => ({ id: row.id, name: row.name, day: row.day, createdAt: row.created_at, offsetMinutes: row.offset_minutes, category: row.category, notes: row.notes, items: itemsByMeal.get(row.id) ?? [] })),
        products: productRows.map(({ json }) => JSON.parse(json)),
        favorites: favoriteRows.map(({ json }) => JSON.parse(json)),
      };
      return snapshotSchema.parse(data);
    }),
    saveMeal: (meal) => serialized(async () => {
      const valid = mealSchema.parse(meal);
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM meals WHERE id=?', [valid.id]);
        await insertMeal(valid);
      });
    }),
    deleteMeal: (id) => serialized(async () => { await db.runAsync('DELETE FROM meals WHERE id=?', [id]); }),
    saveProfile: (profile) => serialized(async () => { const valid = profileSchema.parse(profile); await db.runAsync('INSERT INTO profile(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', [JSON.stringify(valid)]); }),
    savePreferences: (preferences) => serialized(async () => {
      const valid = snapshotSchema.parse({ ...emptySnapshot(), preferences }).preferences;
      await db.runAsync('INSERT INTO preferences(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', [JSON.stringify(valid)]);
    }),
    saveGoal: (goal) => serialized(async () => {
      const valid = goalSchema.parse(goal);
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (valid.day < todayKey) throw new Error('La meta solo puede cambiar desde hoy o una fecha futura.');
      await db.runAsync('INSERT INTO goals(day,mode,kcal,method) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET mode=excluded.mode,kcal=excluded.kcal,method=excluded.method', [valid.day, valid.mode, valid.kcal, valid.method]);
    }),
    saveProduct: (product) => serialized(async () => {
      const valid = snapshotSchema.parse({ ...emptySnapshot(), products: [product] }).products[0];
      if (!valid) throw new Error('Producto inválido.');
      await db.runAsync('INSERT INTO products(barcode,json) VALUES(?,?) ON CONFLICT(barcode) DO UPDATE SET json=excluded.json', [valid.barcode, JSON.stringify(valid)]);
    }),
    saveFavorite: (meal) => serialized(async () => {
      const valid = snapshotSchema.parse({ ...emptySnapshot(), favorites: [meal] }).favorites[0];
      if (!valid) throw new Error('Comida guardada inválida.');
      await db.runAsync('INSERT INTO favorites(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', [valid.id, JSON.stringify(valid)]);
    }),
    deleteFavorite: (id) => serialized(async () => { await db.runAsync('DELETE FROM favorites WHERE id=?', [id]); }),
    replaceAll: (snapshot) => serialized(async () => {
      const valid = snapshotSchema.parse(snapshot);
      await db.withTransactionAsync(() => writeSnapshot(valid));
    }),
    clear: () => serialized(async () => db.withTransactionAsync(async () => writeSnapshot(emptySnapshot()))),
  };
}

let repositoryPromise: Promise<Repository> | undefined;
export function openRepository(): Promise<Repository> {
  repositoryPromise ??= openSqlDriver().then(createRepository).catch((error) => {
    repositoryPromise = undefined;
    throw error;
  });
  return repositoryPromise;
}
