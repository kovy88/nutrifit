import { StyleSheet, Text, View } from 'react-native';
import type { TranslationKey } from '../../lib/i18n';
import { generateGoalFollowUps } from '../../lib/onboarding/follow-up-question-generator';
import { parseGoalText, updateGoalProfile } from '../../lib/onboarding/goal-parser';
import type { GoalProfile, GoalQuickStart } from '../../types/goal-types';
import type { CoachScope } from '../../types';
import type { Locale } from '../../lib/i18n';
import { useTheme } from '../../context/ThemeContext';
import { FollowUpQuestions } from './FollowUpQuestions';
import { GoalQuickStartOptions } from './GoalQuickStartOptions';
import { GoalTextInput } from './GoalTextInput';
import { ParsedGoalSummary } from './ParsedGoalSummary';

export function GoalInputStep({
  value,
  goalProfile,
  scope,
  locale,
  onTextChange,
  onGoalProfileChange,
  t,
}: {
  value: string;
  goalProfile: GoalProfile | null | undefined;
  scope: CoachScope;
  locale: Locale;
  onTextChange: (value: string) => void;
  onGoalProfileChange: (goalProfile: GoalProfile | null) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { colors, fonts } = useTheme();
  const followUps = generateGoalFollowUps(goalProfile ?? null);

  function handleTextChange(text: string) {
    onTextChange(text);
    const parsed = parseGoalText(text);
    onGoalProfileChange(parsed.goalProfile);
  }

  function handleQuickStart(quickStart: GoalQuickStart) {
    const parsed = parseGoalText(quickStart.text);
    onTextChange(quickStart.text);
    onGoalProfileChange(parsed.goalProfile);
  }

  function handleFollowUp(patch: Partial<GoalProfile>) {
    if (!goalProfile) return;
    onGoalProfileChange(updateGoalProfile(goalProfile, patch));
  }

  return (
    <View style={styles.wrap}>
      <GoalQuickStartOptions activeText={goalProfile?.rawText} scope={scope} onSelect={handleQuickStart} t={t} />
      <View style={styles.customGoal}>
        <Text style={[styles.customLabel, { color: colors.faint, fontFamily: fonts.bold }]}>{customGoalLabel(locale)}</Text>
        <GoalTextInput value={value} onChangeText={handleTextChange} placeholder={t('onb.goalInputPlaceholder')} />
      </View>
      <ParsedGoalSummary goalProfile={goalProfile} t={t} />
      {goalProfile ? <FollowUpQuestions questions={followUps} goalProfile={goalProfile} onChange={handleFollowUp} t={t} /> : null}
    </View>
  );
}

function customGoalLabel(locale: Locale): string {
  return locale === 'en' ? 'Or one sentence' : 'Nebo jednou větou';
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  customGoal: { gap: 7 },
  customLabel: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
});
