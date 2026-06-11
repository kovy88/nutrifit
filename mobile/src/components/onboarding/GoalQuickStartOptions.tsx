import { StyleSheet, View } from 'react-native';
import { quickStartsForScope } from '../../lib/onboarding/goal-parser';
import type { GoalQuickStart } from '../../types/goal-types';
import type { CoachScope } from '../../types';
import type { TranslationKey } from '../../lib/i18n';
import { GoalChip } from './GoalChip';

export function GoalQuickStartOptions({
  activeText,
  scope,
  onSelect,
  t,
}: {
  activeText?: string;
  scope: CoachScope;
  onSelect: (quickStart: GoalQuickStart) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <View style={styles.wrap}>
      {quickStartsForScope(scope).map(item => (
        <GoalChip
          key={`${item.id}-${item.text}`}
          active={activeText === item.text}
          subtitle={t(item.subtitleKey as TranslationKey)}
          onPress={() => onSelect(item)}
        >
          {t(item.labelKey as TranslationKey)}
        </GoalChip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
