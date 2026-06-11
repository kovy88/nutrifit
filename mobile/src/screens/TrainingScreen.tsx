import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../components/UI';
import { ActionStrip, CollapsibleDetails, HeroDecisionCard, InfoRow, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { WorkoutCard } from '../components/WorkoutCard';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal';
import { useTrenr } from '../context/TrenrContext';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { toDateKey } from '../utils/nutrition';
import { adjustedPlanForDate } from '../lib/training';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useRecentWorkouts } from '../hooks/useRecentWorkouts';
import { getRaceGoalLabel } from '../lib/profile/profile-labels';
import type { WorkoutSummary } from '../lib/health';

type WeekItem = ReturnType<typeof buildWeekList>[number];

export function TrainingScreen() {
  const { profile, selectedDate, setSelectedDate, trainingCompletions } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors, fonts } = useTheme();
  const { t, locale } = useLanguage();
  const recent = useRecentWorkouts(14);
  const { completion, mark } = useTrainingCompletion();
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutSummary | null>(null);

  const weekList = useMemo(
    () => profile ? buildWeekList(profile, selectedDate, recent.workouts, trainingCompletions, t, locale) : [],
    [profile, recent.workouts, selectedDate, t, trainingCompletions, locale],
  );
  const selectedDay = weekList.find(item => item.dateKey === selectedDate) ?? weekList[0];
  const plannedSessions = weekList.filter(item => !item.isRest).length;
  const completedCount = weekList.filter(item => item.completionStatus === 'completed').length;

  if (!profile || !selectedDay) return null;

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
  }

  function openSelectedDayToday() {
    navigation.navigate('Main', { screen: 'Dnes' });
  }

  const selectedCompletion = selectedDay.completionStatus ?? completion?.status;
  const selectedDone = selectedCompletion === 'completed';
  const selectedSkipped = selectedCompletion === 'skipped';
  const intensityTone =
    selectedDay.session.intensity === 'hard' ? 'risk' :
    selectedDay.session.intensity === 'moderate' ? 'caution' :
    selectedDay.session.intensity === 'easy' ? 'ready' :
    'neutral';

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        eyebrow={t('training.eyebrow')}
        title={t('training.title')}
        subtitle={t('training.cleanSubtitle', { goal: getRaceGoalLabel(profile.trainingGoal, t) })}
      />

      <HeroDecisionCard
        eyebrow={selectedDay.isToday ? t('common.today') : selectedDay.dayTitle}
        title={selectedDay.isRest ? t('training.restTitle') : selectedDay.session.title}
        body={selectedDay.isRest ? t('training.restSub') : selectedDay.session.notes}
        statusLabel={selectedDone ? t('today.completed') : selectedSkipped ? t('training.markSkipped') : intensityLabel(selectedDay.session.intensity, locale)}
        statusTone={selectedDone ? 'ready' : selectedSkipped ? 'caution' : intensityTone}
      >
        {selectedDay.isRest ? (
          <Text style={[styles.selectedNote, { color: colors.muted, fontFamily: fonts.regular }]}>{selectedDay.dateLabel}</Text>
        ) : (
          <CollapsibleDetails label={t('plan.detail')}>
            <InfoRow label={t('training.duration')} value={`${selectedDay.session.durationMinutes} min`} />
            <InfoRow label={t('training.distance')} value={selectedDay.session.distanceKm ? `${selectedDay.session.distanceKm} km` : '-'} />
            {selectedDay.adjustedAfterMissed ? (
              <Text style={[styles.adjustedNote, { color: colors.orange, fontFamily: fonts.bold }]}>{t('training.adjustedAfterMissedNote')}</Text>
            ) : null}
          </CollapsibleDetails>
        )}
        <ActionStrip
          actions={[
            { icon: 'checkmark-circle-outline', label: selectedDone ? t('today.completed') : t('today.markDone'), onPress: () => mark('completed'), disabled: selectedDone || selectedDay.isRest, primary: true },
            { icon: 'close-circle-outline', label: t('training.markSkipped'), onPress: () => mark('skipped'), disabled: selectedDay.isRest },
            { icon: 'today-outline', label: t('common.today'), onPress: openSelectedDayToday },
          ]}
        />
      </HeroDecisionCard>

      <SectionCard
        title={t('training.weekOverview')}
        body={trainingWeekStatus(completedCount, plannedSessions, locale)}
        statusLabel={completedCount ? t('today.completed') : t('training.planned')}
        statusTone={completedCount ? 'ready' : 'neutral'}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
          {weekList.map(item => (
            <Pressable
              key={item.dateKey}
              onPress={() => handleSelectDay(item.dateKey)}
              style={[
                styles.dayChip,
                {
                  borderColor: item.isSelected ? colors.accent : colors.border,
                  backgroundColor: item.isSelected ? colors.accent + '18' : colors.bgElev,
                },
              ]}
            >
              <Text style={[styles.dayDow, { color: item.isSelected ? colors.accent : colors.faint, fontFamily: fonts.bold }]}>
                {item.shortLabel}
              </Text>
              <Text style={[styles.dayNumber, { color: colors.ink, fontFamily: fonts.number }]}>
                {item.dayNumber}
              </Text>
              <View style={[styles.dayDot, { backgroundColor: dayDotColor(item, colors) }]} />
            </Pressable>
          ))}
        </ScrollView>
        <CollapsibleDetails label={t('plan.detail')}>
          <InfoRow label={t('training.planned')} value={plannedSessions} />
          <InfoRow label={t('training.done')} value={completedCount} />
        </CollapsibleDetails>
      </SectionCard>

      <SectionCard title={t('training.recentTitle')} body={recentWorkoutBody(recent.isLoading, recent.workouts, locale)}>
        {recent.workouts.length ? (
          <CollapsibleDetails label={t('plan.detail')}>
            <View style={styles.workoutsList}>
              {recent.workouts.slice(0, 6).map((workout, index) => (
                <WorkoutCard key={workout.id || index} workout={workout} onPress={() => setSelectedWorkout(workout)} />
              ))}
            </View>
          </CollapsibleDetails>
        ) : null}
      </SectionCard>

      <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </Screen>
  );
}

function buildWeekList(
  profile: NonNullable<ReturnType<typeof useTrenr>['profile']>,
  selectedDate: string,
  recentWorkouts: WorkoutSummary[],
  trainingCompletions: ReturnType<typeof useTrenr>['trainingCompletions'],
  t: ReturnType<typeof useLanguage>['t'],
  locale: string,
) {
  const baseDate = new Date(selectedDate);
  const day = baseDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);
  const adjusted = adjustedPlanForDate(profile, baseDate, trainingCompletions, { recentWorkouts }, locale);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const dateKey = toDateKey(date);
    const session = adjusted.plan.sessions.find(item => item.date === dateKey) ?? {
      date: dateKey,
      kind: 'rest' as const,
      title: 'Volno',
      durationMinutes: 0,
      intensity: 'rest' as const,
    };
    const isRest = session.kind === 'rest' || session.durationMinutes === 0;
    const done = recentWorkouts.some(workout => workout.startedAt.slice(0, 10) === dateKey);
    const completion = trainingCompletions[dateKey];
    return {
      dateKey,
      session,
      isRest,
      done: done || completion?.status === 'completed',
      completionStatus: completion?.status,
      adjustedAfterMissed: adjusted.adjustedDates.includes(dateKey),
      isToday: dateKey === toDateKey(new Date()),
      isSelected: dateKey === selectedDate,
      shortLabel: t('training.weekdayShort', { dow: date.getDay() }),
      dayTitle: t('training.weekdayFull', { dow: date.getDay() }),
      dayNumber: String(date.getDate()),
      dateLabel: `${date.getDate()}. ${date.getMonth() + 1}.`,
    };
  });
}

function dayDotColor(
  item: WeekItem,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  if (item.completionStatus === 'skipped') return colors.orange;
  if (item.isRest) return colors.border;
  if (item.done) return colors.green;
  if (item.adjustedAfterMissed) return colors.blue;
  return colors.accent;
}

function intensityLabel(intensity: string, locale: string): string {
  if (intensity === 'rest') return locale === 'en' ? 'Rest' : 'Volno';
  if (intensity === 'easy') return locale === 'en' ? 'Easy' : 'Lehce';
  if (intensity === 'moderate') return locale === 'en' ? 'Steady' : 'Normálně';
  if (intensity === 'hard') return locale === 'en' ? 'Hard' : 'Tvrdě';
  return locale === 'en' ? 'Training' : 'Trénink';
}

function trainingWeekStatus(done: number, planned: number, locale: string): string {
  if (planned <= 0) {
    return locale === 'en'
      ? 'No workouts are planned for this week.'
      : 'Na tento týden nejsou plánované tréninky.';
  }
  if (done <= 0) {
    return locale === 'en'
      ? `${planned} planned this week, none done yet.`
      : `${planned} v plánu tento týden, zatím nic hotovo.`;
  }
  if (done >= planned) {
    return locale === 'en'
      ? `All ${planned} planned workouts are done.`
      : `Všech ${planned} plánovaných tréninků je hotovo.`;
  }
  return locale === 'en'
    ? `${done} of ${planned} planned workouts are done.`
    : `${done} z ${planned} plánovaných tréninků je hotovo.`;
}

function recentWorkoutBody(isLoading: boolean, workouts: WorkoutSummary[], locale: string): string {
  if (isLoading) {
    return locale === 'en'
      ? 'Checking recent training history.'
      : 'Kontroluji nedávnou tréninkovou historii.';
  }
  if (!workouts.length) {
    return locale === 'en'
      ? 'Completed workouts will show here after you mark a session done or connect a source.'
      : 'Hotové tréninky se tady objeví po odkliknutí tréninku nebo připojení zdroje.';
  }
  const count = workouts.length;
  return locale === 'en'
    ? `${count} recent ${count === 1 ? 'workout' : 'workouts'} found. Latest session is logged.`
    : `${count} nedávných tréninků. Poslední je zapsaný.`;
}

const styles = StyleSheet.create({
  screen: { gap: 18 },
  weekMetrics: { flexDirection: 'row', gap: 8 },
  weekStrip: { gap: 8, paddingTop: 2 },
  dayChip: { width: 62, minHeight: 82, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayDow: { fontSize: 11, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  dayNumber: { fontSize: 24, lineHeight: 28 },
  dayDot: { width: 7, height: 7, borderRadius: 4 },
  selectedBody: { gap: 10 },
  selectedTitleRow: { gap: 8 },
  selectedTitle: { fontSize: 20, lineHeight: 25 },
  selectedNote: { fontSize: 14, lineHeight: 20 },
  adjustedNote: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1 },
  workoutsList: { gap: 10 },
});
