import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';
import {
  Button,
  Card,
  CoachInsightCard,
  EmptyState,
  LoadingState,
  MetricCard,
  NutritionTargetCard,
  QuickActionButton,
  RecoveryCard,
  ScoreRing,
  TrainingRecommendationCard,
  WeeklyProgressCard,
} from '../components/UI';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../types';
import type { TrainingCompletionRecordMap, TrainingSession, UserProfile } from '../types';
import { sumFoodLog, toDateKey } from '../utils/nutrition';
import { useDailyHealth } from '../hooks/useDailyHealth';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import { complementarySuggestions } from '../lib/coaching/complementarySuggestions';
import { planForDate, hasCustomSchedule, nextMatchInfo } from '../lib/training';
import type { TranslationKey } from '../lib/i18n';
import { profileSetupCompleteness } from '../lib/onboarding/validation';

export function TodayScreen() {
  const {
    profile,
    currentMacros: macros,
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
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [missedFeedbackVisible, setMissedFeedbackVisible] = useState(false);
  const [tipsDismissed, setTipsDismissed] = useState(false);

  if (!profile || !macros) return null;

  const scope = resolveCoachScope(profile);
  const showNutrition = scopeHasNutrition(scope);
  const showTraining = scopeHasTraining(scope);
  const used = sumFoodLog(currentFoodLog);
  const proteinPct = macros.protein > 0 ? Math.round(Math.min(used.protein / macros.protein, 1) * 100) : 0;
  const suggestedDowngrade = currentSession ? applyReadinessToSession(currentSession, coaching.assessment, locale) : null;
  const readinessColor = rec ? bandColor(rec.readiness.band, colors) : colors.accent;
  const decision = rec ? readinessDecision(rec.readiness.recommendedIntensity, rec.readiness.band, t) : null;
  const trainingMeta = sessionMeta(currentSession, t);
  const trainingDay = Boolean(currentSession && currentSession.kind !== 'rest');
  const week = weeklyCompletion(trainingCompletions, selectedDate);
  const setup = profileSetupCompleteness(profile);
  const customPlan = (showTraining && hasCustomSchedule(profile)) ? planForDate(profile, new Date(selectedDate), {}, locale) : null;
  const weekTips = customPlan
    ? complementarySuggestions({
        mainSport: { id: profile.mainSport?.id, label: profile.mainSport?.label },
        sessions: customPlan.sessions,
        todayISO: selectedDate,
        locale,
      })
    : [];
  const customEmpty = !!customPlan && customPlan.sessions.every(s => s.kind === 'rest');
  const matchInfo = customPlan ? nextMatchInfo(profile.weeklyActivities, selectedDate) : null;

  async function markTodayDone() {
    await mark('completed');
    Alert.alert(t('today.completedTitle'), t('today.completedMsg'));
  }

  async function markSecondDone() {
    await mark('completed', {}, 'second');
    Alert.alert(t('today.completedTitle'), t('today.completedMsg'));
  }

  async function markNoTimeToday() {
    await mark('skipped', { note: t('today.noTimeMsg') });
    setMissedFeedbackVisible(true);
    Alert.alert(t('today.noTimeTitle'), t('today.noTimeMsg'));
  }

  async function handleFatigue() {
    if (suggestedDowngrade?.adjusted) {
      await setTodaySession(suggestedDowngrade.session);
      Alert.alert(t('today.fatigueTitle'), t('today.fatigueAdjustedMsg'));
      return;
    }
    Alert.alert(t('today.fatigueTitle'), t('today.fatigueFallbackMsg'));
    navigation.navigate('Trénink');
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.greeting, { color: colors.accent }]}>{greeting(new Date(), t)}</Text>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>{t('today.headerTitle')}</Text>
          <Text style={[styles.headerMeta, { color: colors.muted }]}>
            {formatFullDate(selectedDate, locale)} · {goalSummary(profile, t)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.profile')}
          hitSlop={10}
          onPress={() => navigation.navigate('Profil')}
          style={({ pressed }) => [
            styles.iconButton,
            { borderColor: colors.border, backgroundColor: colors.bgElev },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="person-circle-outline" size={23} color={colors.accent} />
        </Pressable>
      </View>

      {matchInfo && matchInfo.daysUntil <= 6 ? (
        <View style={styles.matchRow}>
          <View style={[styles.matchChip, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
            <Ionicons name="flag" size={14} color={colors.accent} />
            <Text style={[styles.matchText, { color: colors.accent }]}>
              {matchInfo.daysUntil === 0 ? t('myweek.matchToday') : matchInfo.daysUntil === 1 ? t('myweek.matchTomorrow') : t('myweek.matchInDays', { days: matchInfo.daysUntil })}
            </Text>
          </View>
        </View>
      ) : null}

      {!setup.complete ? (
        <CoachInsightCard title={t('setup.title')} body={t('setup.body', { count: setup.missing.length })} accent={colors.blue}>
          <Button variant="secondary" onPress={() => navigation.navigate('Profil')}>{t('setup.cta')}</Button>
        </CoachInsightCard>
      ) : null}

      {customEmpty ? (
        <CoachInsightCard title={t('myweek.emptyTitle')} body={t('myweek.emptyBody')} accent={colors.accent}>
          <Button variant="secondary" onPress={() => navigation.navigate('MujTyden')}>{t('myweek.openCta')}</Button>
        </CoachInsightCard>
      ) : null}

      {coaching.isLoading && !rec ? (
        <LoadingState title={t('today.loadingCoachTitle')} body={t('today.loadingCoachBody')} />
      ) : null}

      {!coaching.isLoading && !rec ? (
        <EmptyState title={t('today.emptyCoachTitle')} body={t('today.emptyCoachBody')} />
      ) : null}

      {rec ? (
        <Card style={[styles.heroCard, { borderColor: readinessColor }]}>
          <View style={styles.heroBody}>
            <ScoreRing score={rec.readiness.score} label={bandLabel(rec.readiness.band, t)} color={readinessColor} size={126} />
            <View style={styles.heroCopy}>
              <Text style={[styles.focusLabel, { color: readinessColor }]}>{decision?.label ?? t('today.oneThing')}</Text>
              <Text style={[styles.focusValue, { color: colors.ink }]}>{decision ? decision.title : rec.headline}</Text>
              <Text style={[styles.coachNote, { color: colors.muted }]}>{rec.coachNote}</Text>
              {decision?.hint ? <Text style={[styles.decisionHint, { color: colors.muted }]}>{decision.hint}</Text> : null}
              {rec.training?.whatNotToDo ? (
                <Text style={[styles.caution, { color: colors.orange }]}>{rec.training.whatNotToDo}</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.todayFocus, { borderTopColor: colors.border }]}>
            <Text style={[styles.todayFocusLabel, { color: colors.faint }]}>{t('today.focus')}</Text>
            <Text style={[styles.todayFocusText, { color: colors.ink }]}>{rec.training?.focus ?? rec.headline}</Text>
          </View>
          <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('today.readinessNote')}</Text>
        </Card>
      ) : null}

      {showNutrition && (
        <>
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
            dayLabel={trainingDay ? t('today.trainingDay') : t('today.restDayLabel')}
            reason={rec?.nutrition?.reason ?? dailyAdjustment?.note}
          />
        </>
      )}

      {showTraining && (
        <TrainingRecommendationCard
          title={t('today.trainingTitle')}
          meta={trainingMeta}
          note={trainingNote(currentSession, rec?.training?.focus, dailyAdjustment?.note, t)}
          intensity={intensityLabel(currentSession, t)}
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
        status={recoveryStatus(rec?.readiness.recommendedIntensity, t)}
        metrics={[
          { label: t('home.sleep'), value: formatSleep(health.sleep?.totalMinutes), color: colors.ink },
          { label: t('home.restingHr'), value: health.restingHeartRate?.bpm ? `${health.restingHeartRate.bpm}` : '-', color: colors.ink },
          { label: 'ACWR', value: coaching.trainingLoad?.acwr == null ? '-' : coaching.trainingLoad.acwr.toFixed(2), color: colors.ink },
          { label: 'Strain', value: coaching.strain ? coaching.strain.score.toFixed(1) : '-', color: colors.ink },
        ]}
        recommendation={coaching.assessment?.recommendation ?? t('today.recoveryFallback')}
      />

      {weekTips.length > 0 && !tipsDismissed ? (
        <CoachInsightCard title={t('myweek.tipsTitle')} body={weekTips.map(tip => '• ' + tip).join('\n')} accent={colors.accent}>
          <Button variant="secondary" onPress={() => setTipsDismissed(true)}>{t('myweek.tipsDismiss')}</Button>
        </CoachInsightCard>
      ) : null}

      <View style={styles.quickGrid}>
        <QuickActionButton icon="pulse-outline" label={t('today.checkIn')} onPress={() => setShowCheckIn(true)} />
        {showTraining && currentSession?.kind !== 'rest' ? (
          currentSession?.second ? (
            <>
              <QuickActionButton icon="checkmark-circle-outline" label={t('today.amDone')} onPress={markTodayDone} disabled={completion?.status === 'completed'} />
              <QuickActionButton icon="checkmark-done-outline" label={t('today.pmDone')} onPress={markSecondDone} disabled={completion?.secondStatus === 'completed'} />
            </>
          ) : (
            <QuickActionButton icon="checkmark-circle-outline" label={t('today.workoutDone')} onPress={markTodayDone} disabled={completion?.status === 'completed'} />
          )
        ) : null}
        {showTraining && currentSession?.kind !== 'rest' ? (
          <QuickActionButton icon="time-outline" label={t('today.noTime')} onPress={markNoTimeToday} disabled={completion?.status === 'completed' || completion?.status === 'skipped'} />
        ) : null}
        {showNutrition ? <QuickActionButton icon="restaurant-outline" label={t('today.simpleMeal')} onPress={() => navigation.navigate('Jídelníček')} /> : null}
        <QuickActionButton icon="bed-outline" label={t('today.fatigued')} onPress={handleFatigue} />
      </View>

      {showTraining && (missedFeedbackVisible || completion?.status === 'skipped') ? (
        <CoachInsightCard title={t('today.missedAdjustedTitle')} body={t('today.missedAdjustedBody')} accent={colors.orange}>
          <Button variant="secondary" onPress={() => navigation.navigate('Trénink')}>{t('today.openTraining')}</Button>
        </CoachInsightCard>
      ) : null}

      <WeeklyProgressCard
        title={t('today.weekTitle')}
        items={[
          { label: t('today.sessions'), value: `${week.completed}/${week.planned}`, color: colors.accent },
          { label: t('today.skipped'), value: String(week.skipped), color: week.skipped ? colors.orange : colors.faint },
          { label: t('today.protein'), value: `${proteinPct}%`, color: colors.green },
          { label: t('today.planAdherence'), value: currentMeals.length ? t('common.yes') : t('common.no'), color: currentMeals.length ? colors.green : colors.orange },
          { label: t('today.nextCheckIn'), value: nextCheckInLabel(selectedDate, locale), color: colors.blue },
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
      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function sessionMeta(session: TrainingSession | null, t: (key: TranslationKey) => string): string {
  if (!session || session.kind === 'rest') return t('today.restMeta');
  const kindLabel = t(`wkindFull.${session.kind}` as TranslationKey) || session.kind;
  const rpe = session.intensity === 'hard' ? 'RPE 8/10' : session.intensity === 'moderate' ? 'RPE 6/10' : 'RPE 4/10';
  const base = `${kindLabel} · ${session.durationMinutes} min · ${rpe}`;
  if (session.second) {
    const secondLabel = t(`wkindFull.${session.second.kind}` as TranslationKey) || session.second.kind;
    return `${base}  +  ${secondLabel} · ${session.second.durationMinutes} min`;
  }
  return base;
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

function readinessDecision(
  intensity: 'rest' | 'easy' | 'moderate' | 'hard',
  band: 'low' | 'medium' | 'high',
  t: (key: TranslationKey) => string,
) {
  if (intensity === 'rest' || band === 'low') {
    return {
      title: t('today.decisionRecover'),
      label: t('today.decisionRecoverLabel'),
      hint: t('today.decisionRecoverHint'),
    };
  }
  if (intensity === 'hard' && band === 'high') {
    return {
      title: t('today.decisionPush'),
      label: t('today.decisionPushLabel'),
      hint: t('today.decisionPushHint'),
    };
  }
  return {
    title: t('today.decisionHold'),
    label: t('today.decisionHoldLabel'),
    hint: t('today.decisionHoldHint'),
  };
}

function formatSleep(minutes?: number): string {
  if (!minutes) return '-';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatFullDate(dateKey: string, locale: 'cs' | 'en'): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'cs-CZ', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function greeting(date: Date, t: (key: TranslationKey) => string): string {
  const hour = date.getHours();
  if (hour < 11) return t('today.greetingMorning');
  if (hour < 17) return t('today.greetingAfternoon');
  return t('today.greetingEvening');
}

function goalSummary(profile: UserProfile, t: (key: TranslationKey) => string): string {
  if (profile.goalProfile?.summary) return profile.goalProfile.summary;
  return t(`goal.${profile.primaryGoal}` as TranslationKey);
}

function intensityLabel(session: TrainingSession | null, t: (key: TranslationKey) => string): string {
  if (!session || session.kind === 'rest') return t('today.restDayLabel');
  if (session.intensity === 'hard') return 'RPE 8';
  if (session.intensity === 'moderate') return 'RPE 5';
  return 'RPE 3';
}

function recoveryStatus(intensity: 'rest' | 'easy' | 'moderate' | 'hard' | undefined, t: (key: TranslationKey) => string): string {
  if (intensity === 'rest') return t('today.recoveryStatusRecover');
  if (intensity === 'easy') return t('today.recoveryStatusEasy');
  return t('today.recoveryStatusWatch');
}

function nextCheckInLabel(dateKey: string, locale: 'cs' | 'en'): string {
  const base = new Date(`${dateKey}T12:00:00`);
  const day = base.getDay();
  const daysUntilSunday = (7 - day) % 7;
  const checkIn = new Date(base);
  checkIn.setDate(base.getDate() + daysUntilSunday);
  return checkIn.toLocaleDateString(locale === 'en' ? 'en-US' : 'cs-CZ', { weekday: 'short' });
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
  let skipped = 0;
  let planned = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const record = records[toDateKey(d)];
    if (record) planned += 1;
    if (record?.status === 'completed') completed += 1;
    if (record?.status === 'skipped') skipped += 1;
  }
  return { completed, skipped, planned: Math.max(planned, completed + skipped) };
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 3 },
  greeting: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerTitle: { fontSize: 30, lineHeight: 36, fontWeight: '900' },
  headerMeta: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  iconButton: { width: 46, height: 46, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  matchRow: { flexDirection: 'row', marginBottom: 2 },
  matchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  matchText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.3 },
  heroCard: { gap: 14 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroCopy: { flex: 1, gap: 5 },
  focusLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  focusValue: { fontSize: 20, lineHeight: 25, fontWeight: '900' },
  coachNote: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  decisionHint: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  caution: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  todayFocus: { borderTopWidth: 1, paddingTop: 12, gap: 3 },
  todayFocusLabel: { fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  todayFocusText: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  disclaimer: { fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
