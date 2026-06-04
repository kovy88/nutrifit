import { StyleSheet, View } from 'react-native';
import { GOAL_QUICK_STARTS } from '../../lib/onboarding/goal-parser';
import type { PrimaryGoal } from '../../types/goal-types';
import type { TranslationKey } from '../../lib/i18n';
import { GoalChip } from './GoalChip';

export function GoalQuickStartOptions({
  activeGoal,
  onSelect,
  t,
}: {
  activeGoal?: PrimaryGoal;
  onSelect: (goal: PrimaryGoal) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <View style={styles.wrap}>
      {GOAL_QUICK_STARTS.map(item => (
        <GoalChip key={item.id} active={activeGoal === item.id} onPress={() => onSelect(item.id)}>
          {t(item.labelKey as TranslationKey)}
        </GoalChip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
