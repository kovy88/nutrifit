import type { DailyCoachInput } from '../coaching/dailyCoach';
import type { DailyCoachRecommendation } from '../../types/coach';
import { generateDailyCoachRecommendation as runDeterministicRecommendation } from '../coaching/dailyCoach';
import { buildDailyCoachPrompt } from './coach-prompt-builder';
import { validateAiCoachOutput, fallbackCoachMessage } from './ai-output.schema';
import { callAiCoachProxy } from '../../services/api';
import type { UserProfile } from '../../types';

export async function fetchDailyCoachRecommendation(input: DailyCoachInput): Promise<DailyCoachRecommendation> {
  // 1) Compute deterministic recommendation first
  const rec = runDeterministicRecommendation(input);
  const locale = input.locale ?? 'cs';

  // Construct a safe, full UserProfile from the partial one
  const fullProfile: UserProfile = {
    gender: input.profile.gender ?? 'muz',
    primaryGoal: input.profile.primaryGoal,
    trainingGoal: input.profile.trainingGoal ?? 'general_fitness',
    sessionsPerWeek: input.profile.sessionsPerWeek ?? 3,
    experience: input.profile.experience,
    age: input.profile.age ?? 30,
    height: input.profile.height ?? 175,
    weight: input.profile.weight ?? 75,
    activityFactor: input.profile.activityFactor ?? 1.375,
    likes: input.profile.likes ?? '',
    dislikes: input.profile.dislikes ?? '',
    diet: input.profile.diet ?? 'standardní',
    mealCount: input.profile.mealCount ?? 5,
    nutritionMode: input.profile.nutritionMode ?? 'balanced',
    planIntensity: input.profile.planIntensity ?? 'moderate',
    coachScope: input.profile.coachScope,
  };

  // Extract latest check-in
  const latestCheckIn = input.recentCheckIns && input.recentCheckIns.length > 0
    ? input.recentCheckIns[input.recentCheckIns.length - 1]
    : null;

  // Compute weight trend from check-ins if available
  let weightTrend: number | null = null;
  if (input.recentCheckIns && input.recentCheckIns.length >= 2) {
    const first = input.recentCheckIns[0];
    const last = input.recentCheckIns[input.recentCheckIns.length - 1];
    const weeksSpanned = Math.max(1, input.recentCheckIns.length - 1);
    if (first.weightKg != null && last.weightKg != null) {
      weightTrend = (last.weightKg - first.weightKg) / weeksSpanned;
    }
  }

  const promptInput = {
    profile: fullProfile,
    readiness: rec.readiness,
    session: input.session,
    macros: input.todayMacros,
    trainingLoad: input.trainingLoad ?? null,
    sleepMinutes: input.recovery.todaySleepMinutes,
    weightTrendKgPerWeek: weightTrend,
    latestCheckIn,
    planAdherencePct: input.planAdherencePct,
    locale,
  };

  // 2) Build prompt and query AI
  const promptReq = buildDailyCoachPrompt(promptInput);

  try {
    const rawText = await callAiCoachProxy(promptReq);
    let parsed: any = null;
    try {
      const cleaned = String(rawText).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // parse error
    }

    const validated = parsed ? validateAiCoachOutput(parsed) : null;
    if (validated) {
      rec.coachMessage = validated.coachMessage;
      if (validated.warnings && validated.warnings.length > 0) {
        rec.warnings = [...rec.warnings, ...validated.warnings];
      }
      return rec;
    }
  } catch (error) {
    // API or connection failure
  }

  // 3) Fallback if AI fails or returns malformed response
  rec.coachMessage = fallbackCoachMessage(
    rec.readiness.band,
    rec.readiness.recommendedIntensity,
    input.session !== null && input.session.kind !== 'rest',
    locale
  );

  return rec;
}
