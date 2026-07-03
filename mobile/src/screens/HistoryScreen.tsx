import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CoachInsightCard, EmptyState, MetricCard, ScreenHeader, SectionHeader } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTrenr } from '../context/TrenrContext';
import { listStoredDates, loadDailyCoachHistory, loadFoodLogsByDate, loadPlansByDate } from '../services/storage';
import { formatDateLabel , primaryGoalToNutritionKind } from '../utils/nutrition';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { SimpleLineChart } from '../components/premium/SimpleLineChart';
import { useTrend, buildTrendFromRecord } from '../hooks/useTrend';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useUnits } from '../hooks/useUnits';
import { computeAdherenceTrend, adherenceToTrendPoints, describeAdherence } from '../lib/nutrition/adherenceTrend';
import { computeAdherenceStreak, computeLogStreak, describeStreak } from '../lib/nutrition/streaks';
import { computeEnergyBalance, describeEnergyBalance } from '../lib/nutrition/energyBalance';
import { useStrainTrend } from '../hooks/useStrainTrend';
import { generateWeeklyMiniReview } from '../lib/coaching/weekly-review';
import { planSessionForDate } from '../lib/training';
import { resolveCoachScope, scopeHasTraining } from '../types';
import type { TrendPoint } from '../components/MiniTrendChart';
import type { TranslationKey } from '../lib/i18n';

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
      const plannedSessions = hasTraining && profile
        ? weekDates.filter(dateKey => {
            const session = planSessionForDate(profile, new Date(`${dateKey}T12:00:00`), {}, locale);
            return session && session.kind !== 'rest';
          }).length
        : 0;
      const completedSessions = weekDates.filter(dateKey => trainingCompletions[dateKey]?.status === 'completed').length;
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

  async function shareWeek() {
    const message = t('history.shareWeekText', {
      training: weeklyReview.completedSessions,
      planned: weeklyReview.plannedSessions,
      readiness: weeklyReview.averageReadiness ?? '-',
      recommendation: t(weeklyReview.recommendationKey),
    });
    await Share.share({ message });
  }

  const adherenceLabel = adherence.averageRatio == null ? '-' : `${Math.round(adherence.averageRatio * 100)}%`;
  const latestWeight = [...weightTrend].reverse().find(point => point.value != null)?.value;

  return (
    <Screen>
      <ScreenHeader eyebrow={t('tab.history')} title={t('history.title')} subtitle={t('history.cleanSubtitle')} />
      <CoachInsightCard
        title={t('history.coachSnapshot')}
        body={describeAdherence(adherence.averageRatio, locale)}
        accent={adherence.averageRatio == null || adherence.averageRatio >= 0.8 ? colors.accent : colors.orange}
      />
      <View style={[styles.segment, { backgroundColor: colors.bgElev, borderColor: colors.hairline }]}>
        {(['overview', 'trends', 'history'] as ProgressTab[]).map(item => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={[styles.segmentItem, tab === item && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.segmentText, { color: tab === item ? colors.accentText : colors.muted }]}>
              {t(`history.tab.${item}` as TranslationKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        <>
          <Card>
            <SectionHeader title={t('history.weeklyConsistency')} />
            <View style={styles.metricGrid}>
              <MetricCard label={t('history.adherence14')} value={adherenceLabel} color={colors.accent} />
              <MetricCard label={t('history.logStreak')} value={logStreak.current || '-'} color={colors.orange} />
              <MetricCard label={t('history.targetStreak')} value={adherenceStreak.current || '-'} color={colors.green} />
              <MetricCard label={t('history.weight30')} value={latestWeight ? String(showWeight(latestWeight)) : '-'} unit={weightUnit} color={colors.blue} />
            </View>
            <Text style={[styles.note, { color: colors.muted }]}>{describeAdherence(adherence.averageRatio, locale)}</Text>
            <Text style={[styles.meta, { color: colors.faint }]}>{describeStreak(logStreak, 'log', locale)}</Text>
          </Card>

          <Card>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title={t('history.weeklyReview')} />
              <Pressable onPress={shareWeek} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('history.shareWeek')}>
                <Ionicons name="share-outline" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <View style={styles.metricGrid}>
              <MetricCard
                label={t('history.weeklyTraining')}
                value={`${weeklyReview.completedSessions}/${weeklyReview.plannedSessions}`}
                color={weeklyReview.trainingAdherencePct == null || weeklyReview.trainingAdherencePct >= 70 ? colors.accent : colors.orange}
              />
              <MetricCard
                label={t('history.weeklyReadiness')}
                value={weeklyReview.averageReadiness == null ? t('history.weeklyNoReadiness') : weeklyReview.averageReadiness}
                color={weeklyReview.averageReadiness == null || weeklyReview.averageReadiness >= 55 ? colors.blue : colors.orange}
              />
              <MetricCard
                label={t('history.weeklyNutrition')}
                value={`${weeklyReview.nutritionTargetDays}/${weeklyReview.nutritionLoggedDays}`}
                color={weeklyReview.nutritionAdherencePct == null || weeklyReview.nutritionAdherencePct >= 70 ? colors.green : colors.orange}
              />
            </View>
            <Text style={[styles.meta, { color: colors.faint }]}>{t('history.weeklyRecommendation')}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>{t(weeklyReview.recommendationKey)}</Text>
          </Card>

          {profile && baselineMacros && energyBalance.loggedDays >= 3 ? (
            <Card>
              <SectionHeader title={t('history.energyBalance14')} />
              <Text style={[styles.heroValue, { color: energyBalance.theoreticalKgChange < -0.2 ? colors.green : energyBalance.theoreticalKgChange > 0.2 ? colors.orange : colors.muted }]}>
                {energyBalance.theoreticalKgChange > 0 ? '+' : ''}{showWeight(energyBalance.theoreticalKgChange, 2)} {weightUnit}
              </Text>
              <Text style={[styles.note, { color: colors.muted }]}>
                {describeEnergyBalance(energyBalance, primaryGoalToNutritionKind(profile.primaryGoal), locale)}
              </Text>
            </Card>
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
            <SectionHeader title={t('history.strain14')} />
            <SimpleLineChart data={strainTrend.data} color={colors.orange} format={v => `${v.toFixed(1)} / 21`} />
            <Text style={[styles.meta, { color: colors.faint }]}>{t('history.strainMeta')}</Text>
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
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  segment: { flexDirection: 'row', borderWidth: 0.5, borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '500', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  heroValue: { textAlign: 'center', fontSize: 38, lineHeight: 44, fontWeight: '700', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  dateLabel: { fontSize: 15, fontWeight: '600' },
  dateSub: { fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: 'flex-end' },
  kcalInfo: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
});

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
