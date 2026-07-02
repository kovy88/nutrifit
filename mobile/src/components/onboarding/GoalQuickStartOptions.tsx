import { StyleSheet, View } from 'react-native';
import { GOAL_QUICK_STARTS, goalQuickStartText } from '../../lib/onboarding/goal-parser';
import type { GoalQuickStart } from '../../types/goal-types';
import type { Locale, TranslationKey } from '../../lib/i18n';
import { GoalChip } from './GoalChip';

export function GoalQuickStartOptions({
  activeText,
  locale,
  onSelect,
  t,
}: {
  activeText?: string;
  locale: Locale;
  onSelect: (quickStart: GoalQuickStart) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <View style={styles.wrap}>
      {GOAL_QUICK_STARTS.map(item => {
        const text = goalQuickStartText(item, locale);
        return (
          <GoalChip key={`${item.id}-${item.text}`} active={activeText === text} onPress={() => onSelect(item)}>
            {t(item.labelKey as TranslationKey)}
          </GoalChip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
