// ── CZECH CATALOG (source of truth for keys)
//
// Klíče: <oblast>.<prvek>. Hodnoty buď string, nebo funkce pro interpolaci.
// Pluralizace: helper `czPlural(n, [jedna, dvě_až_čtyři, pět_plus])`.

import type { Catalog } from './types';

function czDay(n: number): string {
  if (n === 1) return 'den';
  if (n >= 2 && n <= 4) return 'dny';
  return 'dní';
}

function czWorkout(n: number): string {
  if (n === 1) return 'trénink';
  if (n >= 2 && n <= 4) return 'tréninky';
  return 'tréninků';
}

export const cs = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.save': 'Uložit',
  'common.cancel': 'Zrušit',
  'common.close': 'Zavřít',
  'common.delete': 'Smazat',
  'common.back': 'Zpět',
  'common.continue': 'Pokračovat',
  'common.retry': 'Zkusit znovu',
  'common.loading': 'Načítám…',
  'common.error': 'Chyba',
  'common.today': 'Dnes',
  'common.yesterday': 'Včera',
  'common.tomorrow': 'Zítra',

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  'tab.home': 'Dnes',
  'tab.plan': 'Jídelníček',
  'tab.training': 'Trénink',
  'tab.photo': 'Foto',
  'tab.history': 'Uloženo',
  'tab.profile': 'Profil',

  // ── Home screen ──────────────────────────────────────────────────────────────
  'home.title': 'Dnes',
  'home.remainingToday': 'Zbývá dnes',
  'home.kcalRemaining': 'kcal zbývá',
  'home.dailyTarget': ({ target, used }: Record<string, string | number>) => `Denní cíl: ${target} kcal · Snědeno: ${used} kcal`,
  'home.protein': '🍗 Bílkoviny',
  'home.carbs': '🍚 Sacharidy',
  'home.fat': '🥑 Tuky',
  'home.weightTracking': '📈 Sledování váhy',
  'home.weightPlaceholder': 'Zadej váhu v kg…',
  'home.last7days': 'Posledních 7 dní:',
  'home.weekdayShort': ({ dow }: Record<string, string | number>) => ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'][Number(dow)],
  'home.todayActivity': 'Aktivita dnes',
  'home.steps': 'Kroky',
  'home.activeKcal': 'Aktivní kcal',
  'home.sleep': 'Spánek',
  'home.restingHr': 'Klidový tep',
  'home.noHealthData': 'Zatím nemáme žádná data ze zdravotních zdrojů.',
  'home.appleHealthSoon': 'Apple Health se přidá v příští verzi. Zatím můžeš zapisovat ručně.',
  'home.readiness': 'Připravenost',
  'home.trainingLoad': 'Tréninková zátěž',
  'home.quickAdd': 'Rychlé ruční zapsání',
  'home.foodName': 'Název jídla',
  'home.addFood': 'Přidat jídlo',
  'home.loggedFood': 'Zapsaná jídla',
  'home.clearDay': 'Vymazat den',
  'home.emptyLogTitle': 'Dnes jsi ještě nic nezapsal/a',
  'home.emptyLogSubtitle': 'Nech si od AI vygenerovat ideální plán jídelníčku na míru, nebo si vyfoť hotové jídlo!',
  'home.emptyLogPlan': '🗓️ Plán jídelníčku',
  'home.emptyLogPhoto': '📸 Vyfotit jídlo',
  'home.remove': 'Smazat',
  'home.saveWeight': 'Uložit',
  'home.sleepDebtBadge': ({ h }: Record<string, string | number>) => `💤 Spánkový dluh ${h}h za 14d`,
  'home.recoveryDebtBadge': ({ n }: Record<string, string | number>) => `🔋 Recovery debt ${n} bodů`,
  'home.strainWorkouts': ({ n, trimp }: Record<string, string | number>) => `${n} ${czWorkout(Number(n))} · ${trimp} TRIMP`,
  'home.strainPlanned': ({ trimp }: Record<string, string | number>) => `Plánováno: ${trimp} TRIMP`,
  'home.load7d': '7 dní',
  'home.load28d': '28 dní',
  'home.loadPerDay': 'TRIMP/d',
  'home.loadAcuteChronic': 'acute / chronic',
  'home.loadWorkoutsCount': ({ n }: Record<string, string | number>) => `${n} tréninků`,
  'home.adjustmentTitle': 'Dnešní úprava podle tréninku',
  'home.restDay': 'Volný den',
  'home.adjCalories': 'Kalorie',
  'home.adjCarbs': 'Sacharidy',
  'home.adjFat': 'Tuky',
  'home.baselineRec': ({ base, today }: Record<string, string | number>) => `Základní doporučení ${base} kcal → dnes ${today} kcal`,
  'home.macroProteinShort': 'B',
  'home.macroCarbsShort': 'S',
  'home.macroFatShort': 'T',
  'home.manualPortion': 'Ručně zadané',
  'home.manualNote': 'Ručně upravená hodnota uživatelem.',
  'home.foodMacros': ({ kcal, p, c, f }: Record<string, string | number>) => `${kcal} kcal · B ${p}g · S ${c}g · T ${f}g`,
  'home.alertMissingName': 'Chybí název',
  'home.alertMissingNameMsg': 'Napiš název jídla.',
  'home.alertWeightInvalid': 'Zadej prosím platnou váhu mezi 30 a 300 kg.',
  'home.alertSuccess': 'Úspěch',
  'home.alertWeightSaved': ({ w, date }: Record<string, string | number>) => `Váha ${w} kg úspěšně uložena k datu ${date}.`,

  // ── Readiness levels ──────────────────────────────────────────────────────────
  'readiness.ready': 'Připraven',
  'readiness.mild': 'Mírně',
  'readiness.regenerate': 'Regeneruj',
  'readiness.planAdjust': 'Doporučená úprava plánu',
  'readiness.adjustToday': 'Upravit dnešní trénink',

  // ── Strain / training load bands ───────────────────────────────────────────────
  'strain.recovery': 'Regenerační den',
  'strain.light': 'Lehká aktivita',
  'strain.moderate': 'Středně náročné',
  'strain.high': 'Vysoká zátěž',
  'strain.all_out': 'Extrémní zátěž',
  'load.optimal': 'Optimum',
  'load.detraining': 'Klesá',
  'load.overreaching': 'Hodně',
  'load.high_risk': 'Riziko',

  // ── Settings ──────────────────────────────────────────────────────────────────
  'settings.title': 'Nastavení',
  'settings.subtitle': 'Propoj zdroje zdravotních dat. NutriPlan sjednotí všechno do jednoho přehledu, automaticky deduplikuje tréninky a doporučí úpravy podle dat z nejlepšího zdroje.',
  'settings.language': '🌍 Jazyk',
  'settings.languageDesc': 'Vyber jazyk aplikace.',
  'settings.morningCoaching': '🔔 Ranní coaching',
  'settings.connect': 'Připojit',
  'settings.disconnect': 'Odpojit',
  'settings.connected': '✓ Připojeno',
  'settings.opening': 'Otevírám…',

  // ── Profile ─────────────────────────────────────────────────────────────────
  'profile.title': 'Profil',
  'profile.mainGoal': 'Hlavní cíl',
  'profile.trainingGoal': 'Tréninkový cíl',
  'profile.sessionsPerWeek': 'Tréninků týdně',
  'profile.currentWeight': 'Aktuální váha (kg)',
  'profile.weeklyCheckIn': '🎯 Spustit týdenní check-in',
  'profile.aiSummary': '🤖 AI týdenní shrnutí',
  'profile.aiSummaryGenerating': '🤖 Sestavuji shrnutí…',
  'profile.healthSettings': '⚙️ Zdravotní zdroje a nastavení',
  'profile.restartOnboarding': 'Spustit onboarding znovu',
  'profile.account': 'Účet',
  'profile.exportData': 'Exportovat data',
  'profile.signOut': 'Odhlásit se',
  'profile.deleteAccount': 'Smazat účet a data',

  // ── Goals (primary) ─────────────────────────────────────────────────────────
  'goal.lose_weight': 'Hubnutí',
  'goal.maintain_weight': 'Udržení váhy',
  'goal.gain_muscle': 'Nabírání svalů',
  'goal.run_race': 'Běžecký závod',
  'goal.triathlon': 'Triatlon',
  'goal.hyrox_ocr': 'Hyrox / OCR',
  'goal.get_fit': 'Kondice',
  'goal.sport_conditioning': 'Sportovní výkon',

  // ── Pluralized helpers (exported as functions) ─────────────────────────────────
  'streak.daysLogged': ({ n }: Record<string, string | number>) => `${n} ${czDay(Number(n))} zapsáno`,
  'streak.daysOnTarget': ({ n }: Record<string, string | number>) => `${n} ${czDay(Number(n))} v cíli`,
} satisfies Catalog;

export type TranslationKey = keyof typeof cs;
