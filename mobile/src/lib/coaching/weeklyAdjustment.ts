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
};

export function planWeeklyAdjustment(input: WeeklyAdjustmentInput): PlanAdjustment {
  const { goalKind, recentCheckIns } = input;
  const warnings: string[] = [];

  if (!recentCheckIns?.length) {
    return {
      kcalDelta: 0,
      reason: 'Zatím nemáme dost dat. Drž aktuální plán a dej nám pár týdnů.',
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
  let reason = 'Trend odpovídá cíli, žádná změna.';
  let adjustedGoalKind: NutritionGoalKind | undefined;

  // ── Goal-specific weight rules ────────────────────────────────────────────
  if (goalKind === 'fat_loss' && weeklyWeightKg != null) {
    if (weeklyWeightKg > -0.1) {
      kcalDelta = -150;
      reason = 'Hubnutí stagnuje — snižujeme příjem o 150 kcal.';
    } else if (weeklyWeightKg < -1.0) {
      kcalDelta = 150;
      reason = 'Hubnutí je moc rychlé — zvyšujeme příjem o 150 kcal.';
      warnings.push('Pozor: tempo hubnutí přes 1 kg/týden není pro většinu lidí dlouhodobě udržitelné.');
    } else if (weeklyWeightKg < -0.8) {
      warnings.push('Tempo hubnutí je na horní hranici — sleduj energii a kvalitu spánku.');
    }
  } else if (goalKind === 'muscle_gain' && weeklyWeightKg != null) {
    if (weeklyWeightKg < 0.1) {
      kcalDelta = 150;
      reason = 'Váha neroste — zvyšujeme příjem o 150 kcal.';
    } else if (weeklyWeightKg > 0.4) {
      kcalDelta = -100;
      reason = 'Příliš rychlé přibírání — mírná korekce dolů.';
    }
  } else if (goalKind === 'endurance' && weeklyWeightKg != null) {
    // Endurance: chceme stabilní váhu nebo mírný pokles; varuj při výrazném růstu
    if (weeklyWeightKg > 0.3) {
      kcalDelta = -100;
      reason = 'Váha mírně roste i přes vytrvalostní cíl — drobná korekce dolů.';
    }
  }

  // ── Subjektivní signály ──────────────────────────────────────────────────
  if (latest.adherence < 0.6) {
    warnings.push('Adherence pod 60 % — zvaž jednodušší recepty nebo méně jídel denně.');
  }

  const plannedSessions = latest.plannedSessions ?? 0;
  const trainingCompletionRatio =
    plannedSessions > 0 && latest.completedSessions != null
      ? latest.completedSessions / plannedSessions
      : null;

  if (trainingCompletionRatio != null) {
    if (trainingCompletionRatio < 0.5 && plannedSessions >= 2) {
      warnings.push(
        'Dokončil/a jsi méně než polovinu tréninků — příští týden raději drž plán jednodušší místo přidávání objemu.',
      );
    } else if (trainingCompletionRatio < 0.75 && plannedSessions >= 3) {
      warnings.push(
        'Několik tréninků zůstalo nedokončených — před navýšením objemu nejdřív stabilizuj pravidelnost.',
      );
    }
  }

  // 3× po sobě nízká energie u fat_loss → automatický přepis na maintenance
  const lowEnergyStreak = countTrailing(recentCheckIns, c => (c.energyLevel ?? 5) <= 2);
  if (goalKind === 'fat_loss' && lowEnergyStreak >= 3) {
    adjustedGoalKind = 'maintenance';
    reason = 'Tři týdny po sobě nízká energie při hubnutí — přepínáme dočasně na udržení váhy.';
    warnings.push('Pokud se energie nezlepší, doporučujeme konzultaci s odborníkem.');
    kcalDelta = 0; // override goal handles it
  } else if (latest.energyLevel != null && latest.energyLevel <= 2 && goalKind === 'fat_loss') {
    warnings.push('Velmi nízká energie — pokud trvá, dočasně přejdi na maintenance.');
  }

  // Chronický hlad u fat_loss → varování (ale ne automatická akce, řeší se kvalitou jídla)
  const highHungerStreak = countTrailing(recentCheckIns, c => (c.hungerLevel ?? 1) >= 4);
  if (goalKind === 'fat_loss' && highHungerStreak >= 3) {
    warnings.push('Tři týdny vysoký hlad — zkus přidat bílkoviny a vlákninu nebo přerozdělit jídla.');
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
