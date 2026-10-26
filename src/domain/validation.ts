import { z } from 'zod';
import type { GoalVersion, Snapshot } from './types';
import { isCalendarDay } from './calculations';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const daySchema = z.string().refine(isCalendarDay, 'La fecha debe ser YYYY-MM-DD y existir.');
const quantity = z.number().finite().min(0.001).max(1_000_000);
const energy = z.number().finite().min(0).max(100_000);

export const foodItemSchema = z.object({
  id: boundedText(120),
  name: boundedText(160),
  quantity,
  unit: z.enum(['g', 'ml', 'portion']),
  basisQuantity: quantity,
  basisKcal: energy,
  source: z.enum(['ai', 'label', 'off', 'manual']),
  sourceDetail: z.string().max(300),
  estimated: z.boolean(),
  portionLabel: z.string().max(120).optional(),
  equivalentQuantity: quantity.optional(),
  equivalentUnit: z.enum(['g', 'ml']).optional(),
  equivalenceSource: boundedText(200).optional(),
}).strict().superRefine((item, context) => {
  const hasQuantity = item.equivalentQuantity !== undefined;
  const hasUnit = item.equivalentUnit !== undefined;
  const hasSource = item.equivalenceSource !== undefined;
  if (hasQuantity !== hasUnit || hasQuantity !== hasSource) {
    context.addIssue({ code: 'custom', path: ['equivalentQuantity'], message: 'La equivalencia requiere cantidad, unidad y procedencia.' });
  }
  if (item.unit !== 'portion' && hasQuantity) {
    context.addIssue({ code: 'custom', path: ['equivalentQuantity'], message: 'Solo una porción doméstica admite equivalencia.' });
  }
  const calculatedKcal = (item.quantity / item.basisQuantity) * item.basisKcal;
  if (!Number.isFinite(calculatedKcal) || calculatedKcal > 100_000) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'La energía calculada por alimento supera el límite permitido.' });
  }
});

const timestampSchema = z.string().datetime({ offset: true });
const categorySchema = z.enum(['Desayuno', 'Comida', 'Cena', 'Snacks']);

export const mealSchema = z.object({
  id: boundedText(120),
  name: boundedText(160),
  day: daySchema,
  createdAt: timestampSchema,
  offsetMinutes: z.number().int().min(-840).max(840),
  category: categorySchema,
  items: z.array(foodItemSchema).min(1).max(100),
  notes: z.string().max(2000),
}).strict().superRefine((meal, context) => {
  const ids = new Set<string>();
  meal.items.forEach((item, index) => {
    if (ids.has(item.id)) context.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'El identificador de alimento está duplicado.' });
    ids.add(item.id);
  });
});

export const profileSchema = z.object({
  age: z.number().int().min(1).max(120),
  weightKg: z.number().finite().min(20).max(400),
  heightCm: z.number().finite().min(100).max(250),
  physiology: z.enum(['male', 'female']),
  activity: z.union([z.literal(1.4), z.literal(1.7), z.literal(2)]),
  excluded: z.boolean(),
}).strict();

export const goalSchema = z.object({
  day: daySchema,
  mode: z.enum(['lose', 'maintain', 'log']),
  kcal: energy.nullable(),
  method: z.enum(['manual', 'mifflin', 'none']),
}).strict().superRefine((goal, context) => {
  if (goal.mode === 'log') {
    if (goal.kcal !== null || goal.method !== 'none') {
      context.addIssue({ code: 'custom', message: 'El modo de registro no puede tener meta calórica.' });
    }
    return;
  }
  if (goal.kcal === null || goal.kcal === 0 || goal.method === 'none') {
    context.addIssue({ code: 'custom', message: 'Una meta requiere calorías y método.' });
  } else if (goal.method === 'mifflin' && goal.kcal < 1200) {
    context.addIssue({ code: 'custom', path: ['kcal'], message: 'La meta calculada no puede ser menor que 1.200 kcal.' });
  } else if (goal.method === 'manual' && (goal.kcal < 1000 || goal.kcal > 10000)) {
    context.addIssue({ code: 'custom', path: ['kcal'], message: 'La meta manual debe estar entre 1.000 y 10.000 kcal.' });
  }
});

const preferencesSchema = z.object({
  nearNotice: z.boolean(), overNotice: z.boolean(), aiConsent: z.boolean(), offContact: z.string().max(254),
}).strict();

const productSchema = z.object({
  barcode: z.string().regex(/^\d{8,14}$/),
  name: boundedText(200), brand: z.string().max(200),
  fetchedAt: timestampSchema,
  sourceUrl: z.string().url().max(1000),
  bases: z.array(z.object({ quantity, unit: z.enum(['g', 'ml', 'portion']), kcal: energy, label: boundedText(200) }).strict()).max(20),
  servingDescription: z.string().max(300), packageDescription: z.string().max(300),
  equivalentQuantity: quantity.optional(), equivalentUnit: z.enum(['g', 'ml']).optional(),
}).strict().superRefine((product, context) => {
  if ((product.equivalentQuantity === undefined) !== (product.equivalentUnit === undefined)) {
    context.addIssue({ code: 'custom', path: ['equivalentQuantity'], message: 'La equivalencia del producto está incompleta.' });
  }
  let url: URL | undefined;
  try { url = new URL(product.sourceUrl); } catch { /* url schema reports malformed URLs */ }
  if (!url || url.protocol !== 'https:' || url.hostname !== 'world.openfoodfacts.org' ||
      url.pathname !== `/product/${product.barcode}` || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'El enlace del producto no corresponde a su registro en Open Food Facts.' });
  }
});

const savedMealSchema = z.object({
  id: boundedText(120), name: boundedText(160), items: z.array(foodItemSchema).min(1).max(100), notes: z.string().max(2000),
}).strict().superRefine((meal, context) => {
  const ids = new Set<string>();
  meal.items.forEach((item, index) => {
    if (ids.has(item.id)) context.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'El identificador de alimento está duplicado.' });
    ids.add(item.id);
  });
});

export const snapshotSchema = z.object({
  profile: profileSchema.nullable(),
  preferences: preferencesSchema,
  goals: z.array(goalSchema).max(10000),
  meals: z.array(mealSchema).max(50000),
  products: z.array(productSchema).max(50000),
  favorites: z.array(savedMealSchema).max(10000),
}).strict().superRefine((snapshot, context) => {
  unique(snapshot.goals.map((goal) => goal.day), 'goals', context);
  unique(snapshot.meals.map((meal) => meal.id), 'meals', context);
  unique(snapshot.products.map((product) => product.barcode), 'products', context);
  unique(snapshot.favorites.map((meal) => meal.id), 'favorites', context);
});

function unique(values: string[], path: string, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) context.addIssue({ code: 'custom', path: [path, index], message: 'Hay un registro duplicado.' });
    seen.add(value);
  });
}

export function validateSnapshot(value: unknown): Snapshot {
  return snapshotSchema.parse(value);
}

export function validateGoal(goal: GoalVersion): GoalVersion {
  return goalSchema.parse(goal);
}
