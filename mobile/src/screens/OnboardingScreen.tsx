import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Choice, Field, H1, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import type {
  CoachScope, DietStyle, ExperienceLevel, Gender, NutritionMode, PlanIntensity, PrimaryGoal, TrainingGoalKind, UserProfile,
} from '../types';
import { resolveCoachScope, scopeHasNutrition } from '../types';
import { DEFAULT_PROFILE, validateProfile, activityFactorForSessions } from '../utils/nutrition';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft } from '../services/storage';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../lib/i18n';
import { validateRaceGoalFeasibility } from '../lib/training/feasibility';

type StepId =
  | 'focus' | 'goal' | 'trainingGoal' | 'nutritionGoal'
  | 'sessions' | 'experience' | 'weeklyKm' | 'runningHistory' | 'raceDetails' | 'raceFeasibility'
  | 'body' | 'nutritionMode' | 'planIntensity' | 'diet';

/** The ordered question list for a given focus. One id = one screen. */
function buildSteps(scope: CoachScope, trainingGoal: TrainingGoalKind): StepId[] {
  if (scope === 'nutrition') {
    return ['focus', 'nutritionGoal', 'body', 'nutritionMode', 'planIntensity', 'diet'];
  }
  const running = isRunningGoal(trainingGoal);
  const race = isRunRaceGoal(trainingGoal);
  const training: StepId[] = [
    'focus',
    'goal',
    'trainingGoal',
    'sessions',
    'experience',
    ...(running ? ['runningHistory' as StepId] : []),
    ...(race ? ['raceDetails' as StepId, 'raceFeasibility' as StepId] : []),
  ];
  if (scope === 'training') return training;
  return [...training, 'body', 'nutritionMode', 'planIntensity', 'diet'];
}

export function OnboardingScreen() {
  const { setProfile } = useTrenr();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(() => ({ ...DEFAULT_PROFILE, age: 0, height: 0, weight: 0 }));

  // Resume a < 24h draft if the app was killed mid-onboarding.
  const hydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOnboardingDraft();
      if (!stored || cancelled) { hydrated.current = true; return; }
      const ageMs = Date.now() - new Date(stored.updatedAt).getTime();
      if (ageMs > 24 * 3600 * 1000) { await clearOnboardingDraft(); hydrated.current = true; return; }
      setDraft(stored.draft);
      setStepIndex(Math.max(0, stored.step));
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveOnboardingDraft({ step: stepIndex, draft, updatedAt: new Date().toISOString() });
  }, [stepIndex, draft]);

  const scope = resolveCoachScope(draft);
  const steps = useMemo(() => buildSteps(scope, draft.trainingGoal), [scope, draft.trainingGoal]);
  const total = steps.length;
  const idx = Math.min(stepIndex, total - 1);
  const step = steps[idx];
  const isLast = idx === total - 1;
  const feasibility = useMemo(() => (
    isRunRaceGoal(draft.trainingGoal)
      ? validateRaceGoalFeasibility({ trainingGoal: draft.trainingGoal, profile: draft })
      : null
  ), [draft]);

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function finish() {
    let final: UserProfile = { ...draft };
    // Training-only: backfill safe body defaults so downstream calcs never see 0s.
    if (!scopeHasNutrition(resolveCoachScope(final))) {
      if (!final.age) final.age = DEFAULT_PROFILE.age;
      if (!final.height) final.height = DEFAULT_PROFILE.height;
      if (!final.weight) final.weight = DEFAULT_PROFILE.weight;
    }
    const errors = validateProfile(final);
    if (errors.length) { Alert.alert(t('onb.validationTitle'), errors.join('\n')); return; }
    await setProfile({ ...final, programStartISO: final.programStartISO || new Date().toISOString().slice(0, 10) });
    await clearOnboardingDraft();
  }

  return (
    <Screen>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.accent }]}>{idx + 1}/{total}</Text>
        <View style={[styles.progressBg, { backgroundColor: colors.bgElev }]}>
          <View style={[styles.progressFill, { width: `${((idx + 1) / total) * 100}%`, backgroundColor: colors.accent }]} />
        </View>
      </View>

      <H1>{questionFor(step, t)}</H1>
      {step === 'focus' && <Subtitle>{t('onb.subtitle')}</Subtitle>}

      <View style={styles.options}>
        {step === 'focus' && SCOPE_OPTIONS.map(o => (
          <Choice
            key={o.value}
            active={scope === o.value}
            title={t(o.titleKey)}
            subtitle={t(o.subKey)}
            onPress={() => setField('coachScope', o.value)}
          />
        ))}

        {step === 'goal' && primaryGoals.map(item => (
          <Choice
            key={item.value}
            active={draft.primaryGoal === item.value}
            title={t(item.labelKey)}
            onPress={() => setDraft(c => ({ ...c, primaryGoal: item.value, trainingGoal: item.trainingGoal }))}
          />
        ))}

        {step === 'nutritionGoal' && NUTRITION_GOALS.map(g => (
          <Choice key={g.value} active={draft.primaryGoal === g.value} title={t(g.labelKey)} onPress={() => setField('primaryGoal', g.value)} />
        ))}

        {step === 'trainingGoal' && trainingGoalsFor(draft.primaryGoal).map(g => (
          <Choice key={g.value} active={draft.trainingGoal === g.value} title={t(g.labelKey)} onPress={() => setField('trainingGoal', g.value)} />
        ))}

        {step === 'sessions' && (
          <View style={styles.wrap}>
            {[1, 2, 3, 4, 5, 6].map(count => (
              <Pill key={count} active={draft.sessionsPerWeek === count} onPress={() => setDraft(c => ({ ...c, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) }))}>{count}×</Pill>
            ))}
          </View>
        )}

        {step === 'experience' && (
          <View style={styles.wrap}>
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(exp => (
              <Pill key={exp} active={draft.experience === exp} onPress={() => setField('experience', exp)}>{t(experienceLabelKey(exp))}</Pill>
            ))}
          </View>
        )}

        {step === 'weeklyKm' && (
          <Field
            keyboardType="number-pad"
            value={draft.currentWeeklyKm ? String(draft.currentWeeklyKm) : ''}
            onChangeText={v => setField('currentWeeklyKm', v ? Number(v) || undefined : undefined)}
            placeholder={t('onb.weeklyKmPlaceholder')}
          />
        )}

        {step === 'runningHistory' && (
          <View style={styles.bodyWrap}>
            <Field
              keyboardType="number-pad"
              value={draft.currentWeeklyKm ? String(draft.currentWeeklyKm) : ''}
              onChangeText={v => setField('currentWeeklyKm', positiveNumber(v))}
              placeholder={t('onb.weeklyKmPlaceholder')}
            />
            <Field
              keyboardType="number-pad"
              value={draft.longestRecentRunKm ? String(draft.longestRecentRunKm) : ''}
              onChangeText={v => setField('longestRecentRunKm', positiveNumber(v))}
              placeholder={t('onb.longestRunPlaceholder')}
            />
            <Field
              keyboardType="number-pad"
              value={draft.runsPerWeek ? String(draft.runsPerWeek) : ''}
              onChangeText={v => setField('runsPerWeek', positiveInt(v, 7))}
              placeholder={t('onb.runsPerWeekPlaceholder')}
            />
            <LabelText text={t('onb.injuryFlag')} />
            <View style={styles.wrap}>
              <Pill active={draft.injuryFlag === true} onPress={() => setField('injuryFlag', true)}>{t('common.yes')}</Pill>
              <Pill active={draft.injuryFlag !== true} onPress={() => setField('injuryFlag', false)}>{t('common.no')}</Pill>
            </View>
            <LabelText text={t('onb.runWalkPreferred')} />
            <View style={styles.wrap}>
              <Pill active={draft.runWalkPreferred === true} onPress={() => setField('runWalkPreferred', true)}>{t('common.yes')}</Pill>
              <Pill active={draft.runWalkPreferred !== true} onPress={() => setField('runWalkPreferred', false)}>{t('common.no')}</Pill>
            </View>
          </View>
        )}

        {step === 'raceDetails' && (
          <View style={styles.bodyWrap}>
            <Field
              value={draft.raceDateISO ?? ''}
              onChangeText={v => setField('raceDateISO', v.trim() || undefined)}
              placeholder={t('onb.raceDatePlaceholder')}
            />
            <Field
              keyboardType="number-pad"
              value={draft.targetTimeSeconds ? String(Math.round(draft.targetTimeSeconds / 60)) : ''}
              onChangeText={v => {
                const minutes = positiveInt(v, 24 * 60);
                setField('targetTimeSeconds', minutes ? minutes * 60 : undefined);
              }}
              placeholder={t('onb.targetTimePlaceholder')}
            />
            <Field
              keyboardType="number-pad"
              value={draft.currentPaceSecPerKm ? String(draft.currentPaceSecPerKm) : ''}
              onChangeText={v => setField('currentPaceSecPerKm', positiveInt(v, 900))}
              placeholder={t('onb.currentPacePlaceholder')}
            />
            <LabelText text={t('onb.availableDays')} />
            <View style={styles.wrap}>
              {[2, 3, 4, 5, 6].map(count => (
                <Pill key={count} active={draft.availableTrainingDays === count} onPress={() => setField('availableTrainingDays', count)}>{count}×</Pill>
              ))}
            </View>
            <LabelText text={t('onb.restDays')} />
            <View style={styles.wrap}>
              {WEEKDAY_REST.map(day => (
                <Pill
                  key={day.value}
                  active={(draft.preferredRestDays ?? []).includes(day.value)}
                  onPress={() => setField('preferredRestDays', toggleRestDay(draft.preferredRestDays, day.value))}
                >
                  {day.label}
                </Pill>
              ))}
            </View>
          </View>
        )}

        {step === 'raceFeasibility' && feasibility && (
          <View style={[styles.feasibilityBox, { borderColor: verdictColor(feasibility.verdict, colors), backgroundColor: colors.bgElev }]}>
            <Text style={[styles.feasibilityVerdict, { color: verdictColor(feasibility.verdict, colors) }]}>
              {t(feasibilityLabelKey(feasibility.verdict))}
            </Text>
            <Text style={[styles.feasibilityStats, { color: colors.muted }]}>
              {t('onb.feasibilityStats', {
                weeks: feasibility.weeksUntilRace,
                base: feasibility.currentBaseKm,
                peak: feasibility.requiredPeakKm,
                safe: feasibility.safePeakByRaceKm,
              })}
            </Text>
            {(feasibility.reasons.length ? feasibility.reasons : [t('onb.feasibilityNoReasons')]).map((reason, index) => (
              <Text key={`${reason}-${index}`} style={[styles.feasibilityReason, { color: colors.ink }]}>• {reason}</Text>
            ))}
            <Text style={[styles.feasibilityRecommendation, { color: colors.muted }]}>{feasibility.recommendation}</Text>
            {feasibility.verdict === 'unrealistic' && (
              <>
                <Button variant="secondary" onPress={() => setField('trainingGoal', saferRaceGoal(draft.trainingGoal))}>{t('onb.saferPlan')}</Button>
                <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('onb.continueAnyway')}</Text>
              </>
            )}
          </View>
        )}

        {step === 'body' && (
          <View style={styles.bodyWrap}>
            <View style={styles.wrap}>
              {(['muz', 'zena'] as Gender[]).map(g => (
                <Pill key={g} active={draft.gender === g} onPress={() => setField('gender', g)}>{g === 'muz' ? t('onb.male') : t('onb.female')}</Pill>
              ))}
            </View>
            <Field keyboardType="number-pad" value={draft.age === 0 ? '' : String(draft.age)} onChangeText={v => setField('age', Number(v) || 0)} placeholder={t('onb.agePlaceholder')} />
            <Field keyboardType="number-pad" value={draft.height === 0 ? '' : String(draft.height)} onChangeText={v => setField('height', Number(v) || 0)} placeholder={t('onb.heightPlaceholder')} />
            <Field keyboardType="number-pad" value={draft.weight === 0 ? '' : String(draft.weight)} onChangeText={v => setField('weight', Number(v) || 0)} placeholder={t('onb.weightPlaceholder')} />
          </View>
        )}

        {step === 'nutritionMode' && (
          <View style={styles.wrap}>
            {nutritionModes.map(mode => (
              <Pill key={mode.value} active={(draft.nutritionMode ?? 'balanced') === mode.value} onPress={() => setField('nutritionMode', mode.value)}>{t(mode.labelKey)}</Pill>
            ))}
          </View>
        )}

        {step === 'planIntensity' && (
          <View style={styles.wrap}>
            {planIntensities.map(intensity => (
              <Pill key={intensity.value} active={(draft.planIntensity ?? 'moderate') === intensity.value} onPress={() => setField('planIntensity', intensity.value)}>{t(intensity.labelKey)}</Pill>
            ))}
          </View>
        )}

        {step === 'diet' && (
          <View style={styles.bodyWrap}>
            <Field value={draft.likes} onChangeText={v => setField('likes', v)} placeholder={t('onb.likesPlaceholder')} multiline />
            <Field value={draft.dislikes} onChangeText={v => setField('dislikes', v)} placeholder={t('onb.dislikesPlaceholder')} multiline />
            <View style={styles.wrap}>
              {(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'] as DietStyle[]).map(diet => (
                <Pill key={diet} active={draft.diet === diet} onPress={() => setField('diet', diet)}>{t(`diet.${diet}` as TranslationKey)}</Pill>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {idx > 0 && <Button variant="secondary" onPress={() => setStepIndex(s => s - 1)}>{t('common.back')}</Button>}
        <Button onPress={isLast ? finish : () => setStepIndex(s => s + 1)}>{isLast ? t('onb.finish') : t('common.continue')}</Button>
      </View>
      <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('onb.disclaimer')}</Text>
    </Screen>
  );
}

function questionFor(step: StepId, t: (k: TranslationKey) => string): string {
  switch (step) {
    case 'focus':         return t('onb.focusQuestion');
    case 'goal':          return t('onb.goalQuestion');
    case 'nutritionGoal': return t('onb.nutritionGoalQuestion');
    case 'trainingGoal':  return t('onb.trainingGoalQuestion');
    case 'sessions':      return t('onb.sessionsQuestion');
    case 'experience':    return t('onb.experienceQuestion');
    case 'weeklyKm':      return t('onb.weeklyKmLabel');
    case 'runningHistory': return t('onb.runningHistoryQuestion');
    case 'raceDetails':   return t('onb.raceDetailsQuestion');
    case 'raceFeasibility': return t('onb.feasibilityQuestion');
    case 'body':          return t('onb.bodyQuestion');
    case 'nutritionMode': return t('onb.nutritionMode');
    case 'planIntensity': return t('onb.planIntensity');
    case 'diet':          return t('onb.dietPrefs');
  }
}

const SCOPE_OPTIONS: Array<{ value: CoachScope; titleKey: TranslationKey; subKey: TranslationKey }> = [
  { value: 'both', titleKey: 'scope.both', subKey: 'scope.bothSub' },
  { value: 'training', titleKey: 'scope.training', subKey: 'scope.trainingSub' },
  { value: 'nutrition', titleKey: 'scope.nutrition', subKey: 'scope.nutritionSub' },
];

const primaryGoals: Array<{ value: PrimaryGoal; labelKey: TranslationKey; trainingGoal: TrainingGoalKind }> = [
  { value: 'lose_fat', labelKey: 'onb.goalLoseFat', trainingGoal: 'general_fitness' },
  { value: 'maintain_weight', labelKey: 'onb.goalMaintainWeight', trainingGoal: 'general_fitness' },
  { value: 'gain_muscle', labelKey: 'onb.goalGainMuscle', trainingGoal: 'strength_basics' },
  { value: 'improve_fitness', labelKey: 'goal.improve_fitness', trainingGoal: 'general_fitness' },
  { value: 'improve_running', labelKey: 'goal.improve_running', trainingGoal: 'run_10k' },
  { value: 'improve_recovery', labelKey: 'goal.improve_recovery', trainingGoal: 'walking_more' },
  { value: 'build_consistency', labelKey: 'goal.build_consistency', trainingGoal: 'general_fitness' },
];

const NUTRITION_GOALS: Array<{ value: PrimaryGoal; labelKey: TranslationKey }> = [
  { value: 'lose_fat', labelKey: 'onb.goalLoseFat' },
  { value: 'maintain_weight', labelKey: 'onb.goalMaintainWeight' },
  { value: 'gain_muscle', labelKey: 'onb.goalGainMuscle' },
];

function trainingGoalsFor(primaryGoal: PrimaryGoal): Array<{ value: TrainingGoalKind; labelKey: TranslationKey }> {
  if (primaryGoal === 'improve_running') return [
    { value: 'couch_to_5k', labelKey: 'onb.tgCouch' },
    { value: 'run_5k', labelKey: 'onb.tgRun5k' },
    { value: 'run_10k', labelKey: 'onb.tgRun10k' },
    { value: 'half_marathon', labelKey: 'onb.tgHalf' },
    { value: 'marathon', labelKey: 'onb.tgMarathon' },
  ];
  if (primaryGoal === 'gain_muscle') return [
    { value: 'strength_basics', labelKey: 'onb.tgStrengthBasics' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitnessAlt' },
  ];
  if (primaryGoal === 'improve_fitness') return [
    { value: 'sports_conditioning', labelKey: 'onb.tgSportsConditioning' },
    { value: 'hyrox', labelKey: 'onb.tgHyrox' },
    { value: 'sprint_triathlon', labelKey: 'onb.tgSprintTri' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitness' },
  ];
  return [
    { value: 'walking_more', labelKey: 'onb.tgWalking' },
    { value: 'couch_to_5k', labelKey: 'onb.tgCouch' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitness' },
    { value: 'sports_conditioning', labelKey: 'onb.tgSportsConditioning' },
  ];
}

const nutritionModes: Array<{ value: NutritionMode; labelKey: TranslationKey }> = [
  { value: 'balanced', labelKey: 'nutritionMode.balanced' },
  { value: 'fat_loss_friendly', labelKey: 'nutritionMode.fat_loss_friendly' },
  { value: 'muscle_gain_friendly', labelKey: 'nutritionMode.muscle_gain_friendly' },
  { value: 'high_protein', labelKey: 'nutritionMode.high_protein' },
  { value: 'budget_friendly', labelKey: 'nutritionMode.budget_friendly' },
  { value: 'simple_meal_prep', labelKey: 'nutritionMode.simple_meal_prep' },
  { value: 'endurance_fueling', labelKey: 'nutritionMode.endurance_fueling' },
];

const planIntensities: Array<{ value: PlanIntensity; labelKey: TranslationKey }> = [
  { value: 'easy', labelKey: 'planIntensity.easy' },
  { value: 'moderate', labelKey: 'planIntensity.moderate' },
  { value: 'ambitious_but_safe', labelKey: 'planIntensity.ambitious_but_safe' },
];

const RUNNING_GOALS: TrainingGoalKind[] = [
  'couch_to_5k', 'run_5k', 'run_10k', 'half_marathon', 'marathon',
  'hyrox', 'ocr', 'sprint_triathlon', 'olympic_triathlon', 'half_ironman', 'full_ironman',
];
function isRunningGoal(goal: TrainingGoalKind): boolean {
  return RUNNING_GOALS.includes(goal);
}

function isRunRaceGoal(goal: TrainingGoalKind): boolean {
  return ['run_5k', 'run_10k', 'half_marathon', 'marathon'].includes(goal);
}

function positiveNumber(value: string): number | undefined {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function positiveInt(value: string, max: number): number | undefined {
  const n = Math.round(Number(value.replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
}

function toggleRestDay(current: number[] | undefined, day: number): number[] {
  const set = new Set(current ?? []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return Array.from(set).sort((a, b) => a - b);
}

function saferRaceGoal(goal: TrainingGoalKind): TrainingGoalKind {
  if (goal === 'marathon') return 'half_marathon';
  if (goal === 'half_marathon') return 'run_10k';
  if (goal === 'run_10k') return 'run_5k';
  return 'couch_to_5k';
}

function feasibilityLabelKey(verdict: 'feasible' | 'tight' | 'unrealistic'): TranslationKey {
  return verdict === 'feasible'
    ? 'onb.feasibilityFeasible'
    : verdict === 'tight'
      ? 'onb.feasibilityTight'
      : 'onb.feasibilityUnrealistic';
}

function verdictColor(verdict: 'feasible' | 'tight' | 'unrealistic', colors: ReturnType<typeof useTheme>['colors']): string {
  return verdict === 'feasible' ? colors.green : verdict === 'tight' ? colors.orange : colors.red;
}

function LabelText({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.fieldLabel, { color: colors.faint }]}>{text}</Text>;
}

const WEEKDAY_REST = [
  { value: 1, label: 'Po' },
  { value: 2, label: 'Út' },
  { value: 3, label: 'St' },
  { value: 4, label: 'Čt' },
  { value: 5, label: 'Pá' },
  { value: 6, label: 'So' },
  { value: 0, label: 'Ne' },
];

function experienceLabelKey(value: ExperienceLevel): TranslationKey {
  return ({ beginner: 'onb.expBeginner', intermediate: 'onb.expIntermediate', advanced: 'onb.expAdvanced' } as const)[value];
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  progressText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
  progressBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  options: { gap: 10, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bodyWrap: { gap: 12 },
  actions: { gap: 10, marginTop: 8 },
  disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  feasibilityBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  feasibilityVerdict: { fontSize: 16, fontWeight: '900' },
  feasibilityStats: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  feasibilityReason: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  feasibilityRecommendation: { fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 2 },
});
