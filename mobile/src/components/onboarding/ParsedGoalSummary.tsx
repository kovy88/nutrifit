import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatGoalProfileSummary } from '../../lib/onboarding/goal-summary-labels';
import type { GoalProfile } from '../../types/goal-types';
import type { Translate } from '../../lib/i18n';

export function ParsedGoalSummary({ goalProfile, t }: { goalProfile: GoalProfile | null | undefined; t: Translate }) {
  const { colors, fonts } = useTheme();
  if (!goalProfile) return null;
  const summary = formatGoalProfileSummary(goalProfile, t);
  return (
    <View style={[styles.box, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
      <Text style={[styles.text, { color: colors.ink, fontFamily: fonts.extraBold }]}>{t('onb.goalParsedSummary', { summary })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, gap: 4 },
  text: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
