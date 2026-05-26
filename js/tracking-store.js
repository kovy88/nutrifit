import { supabase } from './supabase.js?v=6';
import { getCurrentUser } from './auth.js?v=6';

const TRACKING_KEY = 'nutriplan-tracking-v2';
const LEGACY_FOOD_LOG_KEY = 'nutriplan-food-log';

export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key, amount) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
}

export function lastDays(count = 7, endDate = dateKey()) {
  return Array.from({ length: count }, (_, i) => addDays(endDate, i - count + 1));
}

export function formatDayLabel(key, options = {}) {
  const today = dateKey();
  if (!options.short && key === today) return 'Dnes';
  if (!options.short && key === addDays(today, -1)) return 'Včera';
  return new Date(`${key}T12:00:00`).toLocaleDateString('cs-CZ', {
    weekday: options.short ? undefined : 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

export function calcWaterGoal(weight, activityFactor = 1.375) {
  const base = Math.round(Number(weight || 0) * 35);
  const bonus = activityFactor >= 1.725 ? 1000 : activityFactor >= 1.55 ? 500 : 0;
  return Math.max(0, base + bonus);
}

function emptyDay(key = dateKey()) {
  return {
    date: key,
    target: null,
    mealPlan: null,
    foodLog: [],
    water: { amountMl: 0, goalMl: 0 },
    weight: null,
  };
}

function readLocalStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACKING_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? { days: {}, ...parsed } : { days: {} };
  } catch {
    return { days: {} };
  }
}

function writeLocalStore(store) {
  localStorage.setItem(TRACKING_KEY, JSON.stringify(store));
}

function getLocalDay(key) {
  const store = readLocalStore();
  const day = { ...emptyDay(key), ...(store.days?.[key] || {}) };
  day.foodLog = Array.isArray(day.foodLog) ? day.foodLog : [];
  day.water = { amountMl: 0, goalMl: 0, ...(day.water || {}) };
  return day;
}

function saveLocalDay(key, patch) {
  const store = readLocalStore();
  const current = getLocalDay(key);
  store.days = store.days || {};
  store.days[key] = { ...current, ...patch, date: key };
  writeLocalStore(store);
  return store.days[key];
}

function normalizeLog(row) {
  return {
    id: row.id,
    source: row.source || 'manual',
    foodName: row.food_name || row.foodName || '',
    mealType: row.meal_type || row.mealType || '',
    plannedMealId: row.planned_meal_id || row.plannedMealId || '',
    portionGuess: row.portion_guess || row.portionGuess || '',
    kcal: Number(row.kcal || 0),
    protein: Number(row.protein || 0),
    carbs: Number(row.carbs || 0),
    fat: Number(row.fat || 0),
    confidence: row.confidence || '',
    note: row.note || '',
    createdAt: row.eaten_at || row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function dbLogPayload(userId, key, item) {
  return {
    user_id: userId,
    log_date: key,
    source: item.source || 'manual',
    food_name: item.foodName,
    meal_type: item.mealType || null,
    planned_meal_id: item.plannedMealId || null,
    portion_guess: item.portionGuess || null,
    kcal: Number(item.kcal || 0),
    protein: Number(item.protein || 0),
    carbs: Number(item.carbs || 0),
    fat: Number(item.fat || 0),
    confidence: item.confidence || null,
    note: item.note || null,
    eaten_at: item.createdAt || new Date().toISOString(),
  };
}

export async function loadDay(key = dateKey()) {
  const user = getCurrentUser();
  if (!user) return getLocalDay(key);

  const [targets, plans, logs, water, weights] = await Promise.all([
    supabase.from('daily_targets').select('*').eq('user_id', user.id).eq('target_date', key).maybeSingle(),
    supabase.from('daily_meal_plans').select('*').eq('user_id', user.id).eq('plan_date', key).maybeSingle(),
    supabase.from('daily_food_logs').select('*').eq('user_id', user.id).eq('log_date', key).order('eaten_at', { ascending: false }),
    supabase.from('water_logs').select('*').eq('user_id', user.id).eq('log_date', key).maybeSingle(),
    supabase.from('weight_entries').select('*').eq('user_id', user.id).eq('entry_date', key).maybeSingle(),
  ]);

  return {
    date: key,
    target: targets.data ? {
      kcal: targets.data.kcal,
      protein: targets.data.protein,
      carbs: targets.data.carbs,
      fat: targets.data.fat,
      fiber: targets.data.fiber,
      bmr: targets.data.bmr,
      tdee: targets.data.tdee,
      waterGoalMl: targets.data.water_goal_ml,
      weight: targets.data.weight_kg,
      goal: targets.data.goal,
    } : null,
    mealPlan: plans.data ? { meals: plans.data.meals || [], totalKcal: plans.data.total_kcal || 0 } : null,
    foodLog: (logs.data || []).map(normalizeLog),
    water: water.data ? { amountMl: water.data.amount_ml || 0, goalMl: water.data.goal_ml || 0 } : { amountMl: 0, goalMl: 0 },
    weight: weights.data ? { weightKg: Number(weights.data.weight_kg), source: weights.data.source || 'manual' } : null,
  };
}

export async function saveDailyTarget(key, macros) {
  const target = {
    kcal: Number(macros.kcal || 0),
    protein: Number(macros.protein || 0),
    carbs: Number(macros.carbs || 0),
    fat: Number(macros.fat || 0),
    fiber: Number(macros.fiber || 0),
    bmr: Number(macros.bmr || 0),
    tdee: Number(macros.tdee || 0),
    waterGoalMl: Number(macros.waterGoalMl || 0),
    weight: Number(macros.weight || 0),
    goal: macros.goal || '',
  };
  saveLocalDay(key, { target, water: { ...getLocalDay(key).water, goalMl: target.waterGoalMl } });

  const user = getCurrentUser();
  if (user) {
    await supabase.from('daily_targets').upsert({
      user_id: user.id,
      target_date: key,
      kcal: target.kcal,
      protein: target.protein,
      carbs: target.carbs,
      fat: target.fat,
      fiber: target.fiber,
      bmr: target.bmr,
      tdee: target.tdee,
      water_goal_ml: target.waterGoalMl,
      weight_kg: target.weight || null,
      goal: target.goal || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,target_date' });
  }
  return target;
}

export async function saveMealPlan(key, meals) {
  const normalizedMeals = (meals || []).map((meal, index) => ({
    plannedMealId: meal.plannedMealId || `${key}-${index}-${String(meal.mealType || 'meal').toLowerCase().replace(/\s+/g, '-')}`,
    ...meal,
  }));
  const mealPlan = {
    meals: normalizedMeals,
    totalKcal: normalizedMeals.reduce((sum, meal) => sum + Number(meal.kcal || 0), 0),
  };
  saveLocalDay(key, { mealPlan });

  const user = getCurrentUser();
  if (user) {
    await supabase.from('daily_meal_plans').upsert({
      user_id: user.id,
      plan_date: key,
      meals: normalizedMeals,
      total_kcal: mealPlan.totalKcal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_date' });
  }
  return mealPlan;
}

export async function addFoodLogItem(key, item) {
  const localItem = normalizeLog({
    id: item.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `food-${Date.now()}`),
    ...item,
    createdAt: item.createdAt || new Date().toISOString(),
  });

  const user = getCurrentUser();
  if (user) {
    const { data } = await supabase
      .from('daily_food_logs')
      .insert(dbLogPayload(user.id, key, localItem))
      .select('*')
      .single();
    return normalizeLog(data || localItem);
  }

  const day = getLocalDay(key);
  const withoutDuplicate = localItem.plannedMealId
    ? day.foodLog.filter(x => x.plannedMealId !== localItem.plannedMealId)
    : day.foodLog;
  saveLocalDay(key, { foodLog: [localItem, ...withoutDuplicate] });
  return localItem;
}

export async function removeFoodLogItem(key, id) {
  const user = getCurrentUser();
  if (user) {
    await supabase.from('daily_food_logs').delete().eq('id', id);
    return;
  }
  const day = getLocalDay(key);
  saveLocalDay(key, { foodLog: day.foodLog.filter(item => item.id !== id) });
}

export async function clearFoodLog(key) {
  const user = getCurrentUser();
  if (user) {
    await supabase.from('daily_food_logs').delete().eq('user_id', user.id).eq('log_date', key);
    return;
  }
  saveLocalDay(key, { foodLog: [] });
}

export async function updateWater(key, amountMl, goalMl = 0) {
  const water = { amountMl: Math.max(0, Number(amountMl || 0)), goalMl: Math.max(0, Number(goalMl || 0)) };
  saveLocalDay(key, { water });

  const user = getCurrentUser();
  if (user) {
    await supabase.from('water_logs').upsert({
      user_id: user.id,
      log_date: key,
      amount_ml: water.amountMl,
      goal_ml: water.goalMl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' });
  }
  return water;
}

export async function upsertWeight(key, weightKg, source = 'manual') {
  const weight = { weightKg: Number(weightKg || 0), source };
  if (!weight.weightKg) return null;
  saveLocalDay(key, { weight });

  const user = getCurrentUser();
  if (user) {
    await supabase.from('weight_entries').upsert({
      user_id: user.id,
      entry_date: key,
      weight_kg: weight.weightKg,
      source,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,entry_date' });
  }
  return weight;
}

export async function loadTrends(rangeDays = 30, endDate = dateKey()) {
  const keys = lastDays(rangeDays, endDate);
  const user = getCurrentUser();
  let days;

  if (user) {
    const start = keys[0];
    const [targets, logs, water, weights] = await Promise.all([
      supabase.from('daily_targets').select('*').eq('user_id', user.id).gte('target_date', start).lte('target_date', endDate),
      supabase.from('daily_food_logs').select('*').eq('user_id', user.id).gte('log_date', start).lte('log_date', endDate),
      supabase.from('water_logs').select('*').eq('user_id', user.id).gte('log_date', start).lte('log_date', endDate),
      supabase.from('weight_entries').select('*').eq('user_id', user.id).gte('entry_date', start).lte('entry_date', endDate),
    ]);
    days = keys.map(key => {
      const target = (targets.data || []).find(x => x.target_date === key);
      const dayLogs = (logs.data || []).filter(x => x.log_date === key).map(normalizeLog);
      const waterRow = (water.data || []).find(x => x.log_date === key);
      const weightRow = (weights.data || []).find(x => x.entry_date === key);
      return {
        date: key,
        target: target ? { protein: target.protein, kcal: target.kcal } : null,
        foodLog: dayLogs,
        water: waterRow ? { amountMl: waterRow.amount_ml, goalMl: waterRow.goal_ml } : { amountMl: 0, goalMl: 0 },
        weight: weightRow ? { weightKg: Number(weightRow.weight_kg), source: weightRow.source } : null,
      };
    });
  } else {
    days = keys.map(getLocalDay);
  }

  return { days, streak: calcProteinStreak(days) };
}

export async function migrateAnonymousTracking() {
  const user = getCurrentUser();
  if (!user) return;

  const store = readLocalStore();
  const days = Object.values(store.days || {});

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FOOD_LOG_KEY) || 'null');
    if (legacy?.date && Array.isArray(legacy.items) && !store.days?.[legacy.date]) {
      days.push({ ...emptyDay(legacy.date), foodLog: legacy.items.map(normalizeLog) });
    }
  } catch {}

  for (const day of days) {
    if (day.target) await saveDailyTarget(day.date, day.target);
    if (day.mealPlan?.meals?.length) await saveMealPlan(day.date, day.mealPlan.meals);
    if (day.water) await updateWater(day.date, day.water.amountMl, day.water.goalMl);
    if (day.weight?.weightKg) await upsertWeight(day.date, day.weight.weightKg, day.weight.source || 'manual');

    for (const item of day.foodLog || []) {
      if (item.plannedMealId) {
        const existing = await supabase
          .from('daily_food_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('log_date', day.date)
          .eq('planned_meal_id', item.plannedMealId)
          .limit(1);
        if (existing.data?.length) continue;
      }
      await supabase.from('daily_food_logs').insert(dbLogPayload(user.id, day.date, normalizeLog(item)));
    }
  }

  localStorage.removeItem(TRACKING_KEY);
  localStorage.removeItem(LEGACY_FOOD_LOG_KEY);
}

function calcProteinStreak(days) {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    const proteinGoal = Number(day.target?.protein || 0);
    if (!proteinGoal) break;
    const protein = (day.foodLog || []).reduce((sum, item) => sum + Number(item.protein || 0), 0);
    if (protein >= proteinGoal * 0.8) streak += 1;
    else break;
  }
  return streak;
}
