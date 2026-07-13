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

  useEffect(() => {
    if (isFocused) void loadSummaries();
  }, [isFocused]);

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

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
    navigation.navigate('Dnes');
  }

  const adherenceLabel = adherence.averageRatio == null ? '-' : `${Math.round(adherence.averageRatio * 100)}%`;
  return (
    <Screen>
      <ScreenHeader eyebrow={t('tab.history')} title={progressTitle(locale)} subtitle={progressSubtitle(locale)} />
      <HeroDecisionCard
        eyebrow={t('tab.history')}
        title={t('history.weeklyReview')}
        body={progressHeroBody(
          adherence.averageRatio,
          weeklyReview.completedSessions,
          weeklyReview.plannedSessions,
          weeklyReview.nutritionLoggedDays,
          locale,
          t(weeklyReview.recommendationKey),
        )}
        accent={adherence.averageRatio == null || adherence.averageRatio >= 0.8 ? colors.accent : colors.orange}
        statusLabel={progressHeroStatus(adherence.averageRatio, locale)}
        statusTone={adherence.averageRatio == null || adherence.averageRatio >= 0.8 ? 'ready' : 'caution'}
      />
      <View style={[styles.segment, { backgroundColor: colors.bgElev, borderColor: colors.border }]}>
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
          <SectionCard title={t('history.weeklyConsistency')} body={progressConsistencyBody(adherence.averageRatio, locale)}>
            {weeklyReview.plannedSessions > 0 ? (
              <InfoRow label={progressTrainingLabel(locale)} value={progressTrainingValue(weeklyReview.completedSessions, weeklyReview.plannedSessions, locale)} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoTrainingCopy(locale)}</Text>
            )}
            {weeklyReview.nutritionLoggedDays > 0 ? (
              <InfoRow label={progressFoodLabel(locale)} value={progressFoodValue(weeklyReview.nutritionTargetDays, weeklyReview.nutritionLoggedDays, locale)} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoFoodCopy(locale)}</Text>
            )}
            <CollapsibleDetails label={t('plan.detail')}>
              <InfoRow label={t('history.weeklyReadiness')} value={weeklyReview.averageReadiness == null ? t('history.weeklyNoReadiness') : weeklyReview.averageReadiness} />
              <InfoRow label={t('history.adherence14')} value={adherenceLabel} />
              <InfoRow label={t('history.logStreak')} value={logStreak.current || '-'} />
              <Text style={[styles.meta, { color: colors.faint }]}>{describeStreak(logStreak, 'log', locale)}</Text>
            </CollapsibleDetails>
          </SectionCard>

          <SectionCard title={progressNextSignalTitle(locale)} body={progressNextSignalBody(logStreak.current, locale)}>
            {adherenceStreak.current > 0 ? (
              <InfoRow label={progressStreakLabel(locale)} value={adherenceStreak.current} />
            ) : (
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>{progressNoTargetCopy(locale)}</Text>
            )}
          </SectionCard>

          {profile && baselineMacros && energyBalance.loggedDays >= 3 ? (
            <SectionCard title={progressFoodTrendTitle(locale)} body={progressFoodTrendCopy(energyBalance.theoreticalKgChange, locale)}>
              <InfoRow
                label={progressFoodTrendMetricLabel(locale)}
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
            <SectionHeader title={trainingLoadTitle(locale)} />
            <SimpleLineChart data={strainTrend.data} color={colors.orange} format={v => trainingLoadValueLabel(v, locale)} />
            <Text style={[styles.meta, { color: colors.faint }]}>{trainingLoadMeta(locale)}</Text>
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
  kcalInfo: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
});

function progressTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'This week' : 'Tento týden';
}

function progressSubtitle(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'A calm review of consistency, trends and saved days.'
    : 'Klidný přehled konzistence, trendů a uložených dní.';
}

function progressHeroBody(
  averageRatio: number | null,
  completedSessions: number,
  plannedSessions: number,
  nutritionLoggedDays: number,
  locale: 'cs' | 'en',
  fallback: string,
): string {
  if (averageRatio == null && completedSessions === 0 && nutritionLoggedDays === 0) {
    if (plannedSessions > 0) {
      return locale === 'en'
        ? 'Mark one planned workout or log one meal today; tomorrow this review will have a real signal.'
        : 'Dnes odškrtni jeden trénink nebo zapiš jídlo; zítra už tady bude skutečný signál.';
    }
    return locale === 'en'
      ? 'Log one useful action today and this review will start guiding the week.'
      : 'Zapiš dnes jednu užitečnou akci a přehled začne vést týden.';
  }
  return fallback;
}

function progressHeroStatus(averageRatio: number | null, locale: 'cs' | 'en'): string | undefined {
  if (averageRatio == null) return undefined;
  if (averageRatio >= 0.9 && averageRatio <= 1.1) return locale === 'en' ? 'In rhythm' : 'V rytmu';
  if (averageRatio < 0.9) return locale === 'en' ? 'A bit low' : 'Spíš nízko';
  return locale === 'en' ? 'A bit high' : 'Spíš vysoko';
}

function progressTrainingLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Training rhythm' : 'Tréninkový rytmus';
}

function progressFoodLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Food rhythm' : 'Jídelní rytmus';
}

function progressConsistencyBody(averageRatio: number | null, locale: 'cs' | 'en'): string {
  if (averageRatio == null) {
    return locale === 'en'
      ? 'Log one planned day and this weekly review will start to fill in.'
      : 'Zapiš jeden plánovaný den a týdenní přehled se začne plnit.';
  }
  if (averageRatio >= 0.9 && averageRatio <= 1.1) {
    return locale === 'en'
      ? 'This week is mostly on track. Keep the next day simple.'
      : 'Tenhle týden jde většinou podle plánu. Další den drž jednoduše.';
  }
  if (averageRatio < 0.9) {
    return locale === 'en'
      ? 'You are trending a little under the plan. Add one normal meal before making bigger changes.'
      : 'Jsi trochu pod plánem. Přidej jedno normální jídlo, než budeš dělat větší změny.';
  }
  return locale === 'en'
    ? 'You are trending a little over the plan. Tighten the next meal, not the whole week.'
    : 'Jsi trochu nad plánem. Zpřesni další jídlo, ne celý týden.';
}

function progressTrainingValue(done: number, planned: number, locale: 'cs' | 'en'): string {
  if (done <= 0) {
    return locale === 'en'
      ? `${planned} planned, none done yet`
      : `${planned} v plánu, zatím nic hotovo`;
  }
  if (done >= planned) {
    return locale === 'en'
      ? `All ${planned} planned workouts done`
      : `Všech ${planned} plánovaných tréninků hotovo`;
  }
  return locale === 'en'
    ? `${done} of ${planned} planned workouts done`
    : `${done} z ${planned} plánovaných tréninků hotovo`;
}

function progressFoodValue(onTarget: number, logged: number, locale: 'cs' | 'en'): string {
  if (onTarget <= 0) {
    return locale === 'en'
      ? `${logged} logged, still finding rhythm`
      : `${logged} zapsáno, rytmus se teprve hledá`;
  }
  if (onTarget >= logged) {
    return locale === 'en'
      ? `All ${logged} logged days fit the plan`
      : `Všech ${logged} zapsaných dní sedí`;
  }
  return locale === 'en'
    ? `${onTarget} of ${logged} logged days fit the plan`
    : `${onTarget} z ${logged} zapsaných dní sedí`;
}

function progressNoTrainingCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'No planned workouts are visible for this week yet.'
    : 'Tenhle týden zatím nemá viditelné plánované tréninky.';
}

function progressNoFoodCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'After one logged meal day, your food rhythm will show here.'
    : 'Po jednom zapsaném jídelním dni se tady ukáže jídelní rytmus.';
}

function progressNoTargetCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Your first steady day will show here after you log a meal.'
    : 'První stabilní den se ukáže po zalogování jídla.';
}

function progressStreakLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Steady days' : 'Stabilní dny';
}

function progressNextSignalTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Next signal' : 'Další signál';
}

function progressNextSignalBody(currentLogStreak: number, locale: 'cs' | 'en'): string {
  if (currentLogStreak > 0) {
    return locale === 'en'
      ? 'Keep the streak simple and repeat one useful check-in tomorrow.'
      : 'Drž streak jednoduše a zítra zopakuj jeden užitečný check-in.';
  }
  return locale === 'en'
    ? 'Start logging today and this review will get useful fast.'
    : 'Začni dnešním zápisem a přehled rychle začne dávat smysl.';
}

function progressFoodTrendTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Food trend' : 'Trend jídla';
}

function progressFoodTrendCopy(changeKg: number, locale: 'cs' | 'en'): string {
  if (Math.abs(changeKg) < 0.1) {
    return locale === 'en'
      ? 'Your recent logs point to a mostly steady weight trend.'
      : 'Poslední zápisy ukazují spíš stabilní trend váhy.';
  }
  if (changeKg < 0) {
    return locale === 'en'
      ? 'Your recent logs point toward gradual weight loss.'
      : 'Poslední zápisy směřují k postupnému úbytku váhy.';
  }
  return locale === 'en'
    ? 'Your recent logs point toward gradual weight gain.'
    : 'Poslední zápisy směřují k postupnému nárůstu váhy.';
}

function progressFoodTrendMetricLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Estimated change' : 'Odhad změny';
}

function trainingLoadTitle(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Training load (14 days)' : 'Tréninková zátěž (14 dní)';
}

function trainingLoadMeta(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'A simple view of how heavy recent training days felt in the plan.'
    : 'Jednoduchý pohled na to, jak těžké byly poslední tréninkové dny v plánu.';
}

function trainingLoadValueLabel(value: number, locale: 'cs' | 'en'): string {
  if (value < 5) return locale === 'en' ? 'Light' : 'Lehce';
  if (value < 11) return locale === 'en' ? 'Steady' : 'Středně';
  if (value < 16) return locale === 'en' ? 'Heavy' : 'Těžší';
  return locale === 'en' ? 'Very heavy' : 'Hodně těžké';
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
