// ── ENGLISH CATALOG
//
// Must implement every key from cs (enforced by the `Record<TranslationKey, …>`
// type below). When you add a key to cs, TS will error here until you add it.

import type { CatalogValue } from './types';
import type { TranslationKey } from './catalog.cs';

function enDays(n: number): string {
  return n === 1 ? 'day' : 'days';
}

export const en: Record<TranslationKey, CatalogValue> = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.back': 'Back',
  'common.continue': 'Continue',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.error': 'Error',
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
  'common.tomorrow': 'Tomorrow',

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  'tab.home': 'Today',
  'tab.plan': 'Meals',
  'tab.training': 'Training',
  'tab.photo': 'Photo',
  'tab.history': 'Progress',
  'tab.profile': 'Profile',

  // ── Home screen ──────────────────────────────────────────────────────────────
  'home.title': 'Today',
  'home.remainingToday': 'Remaining today',
  'home.kcalRemaining': 'kcal left',
  'home.dailyTarget': ({ target, used }) => `Daily target: ${target} kcal · Eaten: ${used} kcal`,
  'home.protein': '🍗 Protein',
  'home.carbs': '🍚 Carbs',
  'home.fat': '🥑 Fat',
  'home.weightTracking': '📈 Weight tracking',
  'home.weightPlaceholder': 'Enter weight in kg…',
  'home.last7days': 'Last 7 days:',
  'home.weekdayShort': ({ dow }) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][Number(dow)],
  'home.todayActivity': "Today's activity",
  'home.steps': 'Steps',
  'home.activeKcal': 'Active kcal',
  'home.sleep': 'Sleep',
  'home.restingHr': 'Resting HR',
  'home.noHealthData': 'No data from health sources yet.',
  'home.appleHealthSoon': 'Apple Health arrives in the next version. For now you can log manually.',
  'home.readiness': 'Readiness',
  'home.trainingLoad': 'Training load',
  'home.quickAdd': 'Quick manual entry',
  'home.foodName': 'Food name',
  'home.addFood': 'Add food',
  'home.loggedFood': 'Logged meals',
  'home.clearDay': 'Clear day',
  'home.emptyLogTitle': "You haven't logged anything today",
  'home.emptyLogSubtitle': 'Let AI generate a tailored meal plan, or snap a photo of your meal!',
  'home.emptyLogPlan': '🗓️ Meal plan',
  'home.emptyLogPhoto': '📸 Photo a meal',
  'home.remove': 'Remove',
  'home.saveWeight': 'Save',
  'home.sleepDebtBadge': ({ h }) => `💤 Sleep debt ${h}h over 14d`,
  'home.recoveryDebtBadge': ({ n }) => `🔋 Recovery debt ${n} pts`,
  'home.strainWorkouts': ({ n, trimp }) => `${n} ${Number(n) === 1 ? 'workout' : 'workouts'} · ${trimp} TRIMP`,
  'home.strainPlanned': ({ trimp }) => `Planned: ${trimp} TRIMP`,
  'home.load7d': '7 days',
  'home.load28d': '28 days',
  'home.loadPerDay': 'TRIMP/d',
  'home.loadAcuteChronic': 'acute / chronic',
  'home.loadWorkoutsCount': ({ n }) => `${n} ${Number(n) === 1 ? 'workout' : 'workouts'}`,
  'home.adjustmentTitle': "Today's training adjustment",
  'home.restDay': 'Rest day',
  'home.adjCalories': 'Calories',
  'home.adjCarbs': 'Carbs',
  'home.adjFat': 'Fat',
  'home.baselineRec': ({ base, today }) => `Baseline ${base} kcal → today ${today} kcal`,
  'home.macroProteinShort': 'P',
  'home.macroCarbsShort': 'C',
  'home.macroFatShort': 'F',
  'home.manualPortion': 'Manual entry',
  'home.manualNote': 'Value entered manually by the user.',
  'home.foodMacros': ({ kcal, p, c, f }) => `${kcal} kcal · P ${p}g · C ${c}g · F ${f}g`,
  'home.alertMissingName': 'Missing name',
  'home.alertMissingNameMsg': 'Enter a food name.',
  'home.alertWeightInvalid': 'Please enter a valid weight between 30 and 300 kg.',
  'home.alertSuccess': 'Success',
  'home.alertWeightSaved': ({ w, date }) => `Weight ${w} kg saved for ${date}.`,

  // ── Readiness levels ──────────────────────────────────────────────────────────
  'readiness.ready': 'Ready',
  'readiness.mild': 'Mild',
  'readiness.regenerate': 'Recover',
  'readiness.planAdjust': 'Suggested plan adjustment',
  'readiness.adjustToday': "Adjust today's workout",

  // ── Strain / training load bands ───────────────────────────────────────────────
  'strain.recovery': 'Recovery day',
  'strain.light': 'Light activity',
  'strain.moderate': 'Moderate',
  'strain.high': 'High strain',
  'strain.all_out': 'All-out',
  'load.optimal': 'Optimal',
  'load.detraining': 'Detraining',
  'load.overreaching': 'High',
  'load.high_risk': 'Risk',

  // ── Settings ──────────────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.subtitle': 'Connect your health data sources. NutriPlan merges everything into one view, automatically deduplicates workouts, and recommends adjustments from your best source.',
  'settings.language': '🌍 Language',
  'settings.languageDesc': 'Choose the app language.',
  'settings.morningCoaching': '🔔 Morning coaching',
  'settings.connect': 'Connect',
  'settings.disconnect': 'Disconnect',
  'settings.connected': '✓ Connected',
  'settings.opening': 'Opening…',

  // ── Profile ─────────────────────────────────────────────────────────────────
  'profile.title': 'Profile',
  'profile.mainGoal': 'Main goal',
  'profile.trainingGoal': 'Training goal',
  'profile.sessionsPerWeek': 'Sessions per week',
  'profile.currentWeight': 'Current weight (kg)',
  'profile.weeklyCheckIn': '🎯 Start weekly check-in',
  'profile.aiSummary': '🤖 AI weekly summary',
  'profile.aiSummaryGenerating': '🤖 Composing summary…',
  'profile.healthSettings': '⚙️ Health sources & settings',
  'profile.restartOnboarding': 'Restart onboarding',
  'profile.account': 'Account',
  'profile.exportData': 'Export data',
  'profile.signOut': 'Sign out',
  'profile.deleteAccount': 'Delete account & data',

  // ── Goals (primary) ─────────────────────────────────────────────────────────
  'goal.lose_weight': 'Weight loss',
  'goal.maintain_weight': 'Maintain weight',
  'goal.gain_muscle': 'Build muscle',
  'goal.run_race': 'Running race',
  'goal.triathlon': 'Triathlon',
  'goal.hyrox_ocr': 'Hyrox / OCR',
  'goal.get_fit': 'Get fit',
  'goal.sport_conditioning': 'Sport conditioning',

  // ── Pluralized helpers ─────────────────────────────────────────────────────────
  'streak.daysLogged': ({ n }) => `${n} ${enDays(Number(n))} logged`,
  'streak.daysOnTarget': ({ n }) => `${n} ${enDays(Number(n))} on target`,
};
