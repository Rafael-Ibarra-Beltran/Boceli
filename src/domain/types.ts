export type Mode = 'lose' | 'maintain' | 'log';
export type Source = 'ai' | 'label' | 'off' | 'manual';
export type Unit = 'g' | 'ml' | 'portion';
export type Category = 'Desayuno' | 'Comida' | 'Cena' | 'Snacks';
export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: Unit;
  /** Always expressed in unit, just like quantity. Equivalence fields are informational. */
  basisQuantity: number;
  basisKcal: number;
  source: Source;
  sourceDetail: string;
  estimated: boolean;
  portionLabel?: string;
  equivalentQuantity?: number;
  equivalentUnit?: 'g' | 'ml';
  equivalenceSource?: string;
}
export interface Meal {
  id: string;
  name: string;
  day: string;
  createdAt: string;
  offsetMinutes: number;
  category: Category;
  items: FoodItem[];
  notes: string;
}
export interface Profile {
  age: number;
  weightKg: number;
  heightCm: number;
  physiology: 'male' | 'female';
  activity: 1.4 | 1.7 | 2;
  excluded: boolean;
}
export interface GoalVersion {
  day: string;
  mode: Mode;
  kcal: number | null;
  method: 'manual' | 'mifflin' | 'none';
}
export interface Preferences {
  nearNotice: boolean;
  overNotice: boolean;
  aiConsent: boolean;
  offContact: string;
}
export interface Product {
  barcode: string;
  name: string;
  brand: string;
  fetchedAt: string;
  sourceUrl: string;
  bases: { quantity: number; unit: Unit; kcal: number; label: string }[];
  servingDescription: string;
  packageDescription: string;
  equivalentQuantity?: number;
  equivalentUnit?: 'g' | 'ml';
}
export interface SavedMeal { id: string; name: string; items: FoodItem[]; notes: string }
export interface Snapshot {
  profile: Profile | null;
  preferences: Preferences;
  goals: GoalVersion[];
  meals: Meal[];
  products: Product[];
  favorites: SavedMeal[];
}
export const defaultPreferences: Preferences = {
  nearNotice: true, overNotice: true, aiConsent: false, offContact: '',
};
export const emptySnapshot = (): Snapshot => ({
  profile: null, preferences: { ...defaultPreferences }, goals: [], meals: [], products: [], favorites: [],
});
