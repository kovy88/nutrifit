import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { WeeklyCheckInModal } from '../components/WeeklyCheckInModal';
import { Button, EmptyState, LoadingState } from '../components/UI';
import { ActionStrip, CollapsibleDetails, HeroDecisionCard, InfoRow, SectionCard } from '../components/SimpleUX';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../types';
import type { TrainingSession, UserProfile } from '../types';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { planSessionForDate } from '../lib/training';
import type { TranslationKey } from '../lib/i18n';
import type { DailyCoachRecommendation } from '../types/coach';

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
  const decision = rec ? readinessDecision(rec.readiness.recommendedIntensity, rec.readiness.band, t) : null;
  const tomorrow = tomorrowSession(profile, selectedDate, locale);

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
        <LoadingState title={t('today.loadingCoachTitle')} body={t('today.loadingCoachBody')} />
      ) : null}

      {!coaching.isLoading && !rec ? (
        <EmptyState title={t('today.emptyCoachTitle')} body={t('today.emptyCoachBody')} />
      ) : null}

      {rec ? (
        <>
          <HeroDecisionCard
            eyebrow={decision?.label ?? t('today.oneThing')}
            title={decision?.title ?? rec.headline}
            body={todayHeroBody(rec, locale)}
            accent={readinessColor}
            statusLabel={bandLabel(rec.readiness.band, t)}
            statusTone={rec.readiness.band === 'high' ? 'ready' : rec.readiness.band === 'medium' ? 'caution' : 'risk'}
          >
            {decision?.hint ? <Text style={[styles.smallNote, { color: colors.faint }]}>{decision.hint}</Text> : null}
          </HeroDecisionCard>

          <TodayActionCard
            rec={rec}
            trainingDay={trainingDay}
            completed={completion?.status === 'completed'}
            onCheckIn={() => setShowCheckIn(true)}
            onDone={markTodayDone}
            onAdjust={() => navigation.navigate('Trénink')}
            t={t}
          />

          {showTraining ? (
            <SimpleSection
              title={t('today.trainingTitle')}
              primary={trainingSummary(rec.training?.session ?? currentSession, t)}
              secondary={trainingDetail(rec.training?.session ?? currentSession, rec.training?.focus, rec.training?.whatNotToDo, t)}
              cta={t('today.adjustToday')}
              onPress={() => navigation.navigate('Trénink')}
            />
          ) : null}

          {showNutrition && rec.nutrition ? (
            <SectionCard
              title={t('today.nutritionTitle')}
              body={nutritionGuidance(rec, trainingDay, locale)}
              ctaLabel={t('today.meals')}
              onPress={() => navigation.navigate('Jídelníček')}
            >
              <CollapsibleDetails label={t('plan.detail')}>
                <InfoRow label={nutritionEnergyLabel(locale)} value={rec.nutrition.targets.kcal} />
                <InfoRow label={t('home.protein')} value={`${rec.nutrition.targets.protein} g`} />
                <Button variant="secondary" onPress={() => navigation.navigate('Foto')}>{foodPhotoCta(locale)}</Button>
              </CollapsibleDetails>
            </SectionCard>
          ) : null}

          <SectionCard
            title={t('today.focus')}
            body={todayWhyLines(rec, locale)}
            ctaLabel={t('tab.coach')}
            onPress={() => navigation.navigate('Coach')}
          >
            <CollapsibleDetails label={t('plan.detail')}>
              {whyLines(rec, locale).map((line, index) => (
                <Text key={`${index}-${line}`} style={[styles.smallNote, { color: colors.faint }]}>{line}</Text>
              ))}
            </CollapsibleDetails>
          </SectionCard>

          <SectionCard title={t('today.weekTitle')} body={[tomorrow.title, tomorrow.body]}>
            {logStreak >= 2 ? (
              <View style={[styles.streakChip, { borderColor: colors.orange, backgroundColor: colors.orange + '16' }]}>
                <Ionicons name="flame" size={14} color={colors.orange} />
                <Text style={[styles.streakText, { color: colors.orange }]}>{t('today.streak', { days: logStreak })}</Text>
              </View>
            ) : null}
          </SectionCard>
        </>
      ) : null}

      <WeeklyCheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </Screen>
  );
}

function TodayActionCard({
  trainingDay,
  completed,
  onCheckIn,
  onDone,
  onAdjust,
  t,
}: {
  rec: DailyCoachRecommendation;
  trainingDay: boolean;
  completed: boolean;
  onCheckIn: () => void;
  onDone: () => void;
  onAdjust: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const primaryLabel = trainingDay ? (completed ? t('today.completed') : t('today.markDone')) : t('today.checkIn');
  const primaryIcon = trainingDay ? 'checkmark-circle-outline' : 'pulse-outline';
  const primaryAction = trainingDay ? onDone : onCheckIn;

  return (
    <SectionCard title={t('today.oneThing')} body={todayActionBody(trainingDay, completed, t)}>
      <ActionStrip
        actions={[
          { icon: primaryIcon, label: primaryLabel, onPress: primaryAction, disabled: trainingDay && completed, primary: true },
          { icon: 'pulse-outline', label: t('today.checkIn'), onPress: onCheckIn },
          { icon: 'options-outline', label: t('today.adjustToday'), onPress: onAdjust },
        ]}
      />
    </SectionCard>
  );
}

function SimpleSection({
  title,
  primary,
  secondary,
  cta,
  onPress,
}: {
  title: string;
  primary: string;
  secondary: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <SectionCard title={title} body={[primary, secondary]} ctaLabel={cta} onPress={onPress} />
  );
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

function trainingSummary(session: TrainingSession | null | undefined, t: (key: TranslationKey) => string): string {
  if (!session || session.kind === 'rest') return t('today.restDayLabel');
  return `${session.title} · ${session.durationMinutes} min`;
}

function trainingDetail(
  session: TrainingSession | null | undefined,
  focus: string | undefined,
  whatNotToDo: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!session || session.kind === 'rest') return t('today.restNote');
  const detail = focus ? `${focus}.` : session.notes ?? '';
  return whatNotToDo ? `${detail} ${whatNotToDo}`.trim() : detail;
}

function todayHeroBody(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string {
  const session = rec.training?.session;
  if (!session || session.kind === 'rest' || rec.readiness.recommendedIntensity === 'rest') {
    return locale === 'en'
      ? 'Keep today calm and let recovery make tomorrow easier.'
      : 'Dnes to drž v klidu, ať zítra půjde plán líp.';
  }
  if (rec.readiness.recommendedIntensity === 'hard') {
    return locale === 'en'
      ? 'Do the planned quality work, but do not add extra volume.'
      : 'Odtrénuj plánovanou kvalitu, ale nepřidávej objem navíc.';
  }
  if (rec.readiness.recommendedIntensity === 'easy') {
    return locale === 'en'
      ? 'Move lightly and keep the session conversational.'
      : 'Hýbej se lehce a drž trénink konverzační.';
  }
  return locale === 'en'
    ? 'Follow the plan and keep the rest of the day steady.'
    : 'Drž se plánu a zbytek dne nech stabilní.';
}

function todayActionBody(
  trainingDay: boolean,
  completed: boolean,
  t: (key: TranslationKey) => string,
): string {
  if (trainingDay && completed) return t('today.completedMsg');
  if (trainingDay) return t('today.decisionHoldHint');
  return t('today.restNote');
}

function nutritionGuidance(rec: DailyCoachRecommendation, trainingDay: boolean, locale: 'cs' | 'en'): string {
  const reason = rec.nutrition?.reason ?? '';
  const delta = rec.nutrition?.deltaVsBaselineKcal ?? 0;
  if (trainingDay && delta > 0) {
    return locale === 'en'
      ? 'Fuel around the workout and keep the rest of the day simple.'
      : 'Dej víc energie kolem tréninku a zbytek dne nech jednoduchý.';
  }
  if (delta < 0) {
    return locale === 'en'
      ? 'Keep meals a little lighter today without cutting protein.'
      : 'Dnes drž jídlo o něco lehčí, ale neubírej protein.';
  }
  if (reason.toLowerCase().includes('training')) {
    return locale === 'en'
      ? 'Keep food steady and place carbs near training.'
      : 'Jídlo drž stabilní a sacharidy dej blíž k tréninku.';
  }
  return locale === 'en'
    ? 'Keep meals steady and make protein the anchor.'
    : 'Jídlo drž stabilní a opři ho o protein.';
}

function nutritionEnergyLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Energy' : 'Energie';
}

function foodPhotoCta(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Log meal photo' : 'Zapsat fotkou';
}

function whyLines(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string[] {
  const lines = [...(rec.explanation ?? [])].slice(0, 2);
  if (rec.warnings[0]) {
    lines.push(locale === 'en' ? `Watch: ${rec.warnings[0]}` : `Pozor: ${rec.warnings[0]}`);
  }
  return lines.length ? lines : [rec.coachNote];
}

function todayWhyLines(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string[] {
  const session = rec.training?.session;
  const lines: string[] = [];
  if (session && session.kind !== 'rest') {
    lines.push(locale === 'en'
      ? 'Your plan has training today, so the recommendation protects quality without adding extra load.'
      : 'Dnes máš v plánu trénink, takže doporučení hlídá kvalitu bez zbytečného přidávání.');
  } else {
    lines.push(locale === 'en'
      ? 'A calmer day helps the next planned session land better.'
      : 'Klidnější den pomůže, aby další plánovaný trénink sedl líp.');
  }
  if (rec.warnings[0]) {
    lines.push(locale === 'en'
      ? 'If something feels off, choose the easier version.'
      : 'Když se nebudeš cítit dobře, zvol lehčí variantu.');
  } else if (rec.readiness.band === 'high') {
    lines.push(locale === 'en'
      ? 'You can follow the plan, but there is no need to chase more.'
      : 'Můžeš držet plán, ale není potřeba honit něco navíc.');
  }
  return lines.slice(0, 2);
}

function tomorrowSession(profile: UserProfile, selectedDate: string, locale: 'cs' | 'en') {
  const date = new Date(`${selectedDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  const session = planSessionForDate(profile, date, {}, locale);
  if (!session || session.kind === 'rest') {
    return {
      title: locale === 'en' ? 'Tomorrow: recover well' : 'Zítra: dobře zregeneruj',
      body: locale === 'en'
        ? 'Open Today again and the coach will adapt the next action to your check-in and plan.'
        : 'Otevři Today znovu a kouč upraví další krok podle check-inu a plánu.',
    };
  }
  return {
    title: locale === 'en' ? `Tomorrow: ${session.title}` : `Zítra: ${session.title}`,
    body: locale === 'en'
      ? `${session.durationMinutes} min planned. Check in tomorrow so the recommendation can stay practical.`
      : `V plánu je ${session.durationMinutes} min. Zítra udělej check-in, ať doporučení zůstane praktické.`,
  };
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1, gap: 3 },
  greeting: { fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0 },
  headerTitle: { fontSize: 30, lineHeight: 36, fontWeight: '900' },
  headerMeta: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  iconButton: { width: 46, height: 46, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  decisionCard: { gap: 12 },
  decisionTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  decisionCopy: { flex: 1, gap: 5 },
  kicker: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0 },
  decisionTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900' },
  decisionTitleSmall: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  bodyText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  smallNote: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  readinessBadge: { minWidth: 92, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' },
  readinessValue: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  readinessLabel: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0 },
  streakChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2 },
  streakText: { fontSize: 12.5, fontWeight: '900' },
});
