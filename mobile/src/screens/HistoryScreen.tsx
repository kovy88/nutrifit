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

type DaySummary = {
  dateKey: string;
  plannedKcal: number;
  loggedKcal: number;
};

export function HistoryScreen() {
  const { setSelectedDate, weights } = useNutriFit();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { colors: themeColors } = useTheme();
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const sleepTrend = useTrend('sleep', 14);
  const hrvTrend = useTrend('hrv', 14);
  const rhrTrend = useTrend('rhr', 14);
  const stepsTrend = useTrend('steps', 14);
  // Weight comes from local NutriFitContext (manual entries) — provider has
  // only single-shot getLatestBodyWeight, not a daily history endpoint yet.
  const weightTrend = buildTrendFromRecord(weights, 30);

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
});
