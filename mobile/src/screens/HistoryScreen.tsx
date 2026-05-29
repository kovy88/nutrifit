import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Card, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { listStoredDates, loadPlansByDate, loadFoodLogsByDate } from '../services/storage';
import { formatDateLabel } from '../utils/nutrition';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { DateHeader } from '../components/DateHeader';
import { MiniTrendChart } from '../components/MiniTrendChart';
import { useTrend, buildTrendFromRecord } from '../hooks/useTrend';
import { useTheme } from '../context/ThemeContext';
import { computeAdherenceTrend, adherenceToTrendPoints, describeAdherence, macroAdherenceBand } from '../lib/nutrition/adherenceTrend';
import { computeLogStreak, computeAdherenceStreak, describeStreak } from '../lib/nutrition/streaks';
import { useStrainTrend } from '../hooks/useStrainTrend';

type DaySummary = {
  dateKey: string;
  plannedKcal: number;
  loggedKcal: number;
};

import type { TrendPoint } from '../components/MiniTrendChart';

/** Provider source wins per date; manual fills gaps. Both arrays must already
 *  cover the same date range (same length, chronological). */
function mergeWeightTrend(primary: TrendPoint[], fallback: TrendPoint[]): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const p of fallback) byDate.set(p.date, p);
  for (const p of primary) {
    if (p.value != null) byDate.set(p.date, p);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function HistoryScreen() {
  const { setSelectedDate, weights } = useNutriFit();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { colors: themeColors } = useTheme();
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [adherence, setAdherence] = useState(() => computeAdherenceTrend({}, {}, 14));
  const sleepTrend = useTrend('sleep', 14);
  const hrvTrend = useTrend('hrv', 14);
  const rhrTrend = useTrend('rhr', 14);
  const stepsTrend = useTrend('steps', 14);
  const strainTrend = useStrainTrend(14);
  const weightProviderTrend = useTrend('weight', 30);
  // Weight: merge provider history with locally-entered weights (manual log).
  // Provider source wins per-date; manual fills any gaps the provider doesn't
  // know about.
  const weightTrend = mergeWeightTrend(weightProviderTrend.data, buildTrendFromRecord(weights, 30));
  const adherencePoints = adherenceToTrendPoints(adherence.days);
  const logStreak = computeLogStreak(adherence.days);
  const adherenceStreak = computeAdherenceStreak(adherence.days);

  useEffect(() => {
    if (isFocused) {
      loadSummaries();
    }
  }, [isFocused]);

  async function loadSummaries() {
    try {
      const dates = await listStoredDates();
      const [plans, logs] = await Promise.all([
        loadPlansByDate(),
        loadFoodLogsByDate(),
      ]);

      const items: DaySummary[] = dates.map(dateKey => {
        const dayMeals = plans[dateKey] || [];
        const dayLogs = logs[dateKey] || [];
        const plannedKcal = dayMeals.reduce((sum, m) => sum + m.kcal, 0);
        const loggedKcal = dayLogs.reduce((sum, item) => sum + item.kcal, 0);
        return { dateKey, plannedKcal, loggedKcal };
      });

      // Sort descending so the most recent dates are first
      items.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      setSummaries(items);
      // Adherence trend uses the same plans + logs we just loaded.
      setAdherence(computeAdherenceTrend(plans, logs, 14));
    } catch (err) {
      console.error('Failed to load history summaries', err);
    }
  }

  function handleSelectDay(dateKey: string) {
    setSelectedDate(dateKey);
    navigation.navigate('Dnes');
  }

  return (
    <Screen>
      <DateHeader />
      <H1>Pokrok a uloženo</H1>
      <Subtitle>Trendy posledních dnů ze všech připojených zdrojů. Klepnutím na řádek se na den přepneš.</Subtitle>

      <Card>
        <Label>📉 Váha (30 dní)</Label>
        <MiniTrendChart data={weightTrend} unit="kg" color={themeColors.green} />
      </Card>

      <Card>
        <Label>🌙 Spánek (14 dní)</Label>
        <MiniTrendChart
          data={sleepTrend.data}
          unit=""
          color={themeColors.blue}
          format={v => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`}
        />
      </Card>

      <Card>
        <Label>💓 HRV (14 dní)</Label>
        <MiniTrendChart data={hrvTrend.data} unit="ms" color={themeColors.green} />
      </Card>

      <Card>
        <Label>❤️ Klidový tep (14 dní)</Label>
        <MiniTrendChart data={rhrTrend.data} unit="bpm" color={themeColors.red} />
      </Card>

      <Card>
        <Label>👣 Kroky (14 dní)</Label>
        <MiniTrendChart
          data={stepsTrend.data}
          unit=""
          color={themeColors.orange}
          format={v => `${Math.round(v).toLocaleString('cs-CZ')} kroků`}
        />
      </Card>

      <Card>
        <Label>🔥 Tréninkový strain (14 dní)</Label>
        <MiniTrendChart
          data={strainTrend.data}
          unit=""
          color={themeColors.orange}
          format={v => `${v.toFixed(1)} / 21`}
        />
        <Text style={[styles.adherenceMeta, { color: themeColors.faint }]}>
          Whoop-style score 0-21 z TRIMP. Mezera = den bez tréninku.
        </Text>
      </Card>

      <Card>
        <Label>🎯 Adherence k cílům (14 dní)</Label>
        <MiniTrendChart
          data={adherencePoints}
          unit="%"
          color={
            adherence.averageRatio == null
              ? themeColors.muted
              : adherence.averageRatio >= 0.95 && adherence.averageRatio <= 1.05
                ? themeColors.green
                : Math.abs((adherence.averageRatio ?? 1) - 1) > 0.15
                  ? themeColors.red
                  : themeColors.orange
          }
          format={v => `${Math.round(v)} % cíle`}
        />
        <Text style={[styles.adherenceNote, { color: themeColors.muted }]}>
          {describeAdherence(adherence.averageRatio)}
        </Text>
        {/* Per-macro breakdown — 4 chips s % vs cíli za 14 dní */}
        <View style={styles.macroChipsRow}>
          {(['protein', 'carbs', 'fat'] as const).map(macro => {
            const ratio = adherence.averages[macro];
            const band = macroAdherenceBand(ratio);
            const color =
              band === 'on_target' ? themeColors.green
              : band === 'high' ? themeColors.orange
              : band === 'low' ? themeColors.red
              : themeColors.muted;
            const label = macro === 'protein' ? 'B' : macro === 'carbs' ? 'S' : 'T';
            return (
              <View key={macro} style={[styles.macroChip, { borderColor: color }]}>
                <Text style={[styles.macroChipLabel, { color: themeColors.faint }]}>{label}</Text>
                <Text style={[styles.macroChipValue, { color }]}>
                  {ratio != null ? `${Math.round(ratio * 100)} %` : '—'}
                </Text>
              </View>
            );
          })}
        </View>
        {/* Streaks — gamification co odměňuje pravidelnost */}
        <View style={styles.streakRow}>
          <View style={[styles.streakChip, { borderColor: logStreak.current > 0 ? themeColors.orange : themeColors.border }]}>
            <Text style={[styles.streakValue, { color: themeColors.ink }]}>
              {logStreak.current > 0 ? `🔥 ${logStreak.current}` : '—'}
            </Text>
            <Text style={[styles.streakLabel, { color: themeColors.muted }]}>{logStreak.current === 1 ? 'den zapsáno' : 'dní zapsáno'}</Text>
            <Text style={[styles.streakSub, { color: themeColors.faint }]}>{describeStreak(logStreak, 'log')}</Text>
          </View>
          <View style={[styles.streakChip, { borderColor: adherenceStreak.current > 0 ? themeColors.green : themeColors.border }]}>
            <Text style={[styles.streakValue, { color: themeColors.ink }]}>
              {adherenceStreak.current > 0 ? `✓ ${adherenceStreak.current}` : '—'}
            </Text>
            <Text style={[styles.streakLabel, { color: themeColors.muted }]}>{adherenceStreak.current === 1 ? 'den v cíli' : 'dní v cíli'}</Text>
            <Text style={[styles.streakSub, { color: themeColors.faint }]}>{describeStreak(adherenceStreak, 'adherence')}</Text>
          </View>
        </View>
        <Text style={[styles.adherenceMeta, { color: themeColors.faint }]}>
          Logged: {adherence.loggedDays}/14 · Plán: {adherence.plannedDays}/14
        </Text>
      </Card>

      <Card>
        <Label>Přehled dnů</Label>
        {summaries.length === 0 ? (
          <Text style={styles.empty}>Zatím nemáš uložené žádné dny s daty.</Text>
        ) : (
          summaries.map(item => (
            <Pressable
              key={item.dateKey}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => handleSelectDay(item.dateKey)}
            >
              <View style={styles.leftCol}>
                <Text style={styles.dateLabel}>{formatDateLabel(item.dateKey)}</Text>
                <Text style={styles.dateSub}>{item.dateKey}</Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.kcalInfo}>
                  Plán: <Text style={styles.boldKcal}>{item.plannedKcal}</Text> kcal
                </Text>
                <Text style={styles.kcalInfo}>
                  Zapsáno: <Text style={[styles.boldKcal, styles.loggedColor]}>{item.loggedKcal}</Text> kcal
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.faint, textAlign: 'center', paddingVertical: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
    backgroundColor: '#fbfbf8',
  },
  leftCol: {
    flex: 1,
  },
  rightCol: {
    alignItems: 'flex-end',
  },
  dateLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  dateSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  kcalInfo: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  boldKcal: {
    fontWeight: '800',
    color: colors.ink,
  },
  loggedColor: {
    color: colors.green,
  },
  adherenceNote: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  adherenceMeta: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 },
  macroChipsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  macroChip: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  macroChipLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  macroChipValue: { fontSize: 15, fontWeight: '900', marginTop: 2 },
  streakRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  streakChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 10 },
  streakValue: { fontSize: 18, fontWeight: '900' },
  streakLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, marginTop: 2 },
  streakSub: { fontSize: 11, lineHeight: 14, marginTop: 6 },
});
