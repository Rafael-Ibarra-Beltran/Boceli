import type {
  FoodItem,
  GoalVersion,
  Meal,
  Mode,
  Preferences,
  Profile,
} from './types';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDay(day: string, amount: number): string {
  if (!isCalendarDay(day)) throw new Error('La fecha no es válida.');
  if (!Number.isSafeInteger(amount)) throw new Error('El cambio de día debe ser un entero.');
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, date! + amount, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function energyKcal(value: number, unit: 'kcal' | 'kJ'): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('La energía debe ser un número positivo o cero.');
  return unit === 'kJ' ? value / 4.184 : value;
}

export function itemKcal(item: FoodItem): number {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.basisQuantity) || item.basisQuantity <= 0 ||
      !Number.isFinite(item.basisKcal) || item.basisKcal < 0) {
    throw new Error('La porción o su energía no son válidas.');
  }
  // basisQuantity always uses item.unit; equivalence fields describe a portion only.
  return (item.quantity / item.basisQuantity) * item.basisKcal;
}

export function mealKcal(meal: Meal): number {
  return meal.items.reduce((total, item) => total + itemKcal(item), 0);
}

export function dayTotal(meals: Meal[], day: string): number {
  return meals.reduce((total, meal) => total + (meal.day === day ? mealKcal(meal) : 0), 0);
}

export function goalForDay(goals: GoalVersion[], day: string): GoalVersion | null {
  return goals
    .filter((goal) => goal.day <= day)
    .reduce<GoalVersion | null>((latest, goal) => !latest || goal.day > latest.day ? goal : latest, null);
}

export function calculateProposal(profile: Profile, mode: Extract<Mode, 'lose' | 'maintain'>): {
  resting: number;
  maintenance: number;
  target: number;
  deficit: number;
} {
  if (mode !== 'lose' && mode !== 'maintain') throw new Error('El objetivo no es válido.');
  if (!Number.isInteger(profile.age) || profile.age < 19 || profile.age > 78) {
    throw new Error('El cálculo automático está disponible para adultos de 19 a 78 años.');
  }
  if (profile.excluded) {
    throw new Error('El cálculo automático no aplica a la situación indicada.');
  }
  if (!Number.isFinite(profile.weightKg) || profile.weightKg < 20 || profile.weightKg > 400 ||
      !Number.isFinite(profile.heightCm) || profile.heightCm < 100 || profile.heightCm > 250 ||
      ![1.4, 1.7, 2].includes(profile.activity) ||
      (profile.physiology !== 'male' && profile.physiology !== 'female')) {
    throw new Error('Revisa peso, estatura, actividad y parámetro fisiológico.');
  }

  const bmi = profile.weightKg / ((profile.heightCm / 100) ** 2);
  if (mode === 'lose' && bmi < 18.5) {
    throw new Error('No se propone bajar de peso con un IMC estimado inferior a 18,5.');
  }

  const resting = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age +
    (profile.physiology === 'male' ? 5 : -161);
  const maintenance = resting * profile.activity;
  if (!Number.isFinite(resting) || resting <= 0 || !Number.isFinite(maintenance)) {
    throw new Error('No se pudo calcular una estimación válida con estos datos.');
  }

  const target = mode === 'maintain'
    ? roundToTen(maintenance)
    : Math.ceil((maintenance - Math.min(maintenance * 0.1, 300)) / 10) * 10;
  if (target < 1200) {
    throw new Error('La meta calculada queda por debajo de 1.200 kcal; elige otra opción o una meta manual.');
  }

  return { resting, maintenance, target, deficit: mode === 'lose' ? maintenance - target : 0 };
}

function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

export function validateManualGoal(kcal: number): string | null {
  if (!Number.isFinite(kcal) || kcal < 1000 || kcal > 10000) {
    throw new Error('La meta manual debe estar entre 1.000 y 10.000 kcal.');
  }
  if (kcal < 1200) return 'Esta meta es baja; confirma que sea adecuada para ti.';
  if (kcal > 5000) return 'Esta meta es alta; confirma que el valor sea correcto.';
  return null;
}

export function noticeForDay(total: number, goal: GoalVersion | null, preferences: Preferences): string | null {
  if (!goal || goal.mode === 'log' || goal.kcal === null || !Number.isFinite(total)) return null;
  if (total > goal.kcal) return preferences.overNotice ? 'Superaste la meta diaria.' : null;
  if (total === goal.kcal && preferences.nearNotice) return 'Alcanzaste la meta diaria.';
  if (total >= goal.kcal * 0.9 && preferences.nearNotice) return 'Estás cerca de la meta diaria.';
  return null;
}

export function parseNumber(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  const sign = /^[+-]/.test(value) ? value[0] : '';
  const unsigned = sign ? value.slice(1) : value;
  let normalized = unsigned;
  if (unsigned.includes('.') && unsigned.includes(',')) {
    const decimalMark = unsigned.lastIndexOf('.') > unsigned.lastIndexOf(',') ? '.' : ',';
    const groupMark = decimalMark === '.' ? ',' : '.';
    const [integer, fraction, ...extra] = unsigned.split(decimalMark);
    if (extra.length || !/^\d{1,3}(?:[.,]\d{3})+$/.test(integer!) || !/^\d+$/.test(fraction!)) {
      throw new Error('Escribe un número válido.');
    }
    normalized = `${integer!.split(groupMark).join('')}.${fraction}`;
  } else if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(unsigned)) {
    throw new Error('Escribe un número válido.');
  }
  const parsed = Number(`${sign}${normalized.replace(',', '.')}`);
  if (!Number.isFinite(parsed)) throw new Error('Escribe un número válido.');
  return parsed;
}

export function formatKcal(kcal: number): string {
  if (!Number.isFinite(kcal) || kcal < 0) throw new Error('La energía no es válida.');
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(Math.round(kcal))} kcal`;
}
