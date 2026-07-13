import { StyleSheet, View } from 'react-native';
import { quickStartsForScope, goalQuickStartText } from '../../lib/onboarding/goal-parser';
import type { GoalQuickStart } from '../../types/goal-types';
import type { CoachScope } from '../../types';
import type { Locale, TranslationKey } from '../../lib/i18n';
import { GoalChip } from './GoalChip';

export function GoalQuickStartOptions({
  activeText,
  scope,
  locale,
  onSelect,
  t,
}: {
  activeText?: string;
  scope: CoachScope;
  locale: Locale;
  onSelect: (quickStart: GoalQuickStart) => void;
  t: (key: TranslationKey) => string;
}) {
  const options = visibleQuickStartsForScope(scope);
  return (
    <View style={styles.wrap}>
      {options.map(item => {
        const text = goalQuickStartText(item, locale);
        return (
          <GoalChip
            key={`${item.id}-${item.text}`}
            active={activeText === text}
            onPress={() => onSelect(item)}
          >
            {t(item.labelKey as TranslationKey)}
          </GoalChip>
        );
      })}
    </View>
  );
}

const BOTH_SCOPE_MVP_LABELS = new Set<TranslationKey>([
  'onb.quickLoseFat',
  'onb.quickImproveFitness',
  'onb.quickRun5k',
  'onb.quickEatHealthier',
]);

function visibleQuickStartsForScope(scope: CoachScope): GoalQuickStart[] {
  const options = quickStartsForScope(scope);
  if (scope !== 'both') return options;
  return options.filter(item => BOTH_SCOPE_MVP_LABELS.has(item.labelKey as TranslationKey));
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
