import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { GoalProfile } from '../../types/goal-types';
import type { TranslationKey } from '../../lib/i18n';

export function ParsedGoalSummary({ goalProfile, t }: { goalProfile: GoalProfile | null | undefined; t: (key: TranslationKey, params?: Record<string, string | number>) => string }) {
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
      <Text style={[styles.text, { color: colors.ink, fontFamily: fonts.extraBold }]}>{t('onb.goalParsedSummary', { summary: goalProfile.summary })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 4 },
  eyebrow: { fontSize: 11, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.4 },
  text: { fontSize: 14, lineHeight: 20 },
});
