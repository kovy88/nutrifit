import { useEffect, useMemo } from 'react';
import { useDailyCoaching, type DailyCoachingState } from './useDailyCoaching';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { generateDailyCoachRecommendation } from '../lib/coaching/dailyCoach';
import { toDateKey } from '../utils/nutrition';
import type { DailyCoachRecommendation, RecoveryInputs } from '../types/coach';
import type { CoachMemory } from '../types/coach';
import { saveDailyCoachRecommendationForDate } from '../services/storage';

export type UseDailyCoachRecommendation = {
  recommendation: DailyCoachRecommendation | null;
  /** Full coaching state (strain/load/debts/assessment) so consumers don't double-fetch. */
  coaching: DailyCoachingState;
  isLoading: boolean;
};

/**
 * Assembles RecoveryInputs from the active provider (via useDailyCoaching) plus
 * the reactive profile/macros/check-ins, then runs the deterministic daily-coach
 * engine. The single source of "what should I do today?" for the Today screen.
 */
export function useDailyCoachRecommendation(date: Date): UseDailyCoachRecommendation {
  const coaching = useDailyCoaching(date);
  const { profile, currentSession, baselineMacros, currentMacros, checkIns, baselineKcalDelta } = useTrenr();
  const { locale } = useLanguage();
  const dKey = toDateKey(date);

  const recommendation = useMemo(() => {
    if (!profile || !baselineMacros || !currentMacros) return null;
    const latest = checkIns.length ? checkIns[checkIns.length - 1] : null;
    const recovery: RecoveryInputs = {
      todaySleepMinutes: coaching.today.sleepMinutes,
      todayRhrBpm: coaching.today.rhrBpm,
      todayHrvMs: coaching.today.hrvMs,
      baseline: coaching.baselines
        ? {
            rhrMeanBpm: coaching.baselines.rhrMeanBpm,
            hrvMeanMs: coaching.baselines.hrvMeanMs,
            sleepMeanMinutes: coaching.baselines.sleepMeanMinutes,
          }
        : undefined,
      acwr: coaching.trainingLoad?.acwr ?? null,
      sleepDebtHours: coaching.sleepDebt?.totalDebtHours ?? null,
      recoveryDebt: coaching.recoveryDebt?.currentDebt ?? null,
      subjectiveEnergy: latest?.energyLevel ?? null,
      subjectiveSoreness: latest?.sorenessLevel ?? null,
    };
    return generateDailyCoachRecommendation({
      date: dKey,
      profile,
      session: currentSession,
      recovery,
      baselineMacros,
      todayMacros: currentMacros,
      trainingLoad: coaching.trainingLoad,
      locale,
    });
  }, [coaching, profile, currentSession, baselineMacros, currentMacros, checkIns, locale, dKey]);

  const memory: CoachMemory | null = useMemo(() => {
    if (!profile) return null;
    return {
      goalSummary: `${profile.primaryGoal} + ${profile.trainingGoal}`,
      lastAdjustmentKcal: baselineKcalDelta || null,
      updatedAt: new Date().toISOString(),
    };
  }, [profile, baselineKcalDelta]);

  useEffect(() => {
    if (!recommendation || !memory) return;
    void saveDailyCoachRecommendationForDate(dKey, recommendation, memory);
  }, [dKey, recommendation, memory]);

  return { recommendation, coaching, isLoading: coaching.isLoading };
}
