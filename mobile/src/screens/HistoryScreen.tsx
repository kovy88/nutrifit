import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, ScreenHeader, SectionHeader } from '../components/UI';
import { CollapsibleDetails, HeroDecisionCard, InfoRow, SectionCard } from '../components/SimpleUX';
import { Screen } from '../components/Screen';
import { useTrenr } from '../context/TrenrContext';
import { listStoredDates, loadDailyCoachHistory, loadFoodLogsByDate, loadPlansByDate } from '../services/storage';
import { formatDateLabel } from '../utils/nutrition';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { SimpleLineChart } from '../components/premium/SimpleLineChart';
import { useTrend, buildTrendFromRecord } from '../hooks/useTrend';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useUnits } from '../hooks/useUnits';
import { computeAdherenceTrend, adherenceToTrendPoints } from '../lib/nutrition/adherenceTrend';
import { computeAdherenceStreak, computeLogStreak, describeStreak } from '../lib/nutrition/streaks';
import { computeEnergyBalance } from '../lib/nutrition/energyBalance';
import { useStrainTrend } from '../hooks/useStrainTrend';
import { generateWeeklyMiniReview } from '../lib/coaching/weekly-review';
import { planSessionForDate } from '../lib/training';
import { resolveCoachScope, scopeHasTraining } from '../types';
import type { TrendPoint } from '../components/MiniTrendChart';
import type { Translate, TranslationKey } from '../lib/i18n';

type DaySummary = {
  dateKey: string;
  plannedKcal: number;
  loggedKcal: number;
};

type ProgressTab = 'overview' | 'trends' | 'history';

function mergeWeightTrend(primary: TrendPoint[], fallback: TrendPoint[]): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const p of fallback) byDate.set(p.date, p);
  for (const p of primary) {
    if (p.value != null) byDate.set(p.date, p);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function HistoryScreen() {
  const { setSelectedDate, selectedDate, weights, baselineMacros, profile, trainingCompletions } = useTrenr();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { showWeight, weightUnit, isImperial } = useUnits();
  const [tab, setTab] = useState<ProgressTab>('overview');
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [adherence, setAdherence] = useState(() => computeAdherenceTrend({}, {}, 14));
  const [energyBalance, setEnergyBalance] = useState(() => computeEnergyBalance({ logs: {}, tdee: 2000, days: 14 }));
  const [weeklyReview, setWeeklyReview] = useState(() => generateWeeklyMiniReview({
    completedSessions: 0,
    plannedSessions: 0,
    readinessScores: [],
    nutritionTargetDays: 0,
    nutritionLoggedDays: 0,
  }));
  const sleepTrend = useTrend('sleep', 14);
  const hrvTrend = useTrend('hrv', 14);
  const rhrTrend = useTrend('rhr', 14);
  const strainTrend = useStrainTrend(14);
  const weightProviderTrend = useTrend('weight', 30);
  const weightTrend = mergeWeightTrend(weightProviderTrend.data, buildTrendFromRecord(weights, 30));
  const adherencePoints = adherenceToTrendPoints(adherence.days);
  const logStreak = computeLogStreak(adherence.days);
  const adherenceStreak = computeAdherenceStreak(adherence.days);

  async function loadSummaries() {
    try {
      const dates = await listStoredDates();
      const [plans, logs, coachHistory] = await Promise.all([loadPlansByDate(), loadFoodLogsByDate(), loadDailyCoachHistory()]);
      const items: DaySummary[] = dates.map(dateKey => {
        const dayMeals = plans[dateKey] || [];
        const dayLogs = logs[dateKey] || [];
        return {
          dateKey,
          plannedKcal: dayMeals.reduce((sum, m) => sum + m.kcal, 0),
          loggedKcal: dayLogs.reduce((sum, item) => sum + item.kcal, 0),
        };
      });
      items.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      setSummaries(items);
      const nextAdherence = computeAdherenceTrend(plans, logs, 14);
      setAdherence(nextAdherence);
      if (baselineMacros) setEnergyBalance(computeEnergyBalance({ logs, tdee: baselineMacros.tdee, days: 14 }));
      const weekDates = currentWeekDates(selectedDate);
      const hasTraining = profile ? scopeHasTraining(resolveCoachScope(profile)) : false;
      // Mobility days are optional extras the planner adds on top of the user's
      // chosen sessions/week, so they don't count toward the "X of Y" rhythm.
      const plannedDates = hasTraining && profile
        ? weekDates.filter(dateKey => {
            const session = planSessionForDate(profile, new Date(`${dateKey}T12:00:00`), {}, locale);
            return session && session.kind !== 'rest' && session.kind !== 'mobility';
          })
        : [];
      const plannedSessions = plannedDates.length;
      const completedSessions = plannedDates.filter(dateKey => trainingCompletions[dateKey]?.status === 'completed').length;
      const readinessScores = weekDates
        .map(dateKey => coachHistory[dateKey]?.recommendation?.readiness?.score)
        .filter((score): score is number => typeof score === 'number');
      const weekAdherenceDays = nextAdherence.days.filter(day => weekDates.includes(day.date));
      const nutritionLoggedDays = weekAdherenceDays.filter(day => day.loggedKcal > 0).length;
      const nutritionTargetDays = weekAdherenceDays.filter(day => day.ratio != null && day.ratio >= 0.85 && day.ratio <= 1.15).length;
      setWeeklyReview(generateWeeklyMiniReview({
        completedSessions,
        plannedSessions,
        readinessScores,
        nutritionTargetDays,
        nutritionLoggedDays,
      }));
    } catch (err) {
      console.error('Failed to load history summaries', err);
    }
  }

  useEffect(() => {
    if (isFocused) void loadSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSummaries closes over many values that change every render; only re-run on focus change.
  }, [isFocused]);

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
    navigation.navigate('Dnes');
  }

  const adherenceLabel = adherence.averageRatio == null ? '-' : `${Math.round(adherence.averageRatio * 100)}%`;
  return (
    <Screen>
      <ScreenHeader eyebrow={t('tab.history')} title={progressTitle(t)} subtitle={progressSubtitle(t)} />
      <HeroDecisionCard
        eyebrow={t('tab.history')}
        title={t('history.weeklyReview')}
        body={progressHeroBody(
          adherence.averageRatio,
          weeklyReview.completedSessions,
          weeklyReview.plannedSessions,
          weeklyReview.nutritionLoggedDays,
          t,
          t(weeklyReview.recommendationKey),
        )}
        accent={adherence.averageRatio == null || adherence.averageRatio >= 0.8 ? colors.accent : colors.orange}
        statusLabel={progressHeroStatus(adherence.averageRatio, t)}
        statusTone={adherence.averageRatio == null || adherence.averageRatio >= 0.8 ? 'ready' : 'caution'}
      />
      <View style={[styles.segment, { backgroundColor: colors.bgElev, borderColor: colors.hairline }]}>
        {(['overview', 'trends', 'history'] as ProgressTab[]).map(item => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={[styles.segmentItem, tab === item && { backgroundColor: colors.accent + '16' }]}
          >
            <Text style={[styles.segmentText, { color: tab === item ? colors.accent : colors.muted }]}>
              {t(`history.tab.${item}` as TranslationKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        <>
          <SectionCard title={t('history.weeklyConsistency')} body={progressConsistencyBody(adherence.averageRatio, t)}>
            {weeklyReview.plannedSessions > 0 ? (
              <InfoRow label={progressTrainingLabel(t)} value={progressTrainingValue(weeklyReview.completedSessions, weeklyReview.plannedSessions, t)} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoTrainingCopy(t)}</Text>
            )}
            {weeklyReview.nutritionLoggedDays > 0 ? (
              <InfoRow label={progressFoodLabel(t)} value={progressFoodValue(weeklyReview.nutritionTargetDays, weeklyReview.nutritionLoggedDays, t)} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoFoodCopy(t)}</Text>
            )}
            <CollapsibleDetails label={t('plan.detail')}>
              <InfoRow label={t('history.weeklyReadiness')} value={weeklyReview.averageReadiness == null ? t('history.weeklyNoReadiness') : weeklyReview.averageReadiness} />
              <InfoRow label={t('history.adherence14')} value={adherenceLabel} />
              <InfoRow label={t('history.logStreak')} value={logStreak.current || '-'} />
              <Text style={[styles.meta, { color: colors.faint }]}>{describeStreak(logStreak, 'log', locale)}</Text>
            </CollapsibleDetails>
          </SectionCard>

          <SectionCard title={progressNextSignalTitle(t)} body={progressNextSignalBody(logStreak.current, t)}>
            {adherenceStreak.current > 0 ? (
              <InfoRow label={progressStreakLabel(t)} value={adherenceStreak.current} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoTargetCopy(t)}</Text>
            )}
          </SectionCard>

          {profile && baselineMacros && energyBalance.loggedDays >= 3 ? (
            <SectionCard title={progressFoodTrendTitle(t)} body={progressFoodTrendCopy(energyBalance.theoreticalKgChange, t)}>
              <InfoRow
                label={progressFoodTrendMetricLabel(t)}
                value={`${energyBalance.theoreticalKgChange > 0 ? '+' : ''}${showWeight(energyBalance.theoreticalKgChange, 2)} ${weightUnit}`}
              />
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {tab === 'trends' ? (
        <>
          <Card>
            <SectionHeader title={t('history.weight30')} />
            <SimpleLineChart data={isImperial ? weightTrend.map(p => ({ ...p, value: p.value != null ? showWeight(p.value) : p.value })) : weightTrend} unit={weightUnit} color={colors.green} />
          </Card>
          <Card>
            <SectionHeader title={t('history.sleep14')} />
            <SimpleLineChart
              data={sleepTrend.data}
              color={colors.blue}
              format={v => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`}
            />
          </Card>
          <Card>
            <SectionHeader title={t('history.hrv14')} />
            <SimpleLineChart data={hrvTrend.data} color={colors.green} unit="ms" />
          </Card>
          <Card>
            <SectionHeader title={t('history.rhr14')} />
            <SimpleLineChart data={rhrTrend.data} color={colors.red} unit="bpm" />
          </Card>
          <Card>
            <SectionHeader title={trainingLoadTitle(t)} />
            <SimpleLineChart data={strainTrend.data} color={colors.orange} format={v => trainingLoadValueLabel(v, t)} />
            <Text style={[styles.meta, { color: colors.faint }]}>{trainingLoadMeta(t)}</Text>
          </Card>
          <Card>
            <SectionHeader title={t('history.adherence14')} />
            <SimpleLineChart data={adherencePoints} unit="%" color={colors.accent} format={v => t('history.adherenceUnit', { n: Math.round(v) })} />
          </Card>
        </>
      ) : null}

      {tab === 'history' ? (
        <Card>
          <SectionHeader title={t('history.daysOverview')} />
          {summaries.length === 0 ? (
            <EmptyState title={t('history.noDays')} />
          ) : (
            summaries.slice(0, 14).map(item => (
              <Pressable
                key={item.dateKey}
                accessibilityRole="button"
                accessibilityLabel={formatDateLabel(item.dateKey, locale)}
                style={({ pressed }) => [styles.row, { borderBottomColor: colors.hairline }, pressed && { opacity: 0.7 }]}
                onPress={() => handleSelectDay(item.dateKey)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dateLabel, { color: colors.ink }]}>{formatDateLabel(item.dateKey, locale)}</Text>
                  <Text style={[styles.dateSub, { color: colors.muted }]}>{item.dateKey}</Text>
                </View>
                <View style={styles.rightCol}>
                  <Text style={[styles.kcalInfo, { color: colors.muted }]}>{t('history.planLabel')} {item.plannedKcal} kcal</Text>
                  <Text style={[styles.kcalInfo, { color: colors.accent }]}>{t('history.loggedLabel')} {item.loggedKcal} kcal</Text>
                </View>
              </Pressable>
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  emptyCopy: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 6, letterSpacing: 0 },
  heroValue: { textAlign: 'center', fontSize: 38, lineHeight: 44, fontWeight: '700', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  dateLabel: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: 'flex-end' },
  kcalInfo: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
});

function progressTitle(t: Translate): string {
  return t('progress.title');
}

function progressSubtitle(t: Translate): string {
  return t('progress.subtitle');
}

function progressHeroBody(
  averageRatio: number | null,
  completedSessions: number,
  plannedSessions: number,
  nutritionLoggedDays: number,
  t: Translate,
  fallback: string,
): string {
  if (averageRatio == null && completedSessions === 0 && nutritionLoggedDays === 0) {
    return plannedSessions > 0 ? t('progress.heroMarkOrLog') : t('progress.heroLogOne');
  }
  return fallback;
}

function progressHeroStatus(averageRatio: number | null, t: Translate): string | undefined {
  if (averageRatio == null) return undefined;
  if (averageRatio >= 0.9 && averageRatio <= 1.1) return t('progress.statusInRhythm');
  if (averageRatio < 0.9) return t('progress.statusLow');
  return t('progress.statusHigh');
}

function progressTrainingLabel(t: Translate): string {
  return t('progress.trainingLabel');
}

function progressFoodLabel(t: Translate): string {
  return t('progress.foodLabel');
}

function progressConsistencyBody(averageRatio: number | null, t: Translate): string {
  if (averageRatio == null) return t('progress.consistencyEmpty');
  if (averageRatio >= 0.9 && averageRatio <= 1.1) return t('progress.consistencyOnTrack');
  if (averageRatio < 0.9) return t('progress.consistencyUnder');
  return t('progress.consistencyOver');
}

function progressTrainingValue(done: number, planned: number, t: Translate): string {
  return t('progress.trainingValue', { done, planned });
}

function progressFoodValue(onTarget: number, logged: number, t: Translate): string {
  return t('progress.foodValue', { onTarget, logged });
}

function progressNoTrainingCopy(t: Translate): string {
  return t('progress.noTraining');
}

function progressNoFoodCopy(t: Translate): string {
  return t('progress.noFood');
}

/** This slot sits under "Steady days" — the count of days that hit the macro
 *  target — so its empty state is about targets, not logging. It used to be a
 *  byte-for-byte copy of progressNoFoodCopy, which put the same sentence twice
 *  on one screen. */
function progressNoTargetCopy(t: Translate): string {
  return t('progress.noTarget');
}

function progressStreakLabel(t: Translate): string {
  return t('progress.streakLabel');
}

function progressNextSignalTitle(t: Translate): string {
  return t('progress.nextSignalTitle');
}

function progressNextSignalBody(currentLogStreak: number, t: Translate): string {
  return currentLogStreak > 0 ? t('progress.nextSignalKeep') : t('progress.nextSignalStart');
}

function progressFoodTrendTitle(t: Translate): string {
  return t('progress.foodTrendTitle');
}

function progressFoodTrendCopy(changeKg: number, t: Translate): string {
  if (Math.abs(changeKg) < 0.1) return t('progress.trendSteady');
  return changeKg < 0 ? t('progress.trendLoss') : t('progress.trendGain');
}

function progressFoodTrendMetricLabel(t: Translate): string {
  return t('progress.estimatedChange');
}

function trainingLoadTitle(t: Translate): string {
  return t('progress.loadTitle');
}

function trainingLoadMeta(t: Translate): string {
  return t('progress.loadMeta');
}

function trainingLoadValueLabel(value: number, t: Translate): string {
  if (value < 5) return t('progress.loadLight');
  if (value < 11) return t('progress.loadSteady');
  if (value < 16) return t('progress.loadHeavy');
  return t('progress.loadVeryHeavy');
}

function currentWeekDates(selectedDate: string): string[] {
  const base = new Date(`${selectedDate}T12:00:00`);
  const day = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day - 1));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
