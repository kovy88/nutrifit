import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PlanDayCard,
  ScreenHeader,
  SectionHeader,
  StatusPill,
} from '../components/UI';
import { Screen } from '../components/Screen';
import { WorkoutCard } from '../components/WorkoutCard';
import { WorkoutDetailModal } from '../components/WorkoutDetailModal';
import { useTrenr } from '../context/TrenrContext';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import { toDateKey } from '../utils/nutrition';
import { planSessionForDate } from '../lib/training';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useRecentWorkouts } from '../hooks/useRecentWorkouts';
import type { WorkoutSummary } from '../lib/health';

type WeekItem = ReturnType<typeof buildWeekList>[number];

export function TrainingScreen() {
  const { profile, selectedDate, setSelectedDate, trainingCompletions } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors, fonts } = useTheme();
  const { t } = useLanguage();
  const recent = useRecentWorkouts(14);
  const { completion, mark } = useTrainingCompletion();
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutSummary | null>(null);

  const weekList = useMemo(
    () => profile ? buildWeekList(profile, selectedDate, recent.workouts, trainingCompletions, t) : [],
    [profile, recent.workouts, selectedDate, t, trainingCompletions],
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
        subtitle={t('training.cleanSubtitle', { goal: formatGoal(profile.trainingGoal) })}
      />

      <Card>
        <SectionHeader
          title={t('training.weekOverview')}
          action={<StatusPill label={t('training.weekStatus', { done: completedCount, total: plannedSessions })} tone={completedCount ? 'ready' : 'neutral'} />}
        />
        <View style={styles.weekMetrics}>
          <MetricCard label={t('training.planned')} value={plannedSessions} detail={t('training.sessions')} color={colors.accent} />
          <MetricCard label={t('training.done')} value={completedCount} detail={t('training.thisWeek')} color={colors.green} />
        </View>
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
              <View style={[styles.dayDot, { backgroundColor: item.isRest ? colors.border : item.done ? colors.green : colors.accent }]} />
            </Pressable>
          ))}
        </ScrollView>
      </Card>

      <PlanDayCard
        title={selectedDay.dayTitle}
        subtitle={selectedDay.dateLabel}
        selected
        markers={[
          selectedDay.isToday ? t('common.today') : '',
          selectedDone ? t('today.completed') : selectedSkipped ? t('training.markSkipped') : '',
        ].filter((marker): marker is string => Boolean(marker))}
      >
        {selectedDay.isRest ? (
          <View style={styles.selectedBody}>
            <Text style={[styles.selectedTitle, { color: colors.orange, fontFamily: fonts.extraBold }]}>{t('training.restTitle')}</Text>
            <Text style={[styles.selectedNote, { color: colors.muted, fontFamily: fonts.regular }]}>{t('training.restSub')}</Text>
          </View>
        ) : (
          <View style={styles.selectedBody}>
            <View style={styles.selectedTitleRow}>
              <Text style={[styles.selectedTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{selectedDay.session.title}</Text>
              <StatusPill label={t('training.intensityValue', { value: selectedDay.session.intensity })} tone={intensityTone} />
            </View>
            <View style={styles.weekMetrics}>
              <MetricCard label={t('training.duration')} value={selectedDay.session.durationMinutes} unit="min" color={colors.accent} />
              <MetricCard
                label={t('training.distance')}
                value={selectedDay.session.distanceKm ? selectedDay.session.distanceKm : '-'}
                unit={selectedDay.session.distanceKm ? 'km' : undefined}
                color={colors.blue}
              />
            </View>
            {selectedDay.session.notes ? (
              <Text style={[styles.selectedNote, { color: colors.muted, fontFamily: fonts.regular }]}>{selectedDay.session.notes}</Text>
            ) : null}
          </View>
        )}
        <View style={styles.actions}>
          <Button style={styles.actionButton} disabled={selectedDone || selectedDay.isRest} onPress={() => mark('completed')}>
            {selectedDone ? t('today.completed') : t('today.markDone')}
          </Button>
          <Button style={styles.actionButton} variant="secondary" disabled={selectedDay.isRest} onPress={() => mark('skipped')}>
            {t('training.markSkipped')}
          </Button>
        </View>
        <Button variant="secondary" onPress={openSelectedDayToday}>
          {t('training.openToday')}
        </Button>
      </PlanDayCard>

      <SectionHeader title={t('training.recentTitle')} />
      {recent.isLoading ? (
        <LoadingState title={t('training.loadingWorkouts')} />
      ) : recent.workouts.length === 0 ? (
        <EmptyState title={t('training.noWorkoutsTitle')} body={t('training.noWorkouts')} />
      ) : (
        <View style={styles.workoutsList}>
          {recent.workouts.slice(0, 6).map((workout, index) => (
            <WorkoutCard key={workout.id || index} workout={workout} onPress={() => setSelectedWorkout(workout)} />
          ))}
        </View>
      )}

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
) {
  const baseDate = new Date(selectedDate);
  const day = baseDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const dateKey = toDateKey(date);
    const session = planSessionForDate(profile, date, { recentWorkouts });
    const isRest = session.kind === 'rest' || session.durationMinutes === 0;
    const done = recentWorkouts.some(workout => workout.startedAt.slice(0, 10) === dateKey);
    const completion = trainingCompletions[dateKey];
    return {
      dateKey,
      session,
      isRest,
      done: done || completion?.status === 'completed',
      completionStatus: completion?.status,
      isToday: dateKey === toDateKey(new Date()),
      isSelected: dateKey === selectedDate,
      shortLabel: t('training.weekdayShort', { dow: date.getDay() }),
      dayTitle: t('training.weekdayFull', { dow: date.getDay() }),
      dayNumber: String(date.getDate()),
      dateLabel: `${date.getDate()}. ${date.getMonth() + 1}.`,
    };
  });
}

function formatGoal(goal: string) {
  return goal.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

const styles = StyleSheet.create({
  screen: { gap: 18 },
  weekMetrics: { flexDirection: 'row', gap: 8 },
  weekStrip: { gap: 8, paddingTop: 2 },
  dayChip: { width: 62, minHeight: 82, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayDow: { fontSize: 11, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  dayNumber: { fontSize: 24, lineHeight: 28 },
  dayDot: { width: 7, height: 7, borderRadius: 4 },
  selectedBody: { gap: 10 },
  selectedTitleRow: { gap: 8 },
  selectedTitle: { fontSize: 20, lineHeight: 25 },
  selectedNote: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1 },
  workoutsList: { gap: 10 },
});
