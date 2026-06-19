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
import { formatGoalProfileSummary } from '../lib/onboarding/goal-summary-labels';
import type { Translate, TranslationKey } from '../lib/i18n';
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
  const decision = rec ? dailyDecision(rec.readiness.recommendedIntensity, rec.readiness.band, locale) : null;
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
        <LoadingState title={t('today.loadingCoachTitle')} body={todayLoadingBody(locale)} />
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
            statusLabel={dailyStatusLabel(rec.readiness.band, locale)}
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
            t={t}
            locale={locale}
          />

          {showTraining ? (
            <SimpleSection
              title={t('today.trainingTitle')}
              primary={trainingSummary(rec.training?.session ?? currentSession, t)}
              secondary={trainingDetail(rec.training?.session ?? currentSession, rec.training?.whatNotToDo, t, locale)}
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
            title={todayWhyTitle(locale)}
            body={todayWhyLines(rec, locale)}
          />

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
  t,
  locale,
}: {
  rec: DailyCoachRecommendation;
  trainingDay: boolean;
  completed: boolean;
  onCheckIn: () => void;
  onDone: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  locale: 'cs' | 'en';
}) {
  const primaryLabel = trainingDay ? (completed ? t('today.completed') : t('today.markDone')) : t('today.checkIn');
  const primaryIcon: keyof typeof Ionicons.glyphMap = trainingDay ? 'checkmark-circle-outline' : 'pulse-outline';
  const primaryAction = trainingDay ? onDone : onCheckIn;
  const actions = [
    { icon: primaryIcon, label: primaryLabel, onPress: primaryAction, disabled: trainingDay && completed, primary: true },
    ...(trainingDay ? [{ icon: 'pulse-outline' as const, label: t('today.checkIn'), onPress: onCheckIn }] : []),
  ];

  return (
    <SectionCard title={t('today.oneThing')} body={todayActionBody(trainingDay, completed, locale)}>
      <ActionStrip actions={actions} />
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

function dailyStatusLabel(band: 'low' | 'medium' | 'high', locale: 'cs' | 'en'): string {
  if (band === 'high') return locale === 'en' ? 'Good day' : 'Dobrý den';
  if (band === 'medium') return locale === 'en' ? 'Steady' : 'Stabilně';
  return locale === 'en' ? 'Go easy' : 'Uber';
}

function dailyDecision(
  intensity: 'rest' | 'easy' | 'moderate' | 'hard',
  band: 'low' | 'medium' | 'high',
  locale: 'cs' | 'en',
) {
  if (intensity === 'rest' || band === 'low') {
    return {
      title: locale === 'en' ? 'Make today easier' : 'Dnes uber',
      label: locale === 'en' ? 'Take it easy' : 'Lehčí den',
      hint: locale === 'en'
        ? 'Light movement, food, and sleep are enough.'
        : 'Stačí lehký pohyb, jídlo a spánek.',
    };
  }
  if (intensity === 'hard' && band === 'high') {
    return {
      title: locale === 'en' ? 'Do the planned workout' : 'Odtrénuj dnešní plán',
      label: locale === 'en' ? 'Go for it' : 'Jdi na to',
      hint: locale === 'en'
        ? 'Finish with energy left; no bonus volume.'
        : 'Dokonči s rezervou; nepřidávej objem navíc.',
    };
  }
  return {
    title: locale === 'en' ? 'Follow the plan calmly' : 'Drž plán v klidu',
    label: locale === 'en' ? 'Steady day' : 'Stabilní den',
    hint: locale === 'en'
      ? 'Do the work, skip the records.'
      : 'Odtrénuj, ale nelámej rekordy.',
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
  t: (key: TranslationKey) => string,
  locale: 'cs' | 'en',
): string {
  if (!session || session.kind === 'rest') return t('today.restNote');
  if (whatNotToDo) {
    return locale === 'en'
      ? 'Keep the session clean and skip anything extra.'
      : 'Drž trénink čistý a nepřidávej nic navíc.';
  }
  switch (session.kind) {
    case 'easy_run':
    case 'recovery_run':
    case 'recovery_walk':
      return locale === 'en'
        ? 'Keep it light enough that you could talk the whole time.'
        : 'Drž tempo tak lehké, že bys u něj zvládl mluvit.';
    case 'long_run':
      return locale === 'en'
        ? 'Aim for calm time on your feet, not a pace test.'
        : 'Cílem je klidný čas na nohách, ne test tempa.';
    case 'tempo':
    case 'intervals':
      return locale === 'en'
        ? 'Keep the quality parts sharp and skip extra volume.'
        : 'Drž kvalitu hlavních úseků a nepřidávej objem navíc.';
    case 'strength':
      return locale === 'en'
        ? 'Clean reps, steady effort, and a little left in reserve.'
        : 'Čisté série, stabilní úsilí a trochu rezervy.';
    case 'mobility':
    case 'recovery':
      return locale === 'en'
        ? 'Use it to loosen up, breathe, and leave fresher.'
        : 'Uvolni tělo, dýchej a skonči svěžejší.';
    case 'race':
    case 'match':
      return locale === 'en'
        ? 'Do the key session, then protect recovery afterward.'
        : 'Splň hlavní výkon a potom chraň regeneraci.';
    default:
      return locale === 'en'
        ? 'Do the planned work and stop with energy left.'
        : 'Odtrénuj plán a skonči s rezervou.';
  }
}

function todayLoadingBody(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? "Preparing today's training, food, and one next action."
    : 'Připravuju dnešní trénink, jídlo a jeden další krok.';
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
      ? 'Today is good for the planned session, not for improvising more.'
      : 'Dnes se hodí plánovaný trénink, ne vymýšlení něčeho navíc.';
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
  locale: 'cs' | 'en',
): string {
  if (trainingDay && completed) {
    return locale === 'en'
      ? 'Done. Add a quick check-in if anything felt off.'
      : 'Hotovo. Pokud něco nesedělo, přidej krátký check-in.';
  }
  if (trainingDay) {
    return locale === 'en'
      ? 'After the session, mark it done or check in if you need an adjustment.'
      : 'Po tréninku ho odškrtni, nebo udělej check-in, pokud potřebuješ úpravu.';
  }
  return locale === 'en'
    ? 'Do a short check-in so tomorrow can adapt.'
    : 'Udělej krátký check-in, ať se zítřek může upravit.';
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

function todayWhyLines(rec: DailyCoachRecommendation, locale: 'cs' | 'en'): string[] {
  const session = rec.training?.session;
  if (rec.warnings[0]) {
    return [locale === 'en'
      ? 'If something feels off, choose the easier version.'
      : 'Když se nebudeš cítit dobře, zvol lehčí variantu.'];
  }
  if (!session || session.kind === 'rest') {
    return [locale === 'en'
      ? 'A calmer day makes the next planned session easier.'
      : 'Klidnější den pomůže dalšímu tréninku.'];
  }
  if (rec.readiness.band === 'high') {
    return [locale === 'en'
      ? 'Do the plan well; do not add extra.'
      : 'Odtrénuj plán dobře; nepřidávej navíc.'];
  }
  return [locale === 'en'
    ? 'Complete the work and stop with energy left.'
    : 'Splň práci a skonči s rezervou.'];
}

function todayWhyTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Why' : 'Proč';
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
  const title = titleWithOptionalDuration(session);
  const body = titleHasDuration(session.title)
    ? (locale === 'en'
        ? 'Check in tomorrow so the recommendation can stay practical.'
        : 'Zítra udělej check-in, ať doporučení zůstane praktické.')
    : (locale === 'en'
        ? `${session.durationMinutes} min planned. Check in tomorrow so the recommendation can stay practical.`
        : `V plánu je ${session.durationMinutes} min. Zítra udělej check-in, ať doporučení zůstane praktické.`);
  return {
    title: locale === 'en' ? `Tomorrow: ${title}` : `Zítra: ${title}`,
    body,
  };
}

function titleWithOptionalDuration(session: TrainingSession): string {
  const title = session.title.trim();
  return titleHasDuration(title) ? title : `${title} · ${session.durationMinutes} min`;
}

function titleHasDuration(title: string): boolean {
  return /\b\d+\s*(min|mins|minutes|minut|m)\b/i.test(title);
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
