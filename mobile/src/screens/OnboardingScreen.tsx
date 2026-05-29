import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import type { DietStyle, ExperienceLevel, Gender, PrimaryGoal, TrainingGoalKind, UserProfile } from '../types';
import { DEFAULT_PROFILE, validateProfile, activityFactorForSessions } from '../utils/nutrition';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft } from '../services/storage';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../lib/i18n';

export function OnboardingScreen() {
  const { setProfile } = useNutriFit();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(() => ({
    ...DEFAULT_PROFILE,
    age: 0,
    height: 0,
    weight: 0,
  }));
  // Hydrate from a stored draft on mount (covers app kill mid-onboarding).
  // If a draft exists AND is < 24 h old, we resume; older drafts are discarded
  // so we don't pre-fill stale numbers if the user comes back next week.
  const hydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOnboardingDraft();
      if (!stored || cancelled) {
        hydrated.current = true;
        return;
      }
      const ageMs = Date.now() - new Date(stored.updatedAt).getTime();
      if (ageMs > 24 * 3600 * 1000) {
        await clearOnboardingDraft();
        hydrated.current = true;
        return;
      }
      setDraft(stored.draft);
      setStep(Math.min(3, Math.max(0, stored.step)));
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on every change AFTER hydration completes (otherwise initial empty
  // state would overwrite the stored draft before we get a chance to read it).
  useEffect(() => {
    if (!hydrated.current) return;
    void saveOnboardingDraft({ step, draft, updatedAt: new Date().toISOString() });
  }, [step, draft]);

  const progress = useMemo(() => `${step + 1}/4`, [step]);

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function finish() {
    const errors = validateProfile(draft);
    if (errors.length) {
      Alert.alert(t('onb.validationTitle'), errors.join('\n'));
      return;
    }
    await setProfile(draft);
    // Profile is now saved — clear the draft so a future "Spustit onboarding
    // znovu" start cleanly.
    await clearOnboardingDraft();
  }

  return (
    <Screen>
      {/* Progress Bar Visual Indicator */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{progress}</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>
      </View>

      <H1>{t('onb.title')}</H1>
      <Subtitle>{t('onb.subtitle')}</Subtitle>

      {step === 0 && (
        <Card>
          <Label>{t('profile.mainGoal')}</Label>
          <View style={styles.column}>
            {primaryGoals.map(item => (
              <Pill
                key={item.value}
                active={draft.primaryGoal === item.value}
                onPress={() => setDraft(current => ({ ...current, primaryGoal: item.value, trainingGoal: item.trainingGoal }))}
              >
                {t(item.labelKey)}
              </Pill>
            ))}
          </View>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Label>{t('onb.bodyMetrics')}</Label>
          <View style={styles.row}>
            {(['muz', 'zena'] as Gender[]).map(g => (
              <Pill key={g} active={draft.gender === g} onPress={() => setField('gender', g)}>{g === 'muz' ? t('onb.male') : t('onb.female')}</Pill>
            ))}
          </View>
          <View style={styles.grid}>
            <Field keyboardType="number-pad" value={draft.age === 0 ? '' : String(draft.age)} onChangeText={v => setField('age', Number(v) || 0)} placeholder={t('onb.agePlaceholder')} />
            <Field keyboardType="number-pad" value={draft.height === 0 ? '' : String(draft.height)} onChangeText={v => setField('height', Number(v) || 0)} placeholder={t('onb.heightPlaceholder')} />
            <Field keyboardType="number-pad" value={draft.weight === 0 ? '' : String(draft.weight)} onChangeText={v => setField('weight', Number(v) || 0)} placeholder={t('onb.weightPlaceholder')} />
          </View>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Label>{t('onb.trainingActivity')}</Label>
          <View style={styles.rowWrap}>
            {trainingGoalsFor(draft.primaryGoal).map(goal => (
              <Pill key={goal.value} active={draft.trainingGoal === goal.value} onPress={() => setField('trainingGoal', goal.value)}>{t(goal.labelKey)}</Pill>
            ))}
          </View>
          <Label>{t('onb.sessionsQuestion')}</Label>
          <View style={styles.rowWrap}>
            {[1, 2, 3, 4, 5, 6].map(count => (
              <Pill key={count} active={draft.sessionsPerWeek === count} onPress={() => setDraft(current => ({ ...current, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) }))}>{count}×</Pill>
            ))}
          </View>
          <Label>{t('onb.experienceQuestion')}</Label>
          <View style={styles.rowWrap}>
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(exp => (
              <Pill key={exp} active={draft.experience === exp} onPress={() => setField('experience', exp)}>{t(experienceLabelKey(exp))}</Pill>
            ))}
          </View>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <Label>{t('onb.dietPrefs')}</Label>
          <Field value={draft.likes} onChangeText={v => setField('likes', v)} placeholder={t('onb.likesPlaceholder')} multiline />
          <Field value={draft.dislikes} onChangeText={v => setField('dislikes', v)} placeholder={t('onb.dislikesPlaceholder')} multiline />
          <View style={styles.rowWrap}>
            {(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'] as DietStyle[]).map(diet => (
              <Pill key={diet} active={draft.diet === diet} onPress={() => setField('diet', diet)}>{t(`diet.${diet}` as TranslationKey)}</Pill>
            ))}
          </View>
          <View style={styles.explainBox}>
            <Text style={styles.explainText}>
              {t('onb.explain')}
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        {step > 0 && <Button variant="secondary" onPress={() => setStep(s => s - 1)}>{t('common.back')}</Button>}
        <Button onPress={step === 3 ? finish : () => setStep(s => s + 1)}>{step === 3 ? t('onb.finish') : t('common.continue')}</Button>
      </View>
      <Text style={styles.disclaimer}>{t('onb.disclaimer')}</Text>
    </Screen>
  );
}

const primaryGoals: Array<{ value: PrimaryGoal; labelKey: TranslationKey; trainingGoal: TrainingGoalKind }> = [
  { value: 'lose_weight', labelKey: 'onb.goalLoseWeight', trainingGoal: 'general_fitness' },
  { value: 'maintain_weight', labelKey: 'onb.goalMaintainWeight', trainingGoal: 'general_fitness' },
  { value: 'gain_muscle', labelKey: 'onb.goalGainMuscle', trainingGoal: 'strength_basics' },
  { value: 'run_race', labelKey: 'onb.goalRunRace', trainingGoal: 'run_10k' },
];

function trainingGoalsFor(primaryGoal: PrimaryGoal): Array<{ value: TrainingGoalKind; labelKey: TranslationKey }> {
  if (primaryGoal === 'run_race') return [
    { value: 'run_5k', labelKey: 'onb.tgRun5k' },
    { value: 'run_10k', labelKey: 'onb.tgRun10k' },
    { value: 'half_marathon', labelKey: 'onb.tgHalf' },
    { value: 'marathon', labelKey: 'onb.tgMarathon' },
  ];
  if (primaryGoal === 'gain_muscle') return [
    { value: 'strength_basics', labelKey: 'onb.tgStrengthBasics' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitnessAlt' },
  ];
  return [
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitness' },
    { value: 'sports_conditioning', labelKey: 'onb.tgSportsConditioning' },
  ];
}

function experienceLabelKey(value: ExperienceLevel): TranslationKey {
  return ({ beginner: 'onb.expBeginner', intermediate: 'onb.expIntermediate', advanced: 'onb.expAdvanced' } as const)[value];
}

const styles = StyleSheet.create({
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  progressText: { color: colors.green, fontWeight: '800', fontSize: 14 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.green, borderRadius: 3 },
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  column: { gap: 10 },
  grid: { gap: 10 },
  actions: { gap: 10 },
  disclaimer: { color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 12 },
  explainBox: { marginTop: 12, padding: 12, backgroundColor: '#f4fbf7', borderRadius: 12, borderWidth: 1, borderColor: '#dcf2e6' },
  explainText: { color: colors.green, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
