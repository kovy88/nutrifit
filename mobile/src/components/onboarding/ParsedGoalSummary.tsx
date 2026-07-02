import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { GoalProfile, PrimaryGoal, RaceGoal } from '../../types/goal-types';
import type { TranslationKey } from '../../lib/i18n';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function ParsedGoalSummary({ goalProfile, t }: { goalProfile: GoalProfile | null | undefined; t: Translate }) {
  const { colors, fonts } = useTheme();
  if (!goalProfile) {
    return (
      <View style={[styles.box, { borderColor: colors.hairline, backgroundColor: colors.bgElev }]}>
        <Text style={[styles.text, { color: colors.muted, fontFamily: fonts.bold }]}>{t('onb.goalWaiting')}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
      <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: fonts.bold }]}>{t('onb.goalParsedEyebrow')}</Text>
      <Text style={[styles.text, { color: colors.ink, fontFamily: fonts.extraBold }]}>{t('onb.goalParsedSummary', { summary: goalSummaryText(goalProfile, t) })}</Text>
    </View>
  );
}

/** Localized equivalent of the (English-only) `goalProfile.summary` field — composed from the stable primaryGoal/raceGoal enums instead. */
function goalSummaryText(goalProfile: GoalProfile, t: Translate): string {
  const parts: string[] = [];
  const goalKey = goalPartKey(goalProfile.primaryGoal);
  if (goalKey) parts.push(t(goalKey));

  if (goalProfile.raceGoal !== 'none') {
    parts.push(t('goalSummary.racePrep', { race: t(raceLabelKey(goalProfile.raceGoal)) }));
  } else if (goalProfile.primaryGoal === 'run_race') {
    parts.push(t('goalSummary.racePrepGeneric'));
  }
  return parts.join(' + ');
}

function goalPartKey(primaryGoal: PrimaryGoal): TranslationKey | null {
  switch (primaryGoal) {
    case 'lose_fat': return 'goalSummary.loseFat';
    case 'build_muscle': return 'goalSummary.buildMuscle';
    case 'eat_healthier': return 'goalSummary.eatHealthier';
    case 'recover_better': return 'goalSummary.recoverBetter';
    case 'build_consistency': return 'goalSummary.buildConsistency';
    case 'improve_fitness': return 'goalSummary.improveFitness';
    case 'run_race': return null;
  }
}

function raceLabelKey(raceGoal: Exclude<RaceGoal, 'none'>): TranslationKey {
  switch (raceGoal) {
    case 'run_5k': return 'goalSummary.race5k';
    case 'run_10k': return 'goalSummary.race10k';
    case 'half_marathon': return 'goalSummary.raceHalfMarathon';
    case 'marathon': return 'goalSummary.raceMarathon';
  }
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 4 },
  eyebrow: { fontSize: 11, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.4 },
  text: { fontSize: 14, lineHeight: 20 },
});
