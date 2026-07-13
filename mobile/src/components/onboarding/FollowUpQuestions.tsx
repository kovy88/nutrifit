import { StyleSheet, Text, View } from 'react-native';
import { Field, Pill } from '../UI';
import { useTheme } from '../../context/ThemeContext';
import type { FollowUpQuestion, GoalProfile } from '../../types/goal-types';
import type { TranslationKey } from '../../lib/i18n';

export function FollowUpQuestions({
  questions,
  goalProfile,
  onChange,
  t,
}: {
  questions: FollowUpQuestion[];
  goalProfile: GoalProfile;
  onChange: (patch: Partial<GoalProfile>) => void;
  t: (key: TranslationKey) => string;
}) {
  const { colors, fonts } = useTheme();
  if (!questions.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink, fontFamily: fonts.extraBold }]}>{t('onb.followTitle')}</Text>
      {questions.map(question => (
        <View key={question.id} style={styles.question}>
          <Text style={[styles.prompt, { color: colors.muted, fontFamily: fonts.bold }]}>{t(question.promptKey as TranslationKey)}</Text>
          {question.kind === 'single_choice' ? (
            <View style={styles.options}>
              {question.options.map(option => (
                <Pill
                  key={String(option.value)}
                  active={goalProfile[question.id] === option.value}
                  onPress={() => onChange({ [question.id]: option.value } as Partial<GoalProfile>)}
                >
                  {t(option.labelKey as TranslationKey)}
                </Pill>
              ))}
            </View>
          ) : (
            <Field
              keyboardType={question.kind === 'number' ? 'number-pad' : 'default'}
              value={valueFor(goalProfile, question.id)}
              placeholder={t(question.placeholderKey as TranslationKey)}
              onChangeText={value => {
                const nextValue = question.kind === 'number' ? positiveNumber(value) : value;
                onChange({ [question.id]: nextValue } as Partial<GoalProfile>);
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function valueFor(goalProfile: GoalProfile, id: FollowUpQuestion['id']): string {
  const value = goalProfile[id as keyof GoalProfile];
  return typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
}

function positiveNumber(value: string): number | undefined {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { fontSize: 15, lineHeight: 19 },
  question: { gap: 8 },
  prompt: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
