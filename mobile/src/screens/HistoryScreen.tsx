import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CoachInsightCard, EmptyState, MetricCard, ScreenHeader, SectionHeader } from '../components/UI';
import { Screen } from '../components/Screen';
import { useTrenr } from '../context/TrenrContext';
import { listStoredDates, loadFoodLogsByDate, loadPlansByDate } from '../services/storage';
import { formatDateLabel } from '../utils/nutrition';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { SimpleLineChart } from '../components/premium/SimpleLineChart';
import { useTrend, buildTrendFromRecord } from '../hooks/useTrend';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { computeAdherenceTrend, adherenceToTrendPoints, describeAdherence } from '../lib/nutrition/adherenceTrend';
import { computeAdherenceStreak, computeLogStreak, describeStreak } from '../lib/nutrition/streaks';
import { computeEnergyBalance, describeEnergyBalance } from '../lib/nutrition/energyBalance';
import { primaryGoalToNutritionKind } from '../utils/nutrition';
import { useStrainTrend } from '../hooks/useStrainTrend';
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
  const { setSelectedDate, weights, baselineMacros, profile } = useTrenr();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const [tab, setTab] = useState<ProgressTab>('overview');
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [adherence, setAdherence] = useState(() => computeAdherenceTrend({}, {}, 14));
  const [energyBalance, setEnergyBalance] = useState(() => computeEnergyBalance({ logs: {}, tdee: 2000, days: 14 }));
  const sleepTrend = useTrend('sleep', 14);
  const strainTrend = useStrainTrend(14);
  const weightProviderTrend = useTrend('weight', 30);
  const weightTrend = mergeWeightTrend(weightProviderTrend.data, buildTrendFromRecord(weights, 30));
  const adherencePoints = adherenceToTrendPoints(adherence.days);
  const logStreak = computeLogStreak(adherence.days);
  const adherenceStreak = computeAdherenceStreak(adherence.days);

  useEffect(() => {
    if (isFocused) void loadSummaries();
  }, [isFocused]);

  async function loadSummaries() {
    try {
      const dates = await listStoredDates();
      const [plans, logs] = await Promise.all([loadPlansByDate(), loadFoodLogsByDate()]);
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
      setAdherence(computeAdherenceTrend(plans, logs, 14));
      if (baselineMacros) setEnergyBalance(computeEnergyBalance({ logs, tdee: baselineMacros.tdee, days: 14 }));
    } catch (err) {
      console.error('Failed to load history summaries', err);
    }
  }

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
    navigation.navigate('Dnes');
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
      <View style={[styles.segment, { backgroundColor: colors.bgElev, borderColor: colors.border }]}>
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
              <MetricCard label={t('history.weight30')} value={latestWeight ? latestWeight.toFixed(1) : '-'} unit="kg" color={colors.blue} />
            </View>
            <Text style={[styles.note, { color: colors.muted }]}>{describeAdherence(adherence.averageRatio, locale)}</Text>
            <Text style={[styles.meta, { color: colors.faint }]}>{describeStreak(logStreak, 'log', locale)}</Text>
          </Card>

          {profile && baselineMacros && energyBalance.loggedDays >= 3 ? (
            <Card>
              <SectionHeader title={t('history.energyBalance14')} />
              <Text style={[styles.heroValue, { color: energyBalance.theoreticalKgChange < -0.2 ? colors.green : energyBalance.theoreticalKgChange > 0.2 ? colors.orange : colors.muted }]}>
                {energyBalance.theoreticalKgChange > 0 ? '+' : ''}{energyBalance.theoreticalKgChange.toFixed(2)} kg
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
            <SimpleLineChart data={weightTrend} unit="kg" color={colors.green} />
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
                style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]}
                onPress={() => handleSelectDay(item.dateKey)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dateLabel, { color: colors.ink }]}>{formatDateLabel(item.dateKey)}</Text>
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
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  heroValue: { textAlign: 'center', fontSize: 38, lineHeight: 44, fontWeight: '900', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  dateLabel: { fontSize: 15, fontWeight: '900' },
  dateSub: { fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: 'flex-end' },
  kcalInfo: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
