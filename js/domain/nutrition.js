// ⚠️ FROZEN — needituj. Kanonická logika: mobile/src/utils/nutrition.ts (TypeScript).
//    Mobilní app je single source of truth; tohle je legacy origin webu. Viz js/domain/README.md.
//
// ── DETERMINISTIC NUTRITION CORE
//
// Veškeré numerické výpočty energetického příjmu a maker. Žádné DOM přístupy,
// žádný stav — čisté funkce nad doménovými typy z [[types]].
//
// Důvod existence: AI smí navrhovat recepty, výměny a texty, ale denní kcal,
// bílkoviny, tuky a sacharidy musejí být deterministicky kontrolovatelné.
// Tato vrstva je jednotka pravdy pro plánovač i pro check-iny.

/** @typedef {import('./types.js').UserProfile} UserProfile */
/** @typedef {import('./types.js').NutritionGoal} NutritionGoal */
/** @typedef {import('./types.js').TrainingGoal} TrainingGoal */
/** @typedef {import('./types.js').MacroTargets} MacroTargets */
/** @typedef {import('./types.js').ActivityLevel} ActivityLevel */
/** @typedef {import('./types.js').WeeklyCheckIn} WeeklyCheckIn */
/** @typedef {import('./types.js').PlanAdjustment} PlanAdjustment */
/** @typedef {import('./types.js').TrainingSession} TrainingSession */

// Bezpečnostní limity. Nikdy nedoporučíme méně než 1200 / 1500 kcal a žádné
// hubnutí rychlejší než ~1 % tělesné hmotnosti za týden.
export const SAFETY = Object.freeze({
  MIN_KCAL_FEMALE: 1200,
  MIN_KCAL_MALE: 1500,
  MAX_DEFICIT_PCT: 0.25,       // ne hlouběji než −25 % z TDEE
  MAX_SURPLUS_PCT: 0.15,       // ne výš než +15 % nad TDEE
  MAX_WEEKLY_LOSS_KG_PER_KG: 0.01, // 1 % tělesné hmotnosti / týden
});

export const ACTIVITY_FACTORS = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
});

/**
 * Bezpečnostní posouzení profilu před výpočtem maker a AI plánem.
 * @param {Pick<UserProfile,'ageYears'|'heightCm'|'weightKg'>} profile
 * @param {NutritionGoal} goal
 * @returns {{ allowed:boolean, level:'ok'|'warning'|'blocked', bmi:number, code?:string, title?:string, message?:string, adjustedGoalKind?:import('./types.js').NutritionGoalKind }}
 */
export function assessProfileSafety(profile, goal) {
  const heightM = Number(profile.heightCm || 0) / 100;
  const bmi = heightM > 0 ? Number(profile.weightKg || 0) / (heightM ** 2) : 0;

  if (Number(profile.ageYears || 0) < 16) {
    return {
      allowed: false,
      level: 'blocked',
      bmi,
      code: 'age_under_16',
      title: 'NutriPlan není určený pro děti a dospívající',
      message: 'U věku pod 16 let může být omezení kalorií rizikové. Jídelníček ti tady nevygenerujeme; pro bezpečný plán se obrať na lékaře nebo nutričního terapeuta.',
    };
  }

  if (bmi > 0 && bmi < 16) {
    return {
      allowed: false,
      level: 'blocked',
      bmi,
      code: 'bmi_under_16',
      title: `Tvoje BMI je ${bmi.toFixed(1)} — těžká podváha`,
      message: 'Při takovém BMI může být jakékoliv omezování kalorií nebezpečné. Jídelníček ti tady nevygenerujeme; doporučujeme konzultaci s lékařem nebo nutričním terapeutem.',
    };
  }

  if (bmi > 40) {
    return {
      allowed: false,
      level: 'blocked',
      bmi,
      code: 'bmi_over_40',
      title: `Tvoje BMI je ${bmi.toFixed(1)} — potřebuje individuální péči`,
      message: 'Při BMI nad 40 je bezpečnější postupovat s odborníkem, který zohlední zdravotní stav, léky a tempo změny. NutriPlan ti proto automatický plán nevygeneruje.',
    };
  }

  if (bmi > 0 && bmi < 18.5 && goal.kind === 'fat_loss') {
    return {
      allowed: true,
      level: 'warning',
      bmi,
      code: 'underweight_fat_loss',
      adjustedGoalKind: 'maintenance',
      title: `Hubnutí při podváze se nedoporučuje (BMI ${bmi.toFixed(1)})`,
      message: 'Cíl jsme přepnuli na udržení váhy. Pokud chceš měnit hmotnost, je rozumné to řešit s lékařem nebo nutričním terapeutem.',
    };
  }

  return { allowed: true, level: 'ok', bmi };
}

/**
 * Mifflin–St Jeor BMR.
 * @param {Pick<UserProfile,'sex'|'weightKg'|'heightCm'|'ageYears'>} p
 * @returns {number}
 */
export function calcBMR(p) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

/**
 * TDEE = BMR × activity factor.
 * @param {UserProfile} p
 * @returns {number}
 */
export function calcTDEE(p) {
  const factor = ACTIVITY_FACTORS[p.activityLevel] ?? ACTIVITY_FACTORS.light;
  return Math.round(calcBMR(p) * factor);
}

/**
 * Kalorický cíl podle [[NutritionGoal]]. Respektuje bezpečnostní limity.
 *
 * - fat_loss:        −18 % TDEE (mírný deficit), strop ne víc než 25 %
 * - maintenance:     TDEE
 * - muscle_gain:     +12 % TDEE
 * - endurance:       TDEE + 5 % (běžecké cíle drží jen mírný nadbytek)
 * - general_fitness: TDEE
 *
 * @param {UserProfile} profile
 * @param {NutritionGoal} goal
 * @returns {{ kcal:number, tdee:number, bmr:number, note?:string }}
 */
export function calcCalorieTarget(profile, goal) {
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(profile);

  let kcal = tdee;
  let note;

  switch (goal.kind) {
    case 'fat_loss': {
      const safeWeeklyKg = profile.weightKg * SAFETY.MAX_WEEKLY_LOSS_KG_PER_KG;
      const requestedWeekly = goal.weeklyRateKg ?? safeWeeklyKg * 0.7; // konzervativnější default
      const cappedWeekly = Math.min(Math.abs(requestedWeekly), safeWeeklyKg);
      // 1 kg tělesného tuku ≈ 7700 kcal
      const dailyDeficit = Math.round((cappedWeekly * 7700) / 7);
      kcal = Math.max(tdee - dailyDeficit, Math.round(tdee * (1 - SAFETY.MAX_DEFICIT_PCT)));
      if (cappedWeekly < Math.abs(requestedWeekly)) {
        note = 'Tempo hubnutí jsme omezili na bezpečné 1 % tělesné hmotnosti / týden.';
      }
      break;
    }
    case 'muscle_gain':
      kcal = Math.round(tdee * 1.12);
      break;
    case 'endurance':
      kcal = Math.round(tdee * 1.05);
      note = 'U vytrvalostních cílů držíme mírný nadbytek pro regeneraci.';
      break;
    case 'maintenance':
    case 'general_fitness':
    default:
      kcal = tdee;
  }

  // Tvrdé minimum
  const floor = profile.sex === 'male' ? SAFETY.MIN_KCAL_MALE : SAFETY.MIN_KCAL_FEMALE;
  if (kcal < floor) {
    kcal = floor;
    note = `Příjem dorovnán na minimum ${floor} kcal pro bezpečnou energetickou bilanci.`;
  }

  return { kcal, tdee, bmr, note };
}

/**
 * Bílkoviny podle cíle. Hodnoty vychází z konsenzuálních doporučení
 * sportovní výživy (ISSN 2017, Helms 2014):
 *
 *  fat_loss        2.2 g/kg  — vyšší kvůli zachování svalu při deficitu
 *  muscle_gain     2.0 g/kg
 *  maintenance     1.6 g/kg
 *  endurance       1.6 g/kg
 *  general_fitness 1.4 g/kg
 *
 * @param {UserProfile} p
 * @param {NutritionGoal} goal
 */
export function calcProteinTargetG(p, goal) {
  const perKg = {
    fat_loss: 2.2,
    muscle_gain: 2.0,
    maintenance: 1.6,
    endurance: 1.6,
    general_fitness: 1.4,
  }[goal.kind] ?? 1.6;
  return Math.round(p.weightKg * perKg);
}

/**
 * Tuky drží 25–30 % energie, minimum 0.6 g/kg pro hormonální zdraví.
 * @param {UserProfile} p
 * @param {number} kcal
 */
export function calcFatTargetG(p, kcal) {
  const fromEnergy = (kcal * 0.27) / 9;
  const minimum = p.weightKg * 0.6;
  return Math.round(Math.max(fromEnergy, minimum));
}

/**
 * Vláknina: ~14 g / 1000 kcal (DRI), zaokrouhleno.
 * @param {number} kcal
 */
export function calcFiberTargetG(kcal) {
  return Math.round((kcal / 1000) * 14);
}

/**
 * Voda: 35 ml/kg + bonus podle activity factoru.
 * @param {UserProfile} p
 */
export function calcWaterTargetMl(p) {
  const base = p.weightKg * 35;
  const factor = ACTIVITY_FACTORS[p.activityLevel] ?? 1.375;
  const bonus = factor >= 1.725 ? 1000 : factor >= 1.55 ? 500 : 0;
  return Math.round(base + bonus);
}

/**
 * Hlavní vstupní bod: spočítá kompletní [[MacroTargets]] pro daný profil
 * a cíl. Sacharidy se dopočítají jako zbytek energie.
 *
 * @param {UserProfile} profile
 * @param {NutritionGoal} goal
 * @returns {MacroTargets}
 */
export function calcMacroTargets(profile, goal) {
  const safety = assessProfileSafety(profile, goal);
  if (!safety.allowed) {
    throw new Error(safety.message || 'Nepovolený profil z bezpečnostních důvodů.');
  }

  const activeGoal = { ...goal };
  if (safety.adjustedGoalKind) {
    activeGoal.kind = safety.adjustedGoalKind;
  }

  const { kcal, tdee, bmr, note } = calcCalorieTarget(profile, activeGoal);
  const proteinG = calcProteinTargetG(profile, activeGoal);
  const fatG = calcFatTargetG(profile, kcal);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  const fiberG = calcFiberTargetG(kcal);
  const waterMl = calcWaterTargetMl(profile);
  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    waterMl,
    bmr,
    tdee,
    goal: activeGoal.kind === 'fat_loss' || activeGoal.kind === 'maintenance' || activeGoal.kind === 'muscle_gain' || activeGoal.kind === 'endurance' || activeGoal.kind === 'general_fitness'
      ? activeGoal.kind
      : 'maintenance',
    note: safety.message || note,
  };
}

// ── DAILY ADJUSTMENTS ────────────────────────────────────────────────────
//
// Cíl: aplikovat na pondělní baseline reálná data dne (jaký trénink, jak dlouho).
// Pravidla:
//  - Volný den:        ponech baseline, lehce sniž sacharidy o ~10 %, přesuň do tuků.
//  - Tréninkový den:   přidej 60 % aktivně spálených kcal do sacharidů.
//  - Long-run den:     navíc +1 g/kg sacharidů před dlouhým během (carb-load light).
//
// Tyto úpravy záměrně nepřepisují bílkoviny — ty zůstávají stabilní.

/**
 * @param {MacroTargets} baseline
 * @param {TrainingSession|undefined|null} session
 * @param {Pick<UserProfile,'weightKg'>} profile
 * @returns {MacroTargets}
 */
export function adjustForDay(baseline, session, profile) {
  if (!session || session.kind === 'rest') return restDay(baseline);
  if (session.kind === 'long_run') return longRunDay(baseline, session, profile);
  if (session.intensity === 'rest') return restDay(baseline);
  return trainingDay(baseline, session);
}

function restDay(baseline) {
  // Sniž sacharidy o 10 %, přesun energie do tuků (~3 g sacharidů ↔ 1.3 g tuku)
  const carbsG = Math.max(0, Math.round(baseline.carbsG * 0.9));
  const movedKcal = (baseline.carbsG - carbsG) * 4;
  const fatG = Math.round(baseline.fatG + movedKcal / 9);
  return { ...baseline, carbsG, fatG, note: 'Volný den — méně sacharidů, více tuků.' };
}

function trainingDay(baseline, session) {
  const burn = estimateSessionKcal(session);
  const addCarbsG = Math.round((burn * 0.6) / 4);
  const carbsG = baseline.carbsG + addCarbsG;
  const kcal = baseline.kcal + addCarbsG * 4;
  return {
    ...baseline,
    carbsG,
    kcal,
    note: `Tréninkový den (${session.kind}) — přidáno ${addCarbsG} g sacharidů.`,
  };
}

function longRunDay(baseline, session, profile) {
  const burn = estimateSessionKcal(session);
  const carbLoadG = Math.round(profile.weightKg * 1.0); // +1 g/kg pre-fuel
  const addCarbsG = Math.round((burn * 0.6) / 4) + carbLoadG;
  const carbsG = baseline.carbsG + addCarbsG;
  const kcal = baseline.kcal + addCarbsG * 4;
  return {
    ...baseline,
    carbsG,
    kcal,
    note: `Long run — pre-fuel +${carbLoadG} g a refuel +${Math.round((burn * 0.6) / 4)} g sacharidů.`,
  };
}

/**
 * Odhad kcal výdaje z TrainingSession. Pokud relace nese activeEnergyKcal,
 * použij ji; jinak odhadni z MET × min × kg (proxy 70 kg).
 */
function estimateSessionKcal(session) {
  // Provider mock dat ani plán nemusí mít kcal — fallback dle typu.
  const fallbackMet = {
    easy_run: 8, recovery_run: 6, tempo: 11, intervals: 12, long_run: 9,
    strength: 5, cross_training: 7, mobility: 3, rest: 0, race: 12,
  };
  const minutes = session.durationMinutes ?? 45;
  const met = fallbackMet[session.kind] ?? 6;
  // 1 MET ≈ 1 kcal / kg / hodina; bez váhy předpokládej 70 kg
  return Math.round((met * 70 * minutes) / 60);
}

// ── WEEKLY ADJUSTMENT ───────────────────────────────────────────────────
//
// Po týdnu se podíváme na trend váhy + adherenci a navrhneme úpravu baseline.

/**
 * @param {MacroTargets} previousBaseline
 * @param {NutritionGoal} goal
 * @param {WeeklyCheckIn[]} recentCheckIns  Posledních N (typicky 2–4) check-inů, chronologicky.
 * @returns {PlanAdjustment}
 */
export function planWeeklyAdjustment(previousBaseline, goal, recentCheckIns) {
  const warnings = [];
  if (!recentCheckIns?.length) {
    return { forWeekStartISO: '', kcalDelta: 0, weeklyKmDelta: 0, reason: 'Žádná data — držíme aktuální plán.', warnings };
  }

  const latest = recentCheckIns[recentCheckIns.length - 1];
  const oldest = recentCheckIns[0];
  const weeks = Math.max(1, recentCheckIns.length - 1);
  const weightDelta = (latest.weightKg ?? 0) - (oldest.weightKg ?? 0);
  const weeklyWeightKg = weightDelta / weeks;

  let kcalDelta = 0;
  let reason = 'Trend odpovídá cíli, žádná změna.';

  // Hubnutí: čekáme ~ −0.4 až −0.8 kg/týden
  if (goal.kind === 'fat_loss') {
    if (weeklyWeightKg > -0.1) {
      kcalDelta = -150;
      reason = 'Hubnutí stagnuje — snižujeme příjem o 150 kcal.';
    } else if (weeklyWeightKg < -1.0) {
      kcalDelta = +150;
      reason = 'Hubnutí je moc rychlé — zvyšujeme příjem o 150 kcal.';
      warnings.push('Pozor: tempo hubnutí přes 1 kg/týden není pro většinu lidí udržitelné.');
    }
  } else if (goal.kind === 'muscle_gain') {
    if (weeklyWeightKg < 0.1) {
      kcalDelta = +150;
      reason = 'Váha neroste — zvyšujeme příjem o 150 kcal.';
    } else if (weeklyWeightKg > 0.4) {
      kcalDelta = -100;
      reason = 'Příliš rychlé přibírání — mírná korekce dolů.';
    }
  }

  // Adherence pod 60 % = problém spíš s plánem než s čísly
  if (latest.adherence < 0.6) {
    warnings.push('Adherence pod 60 % — zvaž jednodušší recepty nebo méně jídel denně.');
  }
  if (latest.energyLevel != null && latest.energyLevel <= 2 && goal.kind === 'fat_loss') {
    warnings.push('Velmi nízká energie — pokud trvá, dočasně přejdi na maintenance.');
  }

  return {
    forWeekStartISO: '',
    kcalDelta,
    weeklyKmDelta: 0, // řeší training modul
    reason,
    warnings,
  };
}

// ── MACRO INTEGRITY CHECK ───────────────────────────────────────────────
//
// Slouží jako runtime guard nad AI-generovanými meal plany, aby čísla
// neodletěla mimo realitu.

/**
 * @param {{kcal:number,proteinG:number,carbsG:number,fatG:number}[]} meals
 * @param {MacroTargets} target
 * @param {{ kcalTolerancePct?:number, proteinTolerancePct?:number }} [opts]
 */
export function validateMealPlanMacros(meals, target, opts = {}) {
  const tolKcal = opts.kcalTolerancePct ?? 0.07;
  const tolP = opts.proteinTolerancePct ?? 0.10;
  const sum = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (m.kcal || 0),
      proteinG: acc.proteinG + (m.proteinG || 0),
      carbsG: acc.carbsG + (m.carbsG || 0),
      fatG: acc.fatG + (m.fatG || 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  const errors = [];
  if (Math.abs(sum.kcal - target.kcal) > target.kcal * tolKcal) {
    errors.push(`Součet kcal ${sum.kcal} mimo ±${Math.round(tolKcal * 100)} % cíle ${target.kcal}.`);
  }
  if (Math.abs(sum.proteinG - target.proteinG) > target.proteinG * tolP) {
    errors.push(`Bílkoviny ${sum.proteinG} g mimo ±${Math.round(tolP * 100)} % cíle ${target.proteinG} g.`);
  }
  meals.forEach((m, i) => {
    const expected = (m.proteinG || 0) * 4 + (m.carbsG || 0) * 4 + (m.fatG || 0) * 9;
    if (Math.abs(expected - (m.kcal || 0)) > 25) {
      errors.push(`Jídlo ${i + 1}: kcal ${m.kcal} neodpovídá makrům (${expected}).`);
    }
  });
  return { ok: errors.length === 0, errors, sum };
}

// ── PRIMARY GOAL → NUTRITION KIND ──────────────────────────────────────────

/**
 * Odvodí NutritionGoalKind z PrimaryGoal — uživatel nemusí vybírat zvlášť.
 * @param {import('./types.js').PrimaryGoal} primaryGoal
 * @returns {import('./types.js').NutritionGoalKind}
 */
export function primaryGoalToNutritionKind(primaryGoal) {
  switch (primaryGoal) {
    case 'lose_weight':        return 'fat_loss';
    case 'gain_muscle':        return 'muscle_gain';
    case 'run_race':
    case 'triathlon':
    case 'hyrox_ocr':          return 'endurance';
    default:                   return 'maintenance';
  }
}
