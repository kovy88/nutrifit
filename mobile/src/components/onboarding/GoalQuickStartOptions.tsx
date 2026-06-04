import { StyleSheet, View } from 'react-native';
import { GOAL_QUICK_STARTS } from '../../lib/onboarding/goal-parser';
import type { GoalQuickStart } from '../../types/goal-types';
import type { TranslationKey } from '../../lib/i18n';
import { GoalChip } from './GoalChip';

export function GoalQuickStartOptions({
  activeText,
  onSelect,
  t,
}: {
  activeText?: string;
  onSelect: (quickStart: GoalQuickStart) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <View style={styles.wrap}>
      {GOAL_QUICK_STARTS.map(item => (
        <GoalChip key={`${item.id}-${item.text}`} active={activeText === item.text} onPress={() => onSelect(item)}>
          {t(item.labelKey as TranslationKey)}
        </GoalChip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
