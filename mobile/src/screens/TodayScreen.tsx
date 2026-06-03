import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import {
  Button,
  CoachInsightCard,
  MetricCard,
  NutritionTargetCard,
  QuickActionButton,
  RecoveryCard,
  ScoreRing,
  ScreenHeader,
  TrainingRecommendationCard,
  WeeklyProgressCard,
} from '../components/UI';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../types';
import type { TrainingCompletionRecordMap, TrainingSession } from '../types';
import { formatDateLabel, remainingMacros, sumFoodLog, toDateKey } from '../utils/nutrition';
import { useDailyHealth } from '../hooks/useDailyHealth';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import type { TranslationKey } from '../lib/i18n';

export function TodayScreen() {
  const {
    profile,
    currentMacros: macros,
    baselineMacros,
    currentSession,
    dailyAdjustment,
    currentFoodLog,
    currentMeals,
    selectedDate,
    setTodaySession,
    trainingCompletions,
  } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { completion, mark } = useTrainingCompletion();
  const health = useDailyHealth(new Date(selectedDate));
  const { recommendation: rec, coaching } = useDailyCoachRecommendation(new Date(selectedDate));

  if (!profile || !macros) return null;

  const scope = resolveCoachScope(profile);
  const showNutrition = scopeHasNutrition(scope);
  const showTraining = scopeHasTraining(scope);
  const used = sumFoodLog(currentFoodLog);
  const left = remainingMacros(macros, currentFoodLog);
  const proteinPct = macros.protein > 0 ? Math.round(Math.min(used.protein / macros.protein, 1) * 100) : 0;
  const suggestedDowngrade = currentSession ? applyReadinessToSession(currentSession, coaching.assessment) : null;
  const readinessColor = rec ? bandColor(rec.readiness.band, colors) : colors.accent;
  const trainingMeta = sessionMeta(currentSession, t);
  const week = weeklyCompletion(trainingCompletions, selectedDate);

  async function markTodayDone() {
    await mark('completed');
    Alert.alert(t('today.completedTitle'), t('today.completedMsg'));
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        eyebrow={formatDateLabel(selectedDate)}
        title={t('today.headerTitle')}
        subtitle={`${t(`goal.${profile.primaryGoal}` as TranslationKey)} · ${t(`tab.${showNutrition ? 'plan' : 'training'}` as TranslationKey)}`}
        action={
          <Button variant="secondary" style={styles.headerButton} onPress={() => navigation.navigate('Profil')}>
            {t('tab.profile')}
          </Button>
        }
      />

      {rec ? (
        <CoachInsightCard
          title={rec.headline}
          body={rec.coachNote}
          warnings={rec.warnings.slice(0, 2)}
          accent={readinessColor}
        >
          <View style={styles.heroBody}>
            <ScoreRing score={rec.readiness.score} label={bandLabel(rec.readiness.band, t)} color={readinessColor} />
            <View style={styles.heroCopy}>
              <Text style={[styles.focusLabel, { color: colors.faint }]}>{t('today.oneThing')}</Text>
              <Text style={[styles.focusValue, { color: colors.ink }]}>{rec.training?.focus ?? t('home.restDay')}</Text>
              {rec.training?.whatNotToDo ? (
                <Text style={[styles.caution, { color: colors.orange }]}>{rec.training.whatNotToDo}</Text>
              ) : null}
              <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('today.readinessNote')}</Text>
            </View>
          </View>
        </CoachInsightCard>
      ) : null}

      {showNutrition && (
        <NutritionTargetCard
          label={t('today.nutritionTitle')}
          kcal={macros.kcal}
          protein={macros.protein}
          carbs={macros.carbs}
          fat={macros.fat}
          macroLabels={{
            kcal: 'kcal',
            protein: t('home.protein'),
            carbs: t('home.carbs'),
            fat: t('home.fat'),
          }}
          reason={rec?.nutrition?.reason ?? dailyAdjustment?.note}
        />
      )}

      {showTraining && (
        <TrainingRecommendationCard
          title={t('today.trainingTitle')}
          meta={trainingMeta}
          note={trainingNote(currentSession, rec?.training?.focus, dailyAdjustment?.note, t)}
          cta={completion?.status === 'completed' ? t('today.completed') : t('today.markDone')}
          completed={completion?.status === 'completed'}
          onPress={currentSession && currentSession.kind !== 'rest' ? markTodayDone : undefined}
        />
      )}

      {suggestedDowngrade?.adjusted ? (
        <CoachInsightCard title={t('readiness.planAdjust')} body={downgradeText(currentSession, suggestedDowngrade.session)}>
          <Button onPress={() => setTodaySession(suggestedDowngrade.session)}>{t('readiness.adjustToday')}</Button>
        </CoachInsightCard>
      ) : null}

      <RecoveryCard
        title={t('today.recoveryTitle')}
        metrics={[
          { label: t('home.sleep'), value: formatSleep(health.sleep?.totalMinutes), color: colors.ink },
          { label: t('home.restingHr'), value: health.restingHeartRate?.bpm ? `${health.restingHeartRate.bpm}` : '-', color: colors.ink },
          { label: 'ACWR', value: coaching.trainingLoad?.acwr == null ? '-' : coaching.trainingLoad.acwr.toFixed(2), color: colors.ink },
          { label: 'Strain', value: coaching.strain ? coaching.strain.score.toFixed(1) : '-', color: colors.ink },
        ]}
        recommendation={coaching.assessment?.recommendation ?? t('today.recoveryFallback')}
      />

      <View style={styles.quickGrid}>
        {showNutrition ? <QuickActionButton icon="restaurant-outline" label={t('today.swapMeal')} onPress={() => navigation.navigate('Jídelníček')} /> : null}
        <QuickActionButton icon="options-outline" label={t('today.adjustToday')} onPress={() => navigation.navigate(showTraining ? 'Trénink' : 'Jídelníček')} />
        <QuickActionButton icon="sparkles-outline" label={t('today.askCoach')} onPress={() => navigation.navigate('Coach')} />
        {showTraining && currentSession?.kind !== 'rest' ? (
          <QuickActionButton icon="checkmark-circle-outline" label={t('today.markDone')} onPress={markTodayDone} disabled={completion?.status === 'completed'} />
        ) : null}
      </View>

      <WeeklyProgressCard
        title={t('today.weekTitle')}
        items={[
          { label: t('today.sessions'), value: `${week.completed}/${week.planned}`, color: colors.accent },
          { label: t('today.protein'), value: `${proteinPct}%`, color: colors.green },
          { label: t('today.planReady'), value: currentMeals.length ? t('common.yes') : t('common.no'), color: currentMeals.length ? colors.green : colors.orange },
          { label: t('today.kcalLeft'), value: `${left.kcal}`, color: colors.blue },
        ]}
      />

      {currentSession?.kind === 'long_run' && dailyAdjustment && dailyAdjustment.carbsDelta > 0 ? (
        <MetricCard
          label={t('workout.fuelingTitle')}
          value={`+${Math.round(dailyAdjustment.carbsDelta)}g`}
          detail={t('home.longRunFueling', { carbs: Math.round(dailyAdjustment.carbsDelta) })}
          color={colors.accent}
        />
      ) : null}
    </Screen>
  );
}

function sessionMeta(session: TrainingSession | null, t: (key: TranslationKey) => string): string {
  if (!session || session.kind === 'rest') return t('home.restDay');
  const intensity = session.intensity === 'hard' ? 'RPE 8/10' : session.intensity === 'moderate' ? 'RPE 5/10' : 'RPE 3/10';
  const distance = session.distanceKm ? ` · ${session.distanceKm} km` : '';
  return `${session.title} · ${session.durationMinutes} min · ${intensity}${distance}`;
}

function trainingNote(
  session: TrainingSession | null,
  focus: string | undefined,
  adjustmentNote: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!session || session.kind === 'rest') return t('today.restNote');
  return focus ? `${focus}. ${adjustmentNote ?? ''}`.trim() : adjustmentNote ?? session.notes ?? '';
}

function bandColor(band: 'low' | 'medium' | 'high', palette: { accent: string; orange: string; red: string }): string {
  return band === 'high' ? palette.accent : band === 'medium' ? palette.orange : palette.red;
}

function bandLabel(band: 'low' | 'medium' | 'high', t: (key: TranslationKey) => string): string {
  return band === 'high' ? t('readiness.high') : band === 'medium' ? t('readiness.medium') : t('readiness.low');
}

function formatSleep(minutes?: number): string {
  if (!minutes) return '-';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function downgradeText(from: TrainingSession | null, to: TrainingSession): string {
  return from ? `${from.title} -> ${to.title} (${to.durationMinutes} min)` : to.title;
}

function weeklyCompletion(records: TrainingCompletionRecordMap, selectedDate: string) {
  const base = new Date(selectedDate);
  const day = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day - 1));
  let completed = 0;
  let planned = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const record = records[toDateKey(d)];
    if (record) planned += 1;
    if (record?.status === 'completed') completed += 1;
  }
  return { completed, planned: Math.max(planned, completed) };
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  headerButton: { minHeight: 44, paddingHorizontal: 14 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroCopy: { flex: 1, gap: 5 },
  focusLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  focusValue: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  caution: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  disclaimer: { fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
