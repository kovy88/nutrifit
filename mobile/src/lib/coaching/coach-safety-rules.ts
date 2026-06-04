import type { UserProfile, NutritionGoalKind } from '../../types';
import type { Locale } from '../i18n';

function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

export function validateNutritionSafety(
  profile: Pick<UserProfile, 'gender' | 'weight' | 'height' | 'age' | 'activityFactor' | 'trainingGoal' | 'planIntensity'>,
  goalKind: NutritionGoalKind,
  kcal: number,
  protein: number,
  fat: number,
  locale: Locale = 'cs'
): string[] {
  const warnings: string[] = [];

  // Calculate BMR & TDEE internally for checking deficit size
  const baseBmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  const bmr = profile.gender === 'muz' ? baseBmr + 5 : baseBmr - 161;
  const tdee = Math.round(bmr * (profile.activityFactor ?? 1.375));

  // 1) Extreme deficit floor validation
  const floor = profile.gender === 'muz' ? 1500 : 1200;
  if (kcal < floor) {
    warnings.push(L(
      locale,
      `Příliš nízký příjem: Kalorie (${kcal} kcal) jsou pod bezpečným minimem (${floor} kcal).`,
      `Calorie target (${kcal} kcal) is below the safe minimum floor (${floor} kcal).`
    ));
  }

  // Deficit percentage limit
  if (goalKind === 'fat_loss') {
    const deficit = tdee - kcal;
    const maxAllowedDeficit = Math.round(tdee * 0.25);
    if (deficit > maxAllowedDeficit) {
      warnings.push(L(
        locale,
        `Příliš agresivní deficit: Plánovaný deficit (${deficit} kcal) přesahuje bezpečný limit 25 % TDEE (${maxAllowedDeficit} kcal).`,
        `Aggressive deficit: Target deficit (${deficit} kcal) exceeds the safe limit of 25% of TDEE (${maxAllowedDeficit} kcal).`
      ));
    }
  }

  // 2) Protein Floor validation (min 1.2g/kg base, or 1.4g/kg for athletic goals)
  const isAthletic = ['gain_muscle', 'improve_running', 'improve_fitness', 'half_marathon', 'marathon'].includes(profile.trainingGoal);
  const minProteinPerKg = isAthletic ? 1.4 : 1.2;
  const proteinFloor = Math.round(profile.weight * minProteinPerKg);
  if (protein < proteinFloor) {
    warnings.push(L(
      locale,
      `Nízký příjem bílkovin: Bílkoviny (${protein} g) jsou pod doporučeným minimem pro tvůj cíl (${proteinFloor} g).`,
      `Low protein: Target (${protein} g) is below the recommended floor of ${proteinFloor} g (${minProteinPerKg}g/kg).`
    ));
  }

  // 3) Fat Minimum validation (min 20% of calories or 0.6g/kg)
  const minFatGByWeight = Math.round(profile.weight * 0.6);
  const minFatGByKcal = Math.round((kcal * 0.20) / 9);
  const fatFloor = Math.min(minFatGByWeight, minFatGByKcal);
  if (fat < fatFloor) {
    warnings.push(L(
      locale,
      `Nízký příjem tuků: Tuky (${fat} g) by neměly klesnout pod bezpečnou mez (${fatFloor} g) pro hormonální zdraví.`,
      `Low fat: Target (${fat} g) is below the safe minimum floor of ${fatFloor} g for hormonal health.`
    ));
  }

  // 4) Fat loss + race training warning
  const isEnduranceRace = ['half_marathon', 'marathon'].includes(profile.trainingGoal);
  if (goalKind === 'fat_loss' && isEnduranceRace) {
    const deficit = tdee - kcal;
    const isAggressive = deficit > 350 || profile.planIntensity === 'ambitious_but_safe';
    if (isAggressive) {
      warnings.push(L(
        locale,
        'Kombinace intenzivního vytrvalostního tréninku a agresivního deficitu zvyšuje riziko zranění a únavy. Zvaž mírnější cíl hubnutí.',
        'Combining intensive endurance race training with an aggressive calorie deficit increases injury and fatigue risk. Consider a milder weight loss rate.'
      ));
    }
  }

  return warnings;
}
