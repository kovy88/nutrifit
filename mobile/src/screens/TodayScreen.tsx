import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';
import {
  ActionIconButton,
  Button,
  CoachInsightCard,
  CollapsibleDetails,
  Divider,
  EmptyState,
  LoadingState,
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
import { toDateKey } from '../utils/nutrition';
import { useDailyHealth } from '../hooks/useDailyHealth';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import { complementarySuggestions } from '../lib/coaching/complementarySuggestions';
import { planForDate, hasCustomSchedule, nextMatchInfo } from '../lib/training';
import type { TranslationKey } from '../lib/i18n';
import { profileSetupCompleteness } from '../lib/onboarding/validation';
import { useMorningBriefingSchedule } from '../hooks/useMorningBriefingSchedule';
import { useRatingPrompt } from '../hooks/useRatingPrompt';

export function TodayScreen() {
  const {
    profile,
    currentMacros: macros,
    currentSession,
    dailyAdjustment,
    currentMeals,
    selectedDate,
    setTodaySession,
    trainingCompletions,
    logStreak,
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
  const [deviceNudgeDismissed, setDeviceNudgeDismissed] = useState(false);
  const [notifNudgeDismissed, setNotifNudgeDismissed] = useState(false);
  const briefing = useMorningBriefingSchedule();
  useRatingPrompt(logStreak ?? 0);

  if (!profile || !macros) return null;

  const scope = resolveCoachScope(profile);
  const showNutrition = scopeHasNutrition(scope);
  const showTraining = scopeHasTraining(scope);
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

  const trainingActive = Boolean(currentSession && currentSession.kind !== 'rest');
  const trainingCompleted = completion?.status === 'completed';
  const trainingSkipped = completion?.status === 'skipped';
  const showFueling = currentSession?.kind === 'long_run' && !!dailyAdjustment && dailyAdjustment.carbsDelta > 0;

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

  // One prioritized nudge — at most a single card/chip, instead of stacking every
  // conditional. Order: setup → device → match → empty week → readiness downgrade → missed → tips.
  const nudge = (() => {
    if (!setup.complete) {
      return (
        <CoachInsightCard title={t('setup.title')} body={t('setup.body', { count: setup.missing.length })} accent={colors.blue}>
          <Button variant="secondary" onPress={() => navigation.navigate('Profil')}>{t('setup.cta')}</Button>
        </CoachInsightCard>
      );
    }
    if (health.isEmpty && !deviceNudgeDismissed) {
      return (
        <CoachInsightCard title={t('today.deviceNudgeTitle')} body={t('today.deviceNudgeBody')} accent={colors.blue}>
          <View style={styles.trainingActionRow}>
            <Button style={styles.actionButton} onPress={() => navigation.navigate('Settings')}>{t('today.deviceNudgeCta')}</Button>
            <Button style={styles.actionButton} variant="secondary" onPress={() => setDeviceNudgeDismissed(true)}>{t('common.close')}</Button>
          </View>
        </CoachInsightCard>
      );
    }
    if (briefing.isReady && briefing.permission === 'undetermined' && !notifNudgeDismissed) {
      return (
        <CoachInsightCard title={t('today.notifNudgeTitle')} body={t('today.notifNudgeBody')} accent={colors.accent}>
          <View style={styles.trainingActionRow}>
            <Button style={styles.actionButton} onPress={async () => { await briefing.requestPermission(); setNotifNudgeDismissed(true); }}>{t('today.notifNudgeCta')}</Button>
            <Button style={styles.actionButton} variant="secondary" onPress={() => setNotifNudgeDismissed(true)}>{t('common.skip')}</Button>
          </View>
        </CoachInsightCard>
      );
    }
    if (matchInfo && matchInfo.daysUntil <= 6) {
      const label = matchInfo.daysUntil === 0 ? t('myweek.matchToday') : matchInfo.daysUntil === 1 ? t('myweek.matchTomorrow') : t('myweek.matchInDays', { days: matchInfo.daysUntil });
      return (
        <View style={styles.nudgeChipRow}>
          <View style={[styles.matchChip, { borderColor: colors.accent, backgroundColor: colors.accent + '14' }]}>
            <Ionicons name="flag" size={14} color={colors.accent} />
            <Text style={[styles.matchText, { color: colors.accent }]}>{label}</Text>
          </View>
        </View>
      );
    }
    if (customEmpty) {
      return (
        <CoachInsightCard title={t('myweek.emptyTitle')} body={t('myweek.emptyBody')} accent={colors.accent}>
          <Button variant="secondary" onPress={() => navigation.navigate('MujTyden')}>{t('myweek.openCta')}</Button>
        </CoachInsightCard>
      );
    }
    if (suggestedDowngrade?.adjusted) {
      return (
        <CoachInsightCard title={t('readiness.planAdjust')} body={downgradeText(currentSession, suggestedDowngrade.session)}>
          <Button onPress={() => setTodaySession(suggestedDowngrade.session)}>{t('readiness.adjustToday')}</Button>
        </CoachInsightCard>
      );
    }
    if (showTraining && (missedFeedbackVisible || trainingSkipped)) {
      return (
        <CoachInsightCard title={t('today.missedAdjustedTitle')} body={t('today.missedAdjustedBody')} accent={colors.orange}>
          <Button variant="secondary" onPress={() => navigation.navigate('Trénink')}>{t('today.openTraining')}</Button>
        </CoachInsightCard>
      );
    }
    if (weekTips.length > 0 && !tipsDismissed) {
      return (
        <CoachInsightCard title={t('myweek.tipsTitle')} body={weekTips.map(tip => '• ' + tip).join('\n')} accent={colors.accent}>
          <Button variant="secondary" onPress={() => setTipsDismissed(true)}>{t('myweek.tipsDismiss')}</Button>
        </CoachInsightCard>
      );
    }
    return null;
  })();

  async function shareToday() {
    if (!rec) return;
    const message = t('today.shareText', {
      score: rec.readiness.score,
      band: bandLabel(rec.readiness.band, t),
      headline: rec.headline,
    });
    await Share.share({ message });
  }

  async function shareStreak() {
    if (logStreak < 7) return;
    await Share.share({ message: t('today.streakShareText', { days: logStreak }) });
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      {/* 1 — Compact header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.greeting, { color: colors.muted }]}>{greeting(new Date(), t)}</Text>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>{t('today.headerTitle')}</Text>
          <Text style={[styles.headerMeta, { color: colors.muted }]}>{formatFullDate(selectedDate, locale)}</Text>
        </View>
        <View style={styles.headerActions}>
          {rec ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('a11y.share')}
              hitSlop={10}
              onPress={shareToday}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="share-outline" size={22} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.profile')}
            hitSlop={10}
            onPress={() => navigation.navigate('Profil')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-circle-outline" size={24} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      {logStreak >= 2 ? (
        <Pressable
          onPress={logStreak >= 7 ? shareStreak : undefined}
          style={[styles.streakChip, { borderColor: colors.orange, backgroundColor: colors.orange + '18' }]}
          accessibilityRole={logStreak >= 7 ? 'button' : undefined}
          accessibilityLabel={logStreak >= 7 ? t('today.streakShareText', { days: logStreak }) : undefined}
        >
          <Ionicons name="flame" size={13} color={colors.orange} />
          <Text style={[styles.streakText, { color: colors.orange }]}>{t('today.streak', { days: logStreak })}</Text>
          {logStreak >= 7 ? <Ionicons name="share-outline" size={11} color={colors.orange} style={{ marginLeft: 2 }} /> : null}
        </Pressable>
      ) : null}

      {/* 2 — Single prioritized nudge */}
      {nudge}

      {/* Coach loading / empty */}
      {coaching.isLoading && !rec ? (
        <LoadingState title={t('today.loadingCoachTitle')} body={t('today.loadingCoachBody')} />
      ) : null}
      {!coaching.isLoading && !rec ? (
        <EmptyState title={t('today.emptyCoachTitle')} body={t('today.emptyCoachBody')} />
      ) : null}

      {/* 3 — Readiness hero: centered ring, decision below, "why" behind a tap */}
      {rec ? (
        <View style={styles.heroSection}>
          <ScoreRing score={rec.readiness.score} label={bandLabel(rec.readiness.band, t)} color={readinessColor} size={128} />
          <View style={styles.heroDecision}>
            <Text style={[styles.focusLabel, { color: readinessColor }]}>{decision?.label ?? t('today.oneThing')}</Text>
            <Text style={[styles.focusValue, { color: colors.ink }]}>{decision ? decision.title : rec.headline}</Text>
            {rec.training?.focus ? <Text style={[styles.heroFocus, { color: colors.muted }]} numberOfLines={2}>{rec.training.focus}</Text> : null}
          </View>
          <CollapsibleDetails label={t('today.whyLabel')}>
            <Text style={[styles.coachNote, { color: colors.muted }]}>{rec.coachNote}</Text>
            {decision?.hint ? <Text style={[styles.decisionHint, { color: colors.muted }]}>{decision.hint}</Text> : null}
            {rec.training?.whatNotToDo ? <Text style={[styles.caution, { color: colors.orange }]}>{rec.training.whatNotToDo}</Text> : null}
            <Text style={[styles.disclaimer, { color: colors.faint }]}>{t('today.readinessNote')}</Text>
          </CollapsibleDetails>
        </View>
      ) : null}

      <Divider />

      {/* 4 — Training: one card, one CTA, secondary actions folded in */}
      {showTraining ? (
        <TrainingRecommendationCard
          title={t('today.trainingTitle')}
          meta={trainingMeta}
          note={trainingNote(currentSession, dailyAdjustment?.note, t)}
          intensity={intensityLabel(currentSession, t)}
          cta={trainingCompleted ? t('today.completed') : currentSession?.second ? t('today.amDone') : t('today.markDone')}
          completed={trainingCompleted}
          onPress={trainingActive ? markTodayDone : undefined}
        >
          {trainingActive && (currentSession?.second || (!trainingCompleted && !trainingSkipped) || showFueling) ? (
            <View style={styles.trainingExtras}>
              {currentSession?.second || (!trainingCompleted && !trainingSkipped) ? (
                <View style={styles.trainingActionRow}>
                  {currentSession?.second ? (
                    <ActionIconButton icon="checkmark-done-outline" label={t('today.pmDone')} onPress={markSecondDone} disabled={completion?.secondStatus === 'completed'} />
                  ) : null}
                  {!trainingCompleted && !trainingSkipped ? (
                    <ActionIconButton icon="time-outline" label={t('today.noTime')} onPress={markNoTimeToday} />
                  ) : null}
                </View>
              ) : null}
              {showFueling ? (
                <Text style={[styles.fuelLine, { color: colors.accent }]}>
                  {t('home.longRunFueling', { carbs: Math.round(dailyAdjustment!.carbsDelta) })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </TrainingRecommendationCard>
      ) : null}

      {showTraining ? <Divider /> : null}

      {/* 5 — Nutrition: kcal + macros */}
      {showNutrition ? (
        <NutritionTargetCard
          label={t('today.nutritionTitle')}
          kcal={macros.kcal}
          protein={macros.protein}
          carbs={macros.carbs}
          fat={macros.fat}
          macroLabels={{ kcal: 'kcal', protein: t('home.protein'), carbs: t('home.carbs'), fat: t('home.fat') }}
          dayLabel={trainingDay ? t('today.trainingDay') : t('today.restDayLabel')}
          reason={rec?.nutrition?.reason ?? dailyAdjustment?.note}
        />
      ) : null}

      {showNutrition ? <Divider /> : null}

      {/* 6 — Recovery: inline metrics, recommendation behind a tap */}
      <RecoveryCard
        title={t('today.recoveryTitle')}
        status={recoveryStatus(rec?.readiness.recommendedIntensity, t)}
        detailsLabel={t('today.whyLabel')}
        metrics={[
          { label: t('home.sleep'), value: formatSleep(health.sleep?.totalMinutes), color: colors.ink },
          { label: t('home.restingHr'), value: health.restingHeartRate?.bpm ? `${health.restingHeartRate.bpm}` : '-', color: colors.ink },
          { label: 'ACWR', value: coaching.trainingLoad?.acwr == null ? '-' : coaching.trainingLoad.acwr.toFixed(2), color: colors.ink },
          { label: 'Strain', value: coaching.strain ? coaching.strain.score.toFixed(1) : '-', color: colors.ink },
        ]}
        recommendation={coaching.assessment?.recommendation ?? t('today.recoveryFallback')}
      />

      <Divider />

      {/* 7 — Quick actions (max 4) */}
      <View style={styles.quickGrid}>
        <QuickActionButton icon="pulse-outline" label={t('today.checkIn')} onPress={() => setShowCheckIn(true)} />
        {showNutrition ? <QuickActionButton icon="restaurant-outline" label={t('today.simpleMeal')} onPress={() => navigation.navigate('Jídelníček')} /> : null}
        {showTraining ? <QuickActionButton icon="bed-outline" label={t('today.fatigued')} onPress={handleFatigue} /> : null}
      </View>

      <Divider />

      {/* 8 — Weekly mini progress (3 metrics) */}
      <WeeklyProgressCard
        title={t('today.weekTitle')}
        items={[
          { label: t('today.sessions'), value: `${week.completed}/${week.planned}`, color: colors.accent },
          { label: t('today.planAdherence'), value: currentMeals.length ? t('common.yes') : t('common.no'), color: currentMeals.length ? colors.green : colors.orange },
          { label: t('today.nextCheckIn'), value: nextCheckInLabel(selectedDate, locale), color: colors.blue },
        ]}
      />

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
  adjustmentNote: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!session || session.kind === 'rest') return t('today.restNote');
  return adjustmentNote ?? session.notes ?? '';
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
  screen: { gap: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 3 },
  greeting: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  headerTitle: { fontSize: 22, lineHeight: 27, fontWeight: '700' },
  headerMeta: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  streakText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  nudgeChipRow: { flexDirection: 'row' },
  matchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  matchText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 },
  heroSection: { alignItems: 'center', gap: 12 },
  heroDecision: { alignItems: 'center', gap: 4 },
  heroFocus: { fontSize: 13, lineHeight: 18, fontWeight: '400', textAlign: 'center' },
  focusLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  focusValue: { fontSize: 18, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  coachNote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  decisionHint: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  caution: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  disclaimer: { fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  trainingExtras: { gap: 10, marginTop: 2 },
  trainingActionRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1 },
  fuelLine: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
