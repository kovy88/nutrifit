// ── useWeeklySummary
//
// Připraví vstup pro AI weekly summary z dostupných dat:
//   - check-ins z context
//   - 7-day workouts z provideru → strain/ACWR součty
//   - 7-day weight z provideru → trend
//   - 7-day sleep + HRV z provideru → průměry
//
// generate() asynchronně volá Gemini přes services/api a uloží
// nejnovější result do AsyncStorage. UI zobrazí 'last summary'.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrenr } from '../context/TrenrContext';
import { useHealthDataProvider } from './useHealthDataProvider';
import { computeDailyStrain } from '../lib/coaching/strainScore';
import { computeTrainingLoad } from '../lib/coaching/trainingLoad';
import { evaluateReadiness } from '../lib/coaching/readiness';
import { primaryGoalToNutritionKind } from '../utils/nutrition';
import { generateWeeklySummary } from '../services/api';
import { computeAdherenceTrend } from '../lib/nutrition/adherenceTrend';
import { computeLogStreak, computeAdherenceStreak } from '../lib/nutrition/streaks';
import { computeEnergyBalance } from '../lib/nutrition/energyBalance';
import { loadPlansByDate, loadFoodLogsByDate } from '../services/storage';
import type { WeeklySummary, WeeklySummaryInput } from '../lib/ai/weeklySummary';
import { useLanguage } from '../context/LanguageContext';
import { sportName } from '../lib/training/sports';

const STORAGE_KEY = 'nutrifit.weeklySummary.v1';

export type WeeklySummaryState = {
  summary: WeeklySummary | null;
  /** Kdy byl summary vygenerován. null = ještě nikdy. */
  generatedAt: string | null;
  /** ISO datum pondělí týdne, ke kterému se summary váže. */
  weekStartISO: string | null;
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
};

function mondayISO(d: Date = new Date()): string {
  const x = new Date(d);
  const day = x.getDay() || 7; // Sunday = 7
  x.setDate(x.getDate() - (day - 1));
  return toDateKey(x);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useWeeklySummary(): WeeklySummaryState {
  const { locale } = useLanguage();
  const { profile, checkIns, ensureAiConsent, baselineMacros } = useTrenr();
  const provider = useHealthDataProvider();
  const [state, setState] = useState<WeeklySummaryState>({
    summary: null,
    generatedAt: null,
    weekStartISO: null,
    isGenerating: false,
    error: null,
    generate: async () => undefined,
  });

  // Load persisted summary on mount
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!active || !raw) return;
      try {
        const obj = JSON.parse(raw);
        setState(s => ({
          ...s,
          summary: obj.summary || null,
          generatedAt: obj.generatedAt || null,
          weekStartISO: obj.weekStartISO || null,
        }));
      } catch {
        /* ignore */
      }
    });
    return () => { active = false; };
  }, []);

  const generate = useCallback(async () => {
    if (!profile) {
      setState(s => ({ ...s, error: 'no_profile' }));
      return;
    }
    const consent = await ensureAiConsent();
    if (!consent) {
      setState(s => ({ ...s, error: 'no_consent' }));
      return;
    }
    setState(s => ({ ...s, isGenerating: true, error: null }));

    try {
      // Build the 7-day window (previous Monday → previous Sunday).
      const today = new Date();
      const lastMonday = new Date(today);
      const dow = today.getDay() || 7;
      lastMonday.setDate(today.getDate() - (dow - 1) - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      const weekStartISO = toDateKey(lastMonday);
      const weekEndISO = toDateKey(lastSunday);

      // Fetch metrics in parallel
      const [workouts, weights, sleeps] = await Promise.all([
        provider.getWorkoutSummaries(lastMonday, lastSunday).catch(() => []),
        provider.getBodyWeightRange(lastMonday, lastSunday).catch(() => []),
        provider.getSleepSummary(lastMonday, lastSunday).catch(() => []),
      ]);

      // Per-day HRV (used for readiness counts)
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(lastMonday);
        d.setDate(lastMonday.getDate() + i);
        days.push(d);
      }
      const [hrvs, rhrs] = await Promise.all([
        Promise.all(days.map(d => provider.getHrv(d).catch(() => null))),
        Promise.all(days.map(d => provider.getRestingHeartRate(d).catch(() => null))),
      ]);

      // Aggregate strain → totalTrimp + workoutCount + ACWR
      let totalTrimp = 0;
      for (const d of days) {
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const end = new Date(d); end.setHours(23, 59, 59, 999);
        const dayWorkouts = workouts.filter(w => {
          const t = new Date(w.startedAt).getTime();
          return t >= start.getTime() && t <= end.getTime();
        });
        const strain = computeDailyStrain({ plannedSession: null, todaysWorkouts: dayWorkouts });
        totalTrimp += strain.trimp;
      }
      // ACWR needs 28-day window — fetch larger
      const chronicStart = new Date(today);
      chronicStart.setDate(today.getDate() - 28);
      const allWorkouts = await provider.getWorkoutSummaries(chronicStart, today).catch(() => workouts);
      const trainingLoad = computeTrainingLoad({ workouts: allWorkouts, endDate: today });

      // Readiness counts per day
      let red = 0, yellow = 0, green = 0;
      for (let i = 0; i < days.length; i++) {
        const r = evaluateReadiness({
          todaySleepMinutes: sleeps.find(s => s.date === toDateKey(days[i]))?.totalMinutes ?? null,
          todayHrvMs: hrvs[i]?.ms ?? null,
          todayRhrBpm: rhrs[i]?.bpm ?? null,
        });
        if (r.level === 'red') red++;
        else if (r.level === 'yellow') yellow++;
        else green++;
      }

      // Averages
      const sleepMinutes = sleeps.length > 0 ? sleeps.reduce((s, x) => s + x.totalMinutes, 0) / sleeps.length : undefined;
      const hrvValues = hrvs.filter(x => x !== null).map(x => x!.ms);
      const averageHrv = hrvValues.length > 0 ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : undefined;

      // Weight delta — first and last sample in window
      const sortedW = weights.slice().sort((a, b) => a.date.localeCompare(b.date));
      const weightStartKg = sortedW[0]?.weightKg ?? profile.weight;
      const weightEndKg = sortedW[sortedW.length - 1]?.weightKg ?? profile.weight;

      // Latest check-in
      const latestCheckIn = checkIns.length > 0 ? checkIns[checkIns.length - 1] : undefined;

      // Nutrition extras — plans + logs feed adherence, streaks, energy balance.
      // Tyto výpočty jsou bezpečné i bez backendu (jen z AsyncStorage).
      const [plans, foodLogs] = await Promise.all([
        loadPlansByDate(),
        loadFoodLogsByDate(),
      ]);
      const adherenceTrend = computeAdherenceTrend(plans, foodLogs, 7, lastSunday);
      const logStreak = computeLogStreak(adherenceTrend.days, toDateKey(today));
      const adherenceStreakInfo = computeAdherenceStreak(adherenceTrend.days, toDateKey(today));
      const energyBalance = baselineMacros
        ? computeEnergyBalance({ logs: foodLogs, tdee: baselineMacros.tdee, days: 7, endDate: lastSunday })
        : null;

      const input: WeeklySummaryInput = {
        locale,
        weekStartISO,
        weekEndISO,
        goalKind: primaryGoalToNutritionKind(profile.primaryGoal),
        mainSport: profile.mainSport ? sportName(profile.mainSport.id, profile.mainSport.label, locale) : undefined,
        units: profile.units ?? 'metric',
        weightStartKg,
        weightEndKg,
        averageAdherence: adherenceTrend.averageRatio ?? latestCheckIn?.adherence,
        readinessCounts: { red, yellow, green },
        totalTrimp,
        acwr: trainingLoad.acwr,
        workoutCount: workouts.length,
        latestCheckIn,
        averageSleepMinutes: sleepMinutes,
        averageHrvMs: averageHrv,
        // New fields — give AI the full nutrition picture, ne jen jednu metriku
        energyBalanceKcal: energyBalance?.totalBalance,
        theoreticalKgChange: energyBalance?.theoreticalKgChange,
        currentLogStreak: logStreak.current,
        currentAdherenceStreak: adherenceStreakInfo.current,
        macroAdherence: {
          protein: adherenceTrend.averages.protein,
          carbs: adherenceTrend.averages.carbs,
          fat: adherenceTrend.averages.fat,
        },
      };

      const summary = await generateWeeklySummary(input);
      const generatedAt = new Date().toISOString();

      setState({
        summary,
        generatedAt,
        weekStartISO,
        isGenerating: false,
        error: null,
        generate,
      });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ summary, generatedAt, weekStartISO }));
    } catch (err) {
      setState(s => ({
        ...s,
        isGenerating: false,
        error: err instanceof Error ? err.message : 'unknown',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.weight, profile?.primaryGoal, checkIns.length, baselineMacros?.tdee, locale]);

  useEffect(() => {
    setState(s => (s.generate === generate ? s : { ...s, generate }));
  }, [generate]);

  return state;
}

/** Wipe persisted summary. Called by account purge. */
export async function purgeWeeklySummary(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
