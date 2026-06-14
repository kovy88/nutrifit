import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Choice, Field, H1, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { GoalInputStep } from '../components/onboarding/GoalInputStep';
import { OnboardingProgress } from '../components/onboarding/OnboardingProgress';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import type {
  CoachScope, DietStyle, ExperienceLevel, Gender, NutritionMode, PlanIntensity, TrainingGoalKind, UserProfile,
} from '../types';
import { resolveCoachScope, scopeHasNutrition } from '../types';
import { DEFAULT_PROFILE, validateProfile, activityFactorForSessions } from '../utils/nutrition';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft } from '../services/storage';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../lib/i18n';
import { validateRaceGoalFeasibility } from '../lib/training/feasibility';
import { trainingGoalsFor, isRunRaceGoal } from '../constants/goals';
import { applyGoalProfileToUserProfile } from '../lib/onboarding/goal-profile-adapter';
import type { GoalProfile } from '../types/goal-types';
import {
  buildOnboardingSteps,
  isAutoAdvanceStep,
  isStepTouched,
  validateOnboardingStep,
  type OnboardingField,
  type StepId,
  type TouchedOnboardingFields,
} from '../lib/onboarding/validation';

export function OnboardingScreen() {
  const { setProfile } = useTrenr();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(() => ({ ...DEFAULT_PROFILE, age: 0, height: 0, weight: 0 }));
  const [touchedFields, setTouchedFields] = useState<TouchedOnboardingFields>({});
  const [goalInput, setGoalInput] = useState('');

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
      setGoalInput(stored.draft.goalProfile?.rawText ?? '');
      setStepIndex(Math.max(0, stored.step));
      setTouchedFields(stored.touchedFields ?? {});
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveOnboardingDraft({ step: stepIndex, draft, touchedFields, updatedAt: new Date().toISOString() });
  }, [stepIndex, draft, touchedFields]);

  const scope = resolveCoachScope(draft);
  const steps = useMemo(() => buildOnboardingSteps(scope, draft.trainingGoal, draft.primaryGoal, draft.goalProfile), [scope, draft.goalProfile, draft.primaryGoal, draft.trainingGoal]);
  const total = steps.length;
  const idx = Math.min(stepIndex, total - 1);
  const step = steps[idx];
  const isLast = idx === total - 1;
  const autoStep = isAutoAdvanceStep(step);
  const feasibility = useMemo(() => (
    isRunRaceGoal(draft.trainingGoal)
      ? validateRaceGoalFeasibility({ trainingGoal: draft.trainingGoal, profile: draft })
      : null
  ), [draft]);
  const stepValidation = validateOnboardingStep(step, draft, scope, touchedFields, feasibility?.verdict);
  const touchedCurrentStep = isStepTouched(step, touchedFields);
  const shouldShowRequired = !stepValidation.valid && !autoStep && touchedCurrentStep;
  const stepHelp = subtitleFor(step, locale, t);
  const footerMessage = shouldShowRequired ? t(stepValidation.messageKey, stepValidation.params) : undefined;
  const showPrimaryFooterAction = isLast || (!autoStep && (stepValidation.valid || shouldShowRequired));
  const showFooterActions = idx > 0 || showPrimaryFooterAction;
  const showFooter = showFooterActions || Boolean(footerMessage);

  function markTouched(field: OnboardingField) {
    setTouchedFields(current => ({ ...current, [field]: true }));
  }

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    markTouched(key as OnboardingField);
  }

  function chooseField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    const nextDraft = { ...draft, [key]: value };
    const nextTouched = { ...touchedFields, [key]: true };
    completeChoice(nextDraft, nextTouched);
  }

  function setGoalProfile(goalProfile: GoalProfile | null) {
    if (!goalProfile) {
      setDraft(current => ({ ...current, goalProfile: undefined }));
      setTouchedFields(current => ({ ...current, goalProfile: false }));
      return;
    }
    setDraft(current => applyGoalProfileToUserProfile(current, goalProfile));
    setTouchedFields(current => ({ ...current, goalProfile: true }));
  }

  function completeChoice(nextDraft: UserProfile, nextTouched: TouchedOnboardingFields) {
    setDraft(nextDraft);
    setTouchedFields(nextTouched);
    if (isLast) {
      void finish(nextDraft);
      return;
    }
    setStepIndex(s => s + 1);
  }

  function nextStep() {
    if (!stepValidation.valid) return;
    setStepIndex(s => s + 1);
  }

  async function finish(profileOverride?: UserProfile) {
    let final: UserProfile = { ...(profileOverride ?? draft) };
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

  const footer = showFooter ? (
    <View style={styles.footer}>
      {showFooterActions ? (
        <View style={styles.actions}>
          {idx > 0 && (
            <Button
              style={showPrimaryFooterAction ? styles.footerButton : styles.footerBackOnlyButton}
              variant="secondary"
              onPress={() => setStepIndex(s => s - 1)}
            >
              {t('common.back')}
            </Button>
          )}
          {showPrimaryFooterAction && (
            <Button style={styles.footerButton} disabled={!stepValidation.valid} onPress={isLast ? () => finish() : nextStep}>{isLast ? t('onb.finish') : t('common.continue')}</Button>
          )}
        </View>
      ) : null}
      {footerMessage ? (
        <Text style={[styles.validationText, { color: colors.orange }]}>
          {footerMessage}
        </Text>
      ) : null}
    </View>
  ) : undefined;

  return (
    <Screen footer={footer} contentContainerStyle={styles.screenContent}>
      <OnboardingProgress current={idx + 1} total={total} label={onboardingProgressLabel(idx, total, locale)} />

      <H1>{questionFor(step, t, locale)}</H1>
      <Subtitle>{stepHelp}</Subtitle>

      <View style={styles.options}>
        {step === 'focus' && SCOPE_OPTIONS.map(o => (
          <Choice
            key={o.value}
            active={Boolean(touchedFields.coachScope) && scope === o.value}
            title={t(o.titleKey)}
            subtitle={t(o.subKey)}
            onPress={() => chooseField('coachScope', o.value)}
          />
        ))}

        {step === 'goal' && (
          <GoalInputStep
            value={goalInput}
            goalProfile={draft.goalProfile}
            scope={scope}
            locale={locale}
            onTextChange={setGoalInput}
            onGoalProfileChange={setGoalProfile}
            t={t}
          />
        )}

        {step === 'trainingGoal' && trainingGoalsFor(draft.primaryGoal).map(g => (
          <Choice
            key={g.value}
            active={Boolean(touchedFields.trainingGoal) && draft.trainingGoal === g.value}
            title={t(g.labelKey)}
            subtitle={(g.value === 'half_marathon' || g.value === 'marathon') ? t('onb.raceGoalExplanation') : undefined}
            onPress={() => chooseField('trainingGoal', g.value)}
          />
        ))}

        {step === 'sessions' && (
          <View style={styles.sessionGrid}>
            {[1, 2, 3, 4, 5, 6].map(count => (
              <Pressable
                key={count}
                accessibilityRole="button"
                onPress={() => {
                  completeChoice(
                    { ...draft, sessionsPerWeek: count, activityFactor: activityFactorForSessions(count) },
                    { ...touchedFields, sessionsPerWeek: true },
                  );
                }}
                style={({ pressed }) => [
                  styles.sessionChoice,
                  {
                    borderColor: Boolean(touchedFields.sessionsPerWeek) && draft.sessionsPerWeek === count ? colors.accent : colors.border,
                    backgroundColor: Boolean(touchedFields.sessionsPerWeek) && draft.sessionsPerWeek === count ? colors.accent + '1F' : colors.bgElev,
                  },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={[styles.sessionNumber, { color: colors.ink }]}>{count}×</Text>
                <Text numberOfLines={1} style={[styles.sessionLabel, { color: colors.muted }]}>{sessionOptionLabel(count, locale)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 'experience' && (
          <>
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(exp => (
              <Choice
                key={exp}
                active={Boolean(touchedFields.experience) && draft.experience === exp}
                title={t(experienceLabelKey(exp))}
                subtitle={experienceSubtitle(exp, locale)}
                onPress={() => chooseField('experience', exp)}
              />
            ))}
          </>
        )}

        {step === 'weeklyKm' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.weeklyKmField')} />
            <Field
              keyboardType="number-pad"
              value={draft.currentWeeklyKm ? String(draft.currentWeeklyKm) : ''}
              onChangeText={v => setField('currentWeeklyKm', positiveNumber(v))}
              placeholder={t('onb.weeklyKmPlaceholder')}
            />
          </View>
        )}

        {step === 'longestRun' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.longestRunField')} />
            <Field
              keyboardType="number-pad"
              value={draft.longestRecentRunKm ? String(draft.longestRecentRunKm) : ''}
              onChangeText={v => setField('longestRecentRunKm', positiveNumber(v))}
              placeholder={t('onb.longestRunPlaceholder')}
            />
          </View>
        )}

        {step === 'runFrequency' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.runsPerWeekField')} />
            <Field
              keyboardType="number-pad"
              value={draft.runsPerWeek ? String(draft.runsPerWeek) : ''}
              onChangeText={v => setField('runsPerWeek', positiveInt(v, 7))}
              placeholder={t('onb.runsPerWeekPlaceholder')}
            />
          </View>
        )}

        {step === 'runLimits' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.injuryFlag')} />
            <View style={styles.wrap}>
              <Pill active={Boolean(touchedFields.injuryFlag) && draft.injuryFlag === true} onPress={() => setField('injuryFlag', true)}>{t('common.yes')}</Pill>
              <Pill active={Boolean(touchedFields.injuryFlag) && draft.injuryFlag === false} onPress={() => setField('injuryFlag', false)}>{t('common.no')}</Pill>
            </View>
            <LabelText text={t('onb.runWalkPreferred')} />
            <View style={styles.wrap}>
              <Pill active={Boolean(touchedFields.runWalkPreferred) && draft.runWalkPreferred === true} onPress={() => setField('runWalkPreferred', true)}>{t('common.yes')}</Pill>
              <Pill active={Boolean(touchedFields.runWalkPreferred) && draft.runWalkPreferred === false} onPress={() => setField('runWalkPreferred', false)}>{t('common.no')}</Pill>
            </View>
          </View>
        )}

        {step === 'raceDate' && (
          <View style={styles.bodyWrap}>
            <DateTimePicker
              value={draft.raceDateISO ? new Date(`${draft.raceDateISO}T12:00:00`) : new Date()}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              onChange={(_, date) => {
                if (date) setField('raceDateISO', date.toISOString().slice(0, 10));
              }}
              themeVariant={colors.isDark ? 'dark' : 'light'}
            />
            <Text style={[styles.datePreview, { color: colors.muted }]}>
              {draft.raceDateISO ? t('onb.selectedRaceDate', { date: draft.raceDateISO }) : t('onb.noRaceDate')}
            </Text>
          </View>
        )}

        {step === 'raceTarget' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.targetTimeOptional')} />
            <Field
              keyboardType="number-pad"
              value={draft.targetTimeSeconds ? String(Math.round(draft.targetTimeSeconds / 60)) : ''}
              onChangeText={v => {
                const minutes = positiveInt(v, 24 * 60);
                setField('targetTimeSeconds', minutes ? minutes * 60 : undefined);
              }}
              placeholder={t('onb.targetTimePlaceholder')}
            />
            <LabelText text={t('onb.currentPaceOptional')} />
            <Field
              keyboardType="number-pad"
              value={draft.currentPaceSecPerKm ? String(draft.currentPaceSecPerKm) : ''}
              onChangeText={v => setField('currentPaceSecPerKm', positiveInt(v, 900))}
              placeholder={t('onb.currentPacePlaceholder')}
            />
          </View>
        )}

        {step === 'raceSchedule' && (
          <View style={styles.bodyWrap}>
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
                  {t(day.labelKey)}
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
                <Button variant="secondary" onPress={() => {
                  setField('trainingGoal', saferRaceGoal(draft.trainingGoal));
                  setStepIndex(s => Math.max(0, s - 1));
                }}>{t('onb.saferPlan')}</Button>
                <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('onb.continueAnyway')}</Text>
              </>
            )}
          </View>
        )}

        {step === 'body' && (
          <View style={styles.bodyWrap}>
            <View style={styles.wrap}>
              {(['muz', 'zena'] as Gender[]).map(g => (
                <Pill key={g} active={Boolean(touchedFields.gender) && draft.gender === g} onPress={() => setField('gender', g)}>{g === 'muz' ? t('onb.male') : t('onb.female')}</Pill>
              ))}
            </View>
            <View style={styles.bodyGrid}>
              <BodyNumberField
                label={t('onb.ageField')}
                value={draft.age === 0 ? '' : String(draft.age)}
                onChangeText={v => setField('age', Number(v) || 0)}
                placeholder={t('onb.agePlaceholder')}
              />
              <BodyNumberField
                label={t('onb.heightField')}
                value={draft.height === 0 ? '' : String(draft.height)}
                onChangeText={v => setField('height', Number(v) || 0)}
                placeholder={t('onb.heightPlaceholder')}
              />
              <BodyNumberField
                label={t('onb.weightField')}
                value={draft.weight === 0 ? '' : String(draft.weight)}
                onChangeText={v => setField('weight', Number(v) || 0)}
                placeholder={t('onb.weightPlaceholder')}
              />
            </View>
          </View>
        )}

        {step === 'nutritionMode' && (
          <View style={styles.wrap}>
            {nutritionModes.map(mode => (
              <Pill key={mode.value} active={Boolean(touchedFields.nutritionMode) && (draft.nutritionMode ?? 'balanced') === mode.value} onPress={() => chooseField('nutritionMode', mode.value)}>{t(mode.labelKey)}</Pill>
            ))}
          </View>
        )}

        {step === 'planIntensity' && (
          <View style={styles.wrap}>
            {planIntensities.map(intensity => (
              <Pill key={intensity.value} active={Boolean(touchedFields.planIntensity) && (draft.planIntensity ?? 'moderate') === intensity.value} onPress={() => chooseField('planIntensity', intensity.value)}>{t(intensity.labelKey)}</Pill>
            ))}
          </View>
        )}

        {step === 'diet' && (
          <View style={styles.bodyWrap}>
            <LabelText text={t('onb.dietTypeRequired')} />
            <View style={styles.wrap}>
              {(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'] as DietStyle[]).map(diet => (
                <Pill key={diet} active={Boolean(touchedFields.diet) && draft.diet === diet} onPress={() => chooseField('diet', diet)}>{t(`diet.${diet}` as TranslationKey)}</Pill>
              ))}
            </View>
          </View>
        )}
      </View>

      {step === 'focus' ? (
        <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('onb.disclaimer')}</Text>
      ) : null}
    </Screen>
  );
}

function questionFor(step: StepId, t: (k: TranslationKey) => string, locale: 'cs' | 'en'): string {
  switch (step) {
    case 'focus':         return locale === 'en' ? 'Start with what?' : 'Čím začneme?';
    case 'goal':          return locale === 'en' ? 'What is the goal?' : 'Jaký je cíl?';
    case 'nutritionGoal': return t('onb.nutritionGoalQuestion');
    case 'trainingGoal':  return t('onb.trainingGoalQuestion');
    case 'sessions':      return t('onb.sessionsQuestion');
    case 'experience':    return t('onb.experienceQuestion');
    case 'weeklyKm':      return t('onb.weeklyKmLabel');
    case 'longestRun':    return t('onb.longestRunQuestion');
    case 'runFrequency':  return t('onb.runFrequencyQuestion');
    case 'runLimits':     return t('onb.runLimitsQuestion');
    case 'raceDate':      return t('onb.raceDateQuestion');
    case 'raceTarget':    return t('onb.raceTargetQuestion');
    case 'raceSchedule':  return t('onb.raceScheduleQuestion');
    case 'raceFeasibility': return t('onb.feasibilityQuestion');
    case 'body':          return locale === 'en' ? 'Last basics' : 'Poslední základ';
    case 'nutritionMode': return t('onb.nutritionMode');
    case 'planIntensity': return t('onb.planIntensity');
    case 'diet':          return t('onb.dietPrefs');
  }
}

function bodyHelpCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Only for the first useful food target. You can tune details later.'
    : 'Jen pro první užitečný jídelní cíl. Detaily doladíš později.';
}

function onboardingProgressLabel(index: number, total: number, locale: 'cs' | 'en'): string {
  const remaining = Math.max(0, total - index - 1);
  if (remaining === 0) {
    return locale === 'en' ? 'Quick start · last step' : 'Rychlý start · poslední krok';
  }
  if (locale === 'en') {
    return `Quick start · ${remaining} ${remaining === 1 ? 'step' : 'steps'} left`;
  }
  return `Rychlý start · ${remaining} ${czechStepLabel(remaining)}`;
}

function czechStepLabel(count: number): string {
  if (count === 1) return 'krok';
  if (count >= 2 && count <= 4) return 'kroky';
  return 'kroků';
}

function subtitleFor(step: StepId, locale: 'cs' | 'en', t: (k: TranslationKey) => string): string {
  if (step === 'focus') {
    return locale === 'en'
      ? 'Pick one daily answer. You can add the rest later.'
      : 'Vyber jednu denní odpověď. Zbytek můžeš přidat později.';
  }
  if (step === 'goal') {
    return locale === 'en'
      ? 'Pick a quick start or write one sentence.'
      : 'Vyber rychlý start nebo napiš jednu větu.';
  }
  if (step === 'body') return bodyHelpCopy(locale);
  if (step === 'trainingGoal') {
    return locale === 'en'
      ? 'Choose the plan that matches what you actually want to do.'
      : 'Vyber plán, který odpovídá tomu, co chceš opravdu dělat.';
  }
  if (step === 'sessions') {
    return locale === 'en'
      ? 'Pick the rhythm you can repeat on a normal busy week.'
      : 'Vyber rytmus, který zvládneš opakovat i v běžném týdnu.';
  }
  if (step === 'experience') {
    return locale === 'en'
      ? 'Be honest. This keeps the first plan realistic.'
      : 'Vyber upřímně. Díky tomu bude první plán realistický.';
  }
  if (step === 'nutritionGoal') {
    return locale === 'en'
      ? 'This only sets the direction of your first food plan.'
      : 'Tohle jen nastaví směr prvního jídelního plánu.';
  }
  if (step === 'nutritionMode') {
    return locale === 'en'
      ? 'Keep it simple now; food preferences can be tuned later.'
      : 'Teď to nech jednoduché; preference jídla doladíš později.';
  }
  if (step === 'planIntensity') {
    return locale === 'en'
      ? 'Choose the pace you can sustain next week too.'
      : 'Vyber tempo, které zvládneš držet i příští týden.';
  }
  return t(helpKeyFor(step));
}

function sessionOptionLabel(count: number, locale: 'cs' | 'en'): string {
  if (locale === 'en') {
    return ({
      1: 'easy start',
      2: 'light rhythm',
      3: 'balanced week',
      4: 'steady plan',
      5: 'high commitment',
      6: 'advanced',
    } as const)[count] ?? 'days/week';
  }
  return ({
    1: 'lehký start',
    2: 'klidný rytmus',
    3: 'vyvážený týden',
    4: 'pevný plán',
    5: 'vyšší závazek',
    6: 'pokročilé',
  } as const)[count] ?? 'dny týdně';
}

function experienceSubtitle(value: ExperienceLevel, locale: 'cs' | 'en'): string {
  const en: Record<ExperienceLevel, string> = {
    beginner: 'Start conservative and keep the plan easy to repeat.',
    intermediate: 'A normal progression with room for busy weeks.',
    advanced: 'More structure, still with guardrails.',
  };
  const cs: Record<ExperienceLevel, string> = {
    beginner: 'Začni konzervativně a drž plán snadno opakovatelný.',
    intermediate: 'Běžná progrese s rezervou pro rušné týdny.',
    advanced: 'Více struktury, pořád s bezpečnostní rezervou.',
  };
  return locale === 'en' ? en[value] : cs[value];
}

const SCOPE_OPTIONS: Array<{ value: CoachScope; titleKey: TranslationKey; subKey: TranslationKey }> = [
  { value: 'both', titleKey: 'scope.both', subKey: 'scope.bothSub' },
  { value: 'training', titleKey: 'scope.training', subKey: 'scope.trainingSub' },
  { value: 'nutrition', titleKey: 'scope.nutrition', subKey: 'scope.nutritionSub' },
];

function helpKeyFor(step: StepId): TranslationKey {
  if (step === 'goal') return 'onb.goalHybridSubtitle';
  return (`onb.help.${step}` as TranslationKey);
}

const nutritionModes: Array<{ value: NutritionMode; labelKey: TranslationKey }> = [
  { value: 'balanced', labelKey: 'nutritionMode.balanced' },
  { value: 'fat_loss_friendly', labelKey: 'nutritionMode.fat_loss_friendly' },
  { value: 'muscle_gain_friendly', labelKey: 'nutritionMode.muscle_gain_friendly' },
  { value: 'simple_meal_prep', labelKey: 'nutritionMode.simple_meal_prep' },
];

const planIntensities: Array<{ value: PlanIntensity; labelKey: TranslationKey }> = [
  { value: 'easy', labelKey: 'planIntensity.easy' },
  { value: 'moderate', labelKey: 'planIntensity.moderate' },
  { value: 'ambitious_but_safe', labelKey: 'planIntensity.ambitious_but_safe' },
];

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

function BodyNumberField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.bodyGridItem}>
      <Text numberOfLines={1} style={[styles.fieldLabel, styles.bodyFieldLabel, { color: colors.faint }]}>
        {label}
      </Text>
      <Field
        keyboardType="number-pad"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.bodyField}
      />
    </View>
  );
}

const WEEKDAY_REST = [
  { value: 1, labelKey: 'weekday.mon' as TranslationKey },
  { value: 2, labelKey: 'weekday.tue' as TranslationKey },
  { value: 3, labelKey: 'weekday.wed' as TranslationKey },
  { value: 4, labelKey: 'weekday.thu' as TranslationKey },
  { value: 5, labelKey: 'weekday.fri' as TranslationKey },
  { value: 6, labelKey: 'weekday.sat' as TranslationKey },
  { value: 0, labelKey: 'weekday.sun' as TranslationKey },
];

function experienceLabelKey(value: ExperienceLevel): TranslationKey {
  return ({ beginner: 'onb.expBeginner', intermediate: 'onb.expIntermediate', advanced: 'onb.expAdvanced' } as const)[value];
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 8 },
  options: { gap: 9, marginTop: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sessionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sessionChoice: { flexBasis: '47%', flexGrow: 1, minHeight: 84, borderWidth: 1, borderRadius: 8, alignItems: 'flex-start', justifyContent: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 12 },
  sessionNumber: { fontSize: 25, lineHeight: 29, fontWeight: '900' },
  sessionLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'left' },
  bodyWrap: { gap: 12 },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bodyGridItem: { flexBasis: '30%', flexGrow: 1, minWidth: 82, gap: 6 },
  bodyFieldLabel: { marginTop: 0 },
  bodyField: { minHeight: 50, paddingHorizontal: 12, textAlign: 'center' },
  footer: { gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  footerButton: { flex: 1 },
  footerBackOnlyButton: { minWidth: 112 },
  disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0, marginTop: 4 },
  validationText: { fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  datePreview: { fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  feasibilityBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  feasibilityVerdict: { fontSize: 16, fontWeight: '900' },
  feasibilityStats: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  feasibilityReason: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  feasibilityRecommendation: { fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 2 },
});
