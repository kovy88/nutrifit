// ── WEEKLY ADJUSTMENT
//
// Z posledních N týdenních check-inů odvodí, jak upravit denní kalorický
// cíl pro příští týden. Port z js/domain/nutrition.js:planWeeklyAdjustment
// s rozšířením o:
//   - automatický přepis cíle (fat_loss → maintenance) při dlouhodobé nízké
//     energii (3 týdny po sobě energyLevel ≤ 2)
//   - varování pro chronicky vysoký hlad (3 týdny hungerLevel ≥ 4)
//
// Vstup je řazený chronologicky (oldest first), aby výpočet weekly weight
// trendu byl stable: weights[last] - weights[first] / (length - 1).

import type { NutritionGoalKind } from '../../types';
import type { PlanAdjustment, WeeklyCheckIn } from '../../types/checkin';

export type WeeklyAdjustmentInput = {
  goalKind: NutritionGoalKind;
  /** Chronologicky seřazené check-iny (oldest first), typicky 2–4. */
  recentCheckIns: WeeklyCheckIn[];
  /** UI jazyk pro reason/warnings ('cs' | 'en'). Default 'cs'. */
  locale?: string;
};

export function planWeeklyAdjustment(input: WeeklyAdjustmentInput): PlanAdjustment {
  const { goalKind, recentCheckIns } = input;
  const en = (input.locale ?? 'en') === 'en';
  const L = (cs: string, enStr: string) => (en ? enStr : cs);
  const warnings: string[] = [];

  if (!recentCheckIns?.length) {
    return {
      kcalDelta: 0,
      reason: L('Zatím nemáme dost dat. Drž aktuální plán a dej nám pár týdnů.', 'Not enough data yet. Stick with your current plan and give us a few weeks.'),
      warnings,
    };
  }

  const latest = recentCheckIns[recentCheckIns.length - 1];
  const oldest = recentCheckIns[0];
  const weeksSpanned = Math.max(1, recentCheckIns.length - 1);

  // ── Weight trend (jen když máme alespoň 2 váhové vzorky) ─────────────────
  let weeklyWeightKg: number | null = null;
  if (latest.weightKg != null && oldest.weightKg != null && recentCheckIns.length >= 2) {
    weeklyWeightKg = (latest.weightKg - oldest.weightKg) / weeksSpanned;
  }

  let kcalDelta = 0;
  let reason = L('Trend odpovídá cíli, žádná změna.', 'Trend matches your goal — no change.');
  let adjustedGoalKind: NutritionGoalKind | undefined;

  // ── Goal-specific weight rules ────────────────────────────────────────────
  if (goalKind === 'fat_loss' && weeklyWeightKg != null) {
    if (weeklyWeightKg > -0.1) {
      kcalDelta = -150;
      reason = L('Hubnutí stagnuje — snižujeme příjem o 150 kcal.', 'Weight loss has stalled — lowering intake by 150 kcal.');
    } else if (weeklyWeightKg < -1.0) {
      kcalDelta = 150;
      reason = L('Hubnutí je moc rychlé — zvyšujeme příjem o 150 kcal.', 'Weight loss is too fast — raising intake by 150 kcal.');
      warnings.push(L('Pozor: tempo hubnutí přes 1 kg/týden není pro většinu lidí dlouhodobě udržitelné.', 'Heads up: losing over 1 kg/week is not sustainable long-term for most people.'));
    } else if (weeklyWeightKg < -0.8) {
      warnings.push(L('Tempo hubnutí je na horní hranici — sleduj energii a kvalitu spánku.', 'Your weight-loss pace is at the upper limit — watch your energy and sleep quality.'));
    }
  } else if (goalKind === 'muscle_gain' && weeklyWeightKg != null) {
    if (weeklyWeightKg < 0.1) {
      kcalDelta = 150;
      reason = L('Váha neroste — zvyšujeme příjem o 150 kcal.', 'Weight is not increasing — raising intake by 150 kcal.');
    } else if (weeklyWeightKg > 0.4) {
      kcalDelta = -100;
      reason = L('Příliš rychlé přibírání — mírná korekce dolů.', 'Gaining too fast — small correction down.');
    }
  } else if (goalKind === 'endurance' && weeklyWeightKg != null) {
    // Endurance: chceme stabilní váhu nebo mírný pokles; varuj při výrazném růstu
    if (weeklyWeightKg > 0.3) {
      kcalDelta = -100;
      reason = L('Váha mírně roste i přes vytrvalostní cíl — drobná korekce dolů.', 'Weight is creeping up despite an endurance goal — small correction down.');
    }
  }

  // ── Subjektivní signály ──────────────────────────────────────────────────
  if (latest.adherence < 0.6) {
    warnings.push(L('Adherence pod 60 % — zvaž jednodušší recepty nebo méně jídel denně.', 'Adherence below 60% — consider simpler recipes or fewer meals per day.'));
  }

  const plannedSessions = latest.plannedSessions ?? 0;
  const trainingCompletionRatio =
    plannedSessions > 0 && latest.completedSessions != null
      ? latest.completedSessions / plannedSessions
      : null;

  if (trainingCompletionRatio != null) {
    if (trainingCompletionRatio < 0.5 && plannedSessions >= 2) {
      warnings.push(L(
        'Dokončil/a jsi méně než polovinu tréninků — příští týden raději drž plán jednodušší místo přidávání objemu.',
        'You completed less than half your sessions — next week keep the plan simple instead of adding volume.',
      ));
    } else if (trainingCompletionRatio < 0.75 && plannedSessions >= 3) {
      warnings.push(L(
        'Několik tréninků zůstalo nedokončených — před navýšením objemu nejdřív stabilizuj pravidelnost.',
        'A few sessions went unfinished — stabilize consistency before increasing volume.',
      ));
    }
  }

  // 3× po sobě nízká energie u fat_loss → automatický přepis na maintenance
  const lowEnergyStreak = countTrailing(recentCheckIns, c => (c.energyLevel ?? 5) <= 2);
  if (goalKind === 'fat_loss' && lowEnergyStreak >= 3) {
    adjustedGoalKind = 'maintenance';
    reason = L('Tři týdny po sobě nízká energie při hubnutí — přepínáme dočasně na udržení váhy.', 'Three weeks of low energy while cutting — switching temporarily to maintenance.');
    warnings.push(L('Pokud se energie nezlepší, doporučujeme konzultaci s odborníkem.', 'If your energy does not improve, we recommend consulting a professional.'));
    kcalDelta = 0; // override goal handles it
  } else if (latest.energyLevel != null && latest.energyLevel <= 2 && goalKind === 'fat_loss') {
    warnings.push(L('Velmi nízká energie — pokud trvá, dočasně přejdi na maintenance.', 'Very low energy — if it persists, switch to maintenance for a while.'));
  }

  // Chronický hlad u fat_loss → varování (ale ne automatická akce, řeší se kvalitou jídla)
  const highHungerStreak = countTrailing(recentCheckIns, c => (c.hungerLevel ?? 1) >= 4);
  if (goalKind === 'fat_loss' && highHungerStreak >= 3) {
    warnings.push(L('Tři týdny vysoký hlad — zkus přidat bílkoviny a vlákninu nebo přerozdělit jídla.', 'Three weeks of high hunger — try adding protein and fiber or redistributing your meals.'));
  }

  return {
    kcalDelta,
    reason,
    warnings,
    ...(adjustedGoalKind ? { adjustedGoalKind } : {}),
  };
}

/** Spočítá kolik posledních záznamů (trailing) splňuje predikát. */
function countTrailing<T>(arr: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) count++;
    else break;
  }
  return count;
}
