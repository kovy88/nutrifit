import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';
import { EmptyState, LoadingState, RecoveryCard } from '../components/UI';
import { MacroRing } from '../components/MacroRing';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../types';
import type { TrainingSession, UserProfile } from '../types';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { planSessionForDate } from '../lib/training';
import { formatGoalProfileSummary } from '../lib/onboarding/goal-summary-labels';
import type { Translate, TranslationKey } from '../lib/i18n';
import type { DailyCoachRecommendation } from '../types/coach';
import { dayDecision } from '../lib/coaching/dayDecision';

export function TodayScreen() {
  const {
    profile,
    currentMacros: macros,
    currentSession,
    selectedDate,
    logStreak,
  } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { completion, mark } = useTrainingCompletion();
  const { recommendation: rec, coaching } = useDailyCoachRecommendation(new Date(selectedDate));
  const [showCheckIn, setShowCheckIn] = useState(false);

  if (!profile || !macros) return null;

  const scope = resolveCoachScope(profile);
  const showNutrition = scopeHasNutrition(scope);
  const showTraining = scopeHasTraining(scope);
  const trainingDay = Boolean(currentSession && currentSession.kind !== 'rest');
  const readinessColor = rec ? bandColor(rec.readiness.band, colors) : colors.accent;
  const decision = rec ? dayDecision(rec, !trainingDay, t) : null;
  const tomorrow = tomorrowSession(profile, selectedDate, locale, t);

  const trainingCompleted = completion?.status === 'completed';

  async function markTodayDone() {
    await mark('completed');
    Alert.alert(t('today.completedTitle'), t('today.completedMsg'));
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

      {coaching.isLoading && !rec ? (
        <LoadingState title={t('today.loadingCoachTitle')} body={todayLoadingBody(t)} />
      ) : null}
      {!coaching.isLoading && !rec ? (
        <EmptyState title={t('today.emptyCoachTitle')} body={t('today.emptyCoachBody')} />
      ) : null}

      {rec ? (
        <>
          <View style={styles.ringHero}>
            <MacroRing size={172} strokeWidth={14} progress={rec.readiness.score / 100} color={readinessColor} backgroundColor={colors.bgElev} glow>
              <Text style={[styles.ringEyebrow, { color: readinessColor }]}>{decision?.label ?? rec.headline}</Text>
              <Text style={[styles.ringScore, { color: colors.ink }]}>{rec.readiness.score}%</Text>
              <Text style={[styles.ringCaption, { color: colors.faint }]}>{readinessCaption(t)}</Text>
            </MacroRing>
            <Text style={[styles.ringSummary, { color: colors.muted }]}>
              {decision?.title ?? rec.headline}. {todayHeroBody(rec, t)}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <QuickAction
              icon={trainingDay ? 'checkmark-circle-outline' : 'pulse-outline'}
              label={trainingDay ? (trainingCompleted ? t('today.completed') : t('today.markDone')) : t('today.checkIn')}
              onPress={trainingDay ? markTodayDone : () => setShowCheckIn(true)}
              disabled={trainingDay && trainingCompleted}
              primary
            />
            {trainingDay ? (
              <QuickAction icon="pulse-outline" label={t('today.checkIn')} onPress={() => setShowCheckIn(true)} />
            ) : null}
          </View>

          <View style={[styles.rowList, { borderColor: colors.hairline }]}>
            {showTraining ? (
              <MetricRow
                icon="walk-outline"
                iconColor={colors.accent}
                label={t('today.trainingTitle')}
                value={trainingSummary(rec.training?.session ?? currentSession, t)}
                detail={trainingDetail(rec.training?.session ?? currentSession, rec.training?.whatNotToDo, t)}
                onPress={() => navigation.navigate('Trénink')}
              />
            ) : null}

            {showNutrition && rec.nutrition ? (
              <MetricRow
                icon="restaurant-outline"
                iconColor={colors.orange}
                label={t('today.nutritionTitle')}
                // Same shape as the training row above: the concrete number in
                // the value slot, the coaching sentence as its detail. `macros`
                // is already loaded here (the screen won't render without it).
                value={t('today.macroTargets', { kcal: macros.kcal, p: macros.protein })}
                detail={nutritionGuidance(rec, trainingDay, t)}
                onPress={() => navigation.navigate('Jídelníček')}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={foodPhotoCta(t)}
                    hitSlop={8}
                    onPress={() => navigation.navigate('Foto')}
                    style={({ pressed }) => [styles.rowIconButton, { borderColor: colors.hairline }, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="camera-outline" size={16} color={colors.muted} />
                  </Pressable>
                }
              />
            ) : null}

            <MetricRow
              icon="calendar-outline"
              iconColor={colors.blue}
              label={t('today.tomorrowLabel')}
              value={tomorrow.title}
              detail={tomorrow.body}
              last
            />
          </View>

          <RecoveryCard
            title={t('today.recoveryTitle')}
            status={recoveryStatus(rec.readiness.recommendedIntensity, t)}
            detailsLabel={t('today.whyLabel')}
            metrics={[
              { label: t('home.sleep'), value: formatSleep(coaching.today.sleepMinutes) },
              { label: t('home.restingHr'), value: coaching.today.rhrBpm != null ? `${coaching.today.rhrBpm}` : '-' },
              { label: t('home.hrv'), value: coaching.today.hrvMs != null ? `${coaching.today.hrvMs}` : '-' },
            ]}
            recommendation={coaching.assessment?.recommendation ?? t('today.recoveryFallback')}
          />

          {logStreak >= 2 ? (
            <View style={[styles.streakChip, { borderColor: colors.orange, backgroundColor: colors.orange + '16' }]}>
              <Ionicons name="flame" size={14} color={colors.orange} />
              <Text style={[styles.streakText, { color: colors.orange }]}>{t('today.streak', { days: logStreak })}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        primary
          ? { backgroundColor: colors.accent }
          : { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, backgroundColor: colors.bgElev },
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.86, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Ionicons name={icon} size={17} color={primary ? colors.accentText : colors.accent} />
      <Text style={[styles.quickActionText, { color: primary ? colors.accentText : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function MetricRow({
  icon,
  iconColor,
  label,
  value,
  detail,
  onPress,
  trailing,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  detail?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: colors.bgElev }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowLabel, { color: colors.faint }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.rowValue, { color: colors.ink }]}>{value}</Text>
        {detail ? <Text numberOfLines={1} style={[styles.rowDetail, { color: colors.muted }]}>{detail}</Text> : null}
      </View>
    </>
  );
  return (
    <View
      style={[
        styles.metricRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
      ]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.metricRowMain, pressed && { opacity: 0.75 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.metricRowMain}>{content}</View>
      )}
      {trailing}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
    </View>
  );
}

function readinessCaption(t: Translate): string {
  return t('today.readinessCaption');
}

function bandColor(band: 'low' | 'medium' | 'high', palette: { accent: string; orange: string; red: string }): string {
  return band === 'high' ? palette.accent : band === 'medium' ? palette.orange : palette.red;
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

function goalSummary(profile: UserProfile, t: Translate): string {
  if (profile.goalProfile) return formatGoalProfileSummary(profile.goalProfile, t);
  return t(`goal.${profile.primaryGoal}` as TranslationKey);
}

function trainingSummary(session: TrainingSession | null | undefined, t: (key: TranslationKey) => string): string {
  if (!session || session.kind === 'rest') return t('today.restDayLabel');
  return titleWithOptionalDuration(session);
}

function trainingDetail(
  session: TrainingSession | null | undefined,
  whatNotToDo: string | undefined,
  t: Translate,
): string {
  if (!session || session.kind === 'rest') return t('today.restNote');
  if (whatNotToDo) return t('today.detailKeepClean');
  switch (session.kind) {
    case 'easy_run':
    case 'recovery_run':
    case 'recovery_walk':
      return t('today.detailConversational');
    case 'long_run':
      return t('today.detailLongRun');
    case 'tempo':
    case 'intervals':
      return t('today.detailQuality');
    case 'strength':
      return t('today.detailStrength');
    case 'mobility':
    case 'recovery':
      return t('today.detailMobility');
    case 'race':
    case 'match':
      return t('today.detailRace');
    default:
      return t('today.detailDefault');
  }
}

function formatSleep(minutes: number | null): string {
  if (!minutes) return '-';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function recoveryStatus(
  intensity: 'rest' | 'easy' | 'moderate' | 'hard' | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (intensity === 'rest') return t('today.recoveryStatusRecover');
  if (intensity === 'easy') return t('today.recoveryStatusEasy');
  return t('today.recoveryStatusWatch');
}

function todayLoadingBody(t: Translate): string {
  return t('today.loadingBody');
}

function todayHeroBody(rec: DailyCoachRecommendation, t: Translate): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return t('today.heroRecover');
  }
  if (rec.readiness.recommendedIntensity === 'hard') return t('today.heroHard');
  if (rec.readiness.recommendedIntensity === 'easy') return t('today.heroEasy');
  return t('today.heroSteady');
}

function nutritionGuidance(rec: DailyCoachRecommendation, trainingDay: boolean, t: Translate): string {
  const reason = rec.nutrition?.reason ?? '';
  const delta = rec.nutrition?.deltaVsBaselineKcal ?? 0;
  if (trainingDay && delta > 0) return t('today.fuelAroundWorkout');
  if (delta < 0) return t('today.eatLighter');
  if (reason.toLowerCase().includes('training')) return t('today.carbsNearTraining');
  return t('today.steadyMeals');
}

function foodPhotoCta(t: Translate): string {
  return t('today.logMealPhoto');
}

/** `locale` stays: planSessionForDate localizes the session title itself. The
 *  returned title no longer carries a "Tomorrow: " prefix — the row renders it
 *  under a real "Tomorrow" label instead of stuffing it into one. */
function tomorrowSession(profile: UserProfile, selectedDate: string, locale: 'cs' | 'en', t: Translate) {
  const date = new Date(`${selectedDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  const session = planSessionForDate(profile, date, {}, locale);
  const body = t('today.tomorrowCheckIn');
  if (!session || session.kind === 'rest') {
    return { title: t('today.tomorrowRestTitle'), body };
  }
  return { title: titleWithOptionalDuration(session), body };
}

function titleWithOptionalDuration(session: TrainingSession): string {
  const title = session.title.trim();
  return titleHasDuration(title) ? title : `${title} · ${session.durationMinutes} min`;
}

function titleHasDuration(title: string): boolean {
  return /\b\d+\s*(min|mins|minutes|minut|m)\b/i.test(title);
}

const styles = StyleSheet.create({
  screen: { gap: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 3 },
  greeting: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  headerTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  headerMeta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  iconButton: { width: 46, height: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ringHero: { alignItems: 'center', paddingVertical: 8, gap: 16 },
  ringEyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  ringScore: { fontSize: 34, lineHeight: 40, fontWeight: '800', marginTop: 2 },
  ringCaption: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  ringSummary: { fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center', maxWidth: 300 },
  actionRow: { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  quickActionText: { fontSize: 13.5, fontWeight: '700' },
  rowList: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  metricRowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.2 },
  rowValue: { fontSize: 14.5, lineHeight: 19, fontWeight: '700' },
  rowDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  rowIconButton: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  streakChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2 },
  streakText: { fontSize: 12.5, fontWeight: '600' },
});
