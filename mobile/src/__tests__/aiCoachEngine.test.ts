import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateBmr,
  calculateTdee,
  calculateCalorieTarget,
  calculateMacroTargets,
  adjustMacrosForTrainingDay,
  adjustMacrosForRestDay,
  adjustForLongRunDay,
  validateNutritionSafety,
} from '../lib/nutrition/nutrition-engine';
import { scoreReadiness } from '../lib/coaching/readiness';
import { computeTrainingLoad } from '../lib/coaching/trainingLoad';
import { generateDailyCoachRecommendation } from '../lib/coaching/dailyCoach';
import { fetchDailyCoachRecommendation } from '../lib/ai/ai-coach-service';
import { fallbackCoachMessage } from '../lib/ai/ai-output.schema';
import { generateWeeklyReview, adjustPlanFromCheckIn } from '../lib/coaching/weekly-review';
import { callAiCoachProxy } from '../services/api';
import type { UserProfile, Macros, TrainingSession } from '../types';
import type { WeeklyCheckIn, SubjectiveLevel } from '../types/checkin';
import type { WorkoutSummary } from '../types/health';

vi.mock('../services/api', () => ({
  callAiCoachProxy: vi.fn(),
  askCoach: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockProfile: UserProfile = {
  gender: 'muz',
  primaryGoal: 'lose_fat',
  trainingGoal: 'general_fitness',
  sessionsPerWeek: 3,
  experience: 'beginner',
  age: 30,
  height: 175,
  weight: 75,
  activityFactor: 1.375,
  likes: '',
  dislikes: '',
  diet: 'standardní',
  mealCount: 4,
  nutritionMode: 'balanced',
  planIntensity: 'moderate',
  coachScope: 'both',
};

const mockBaselineMacros: Macros = {
  kcal: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 28,
  waterMl: 2800,
  bmr: 1680,
  tdee: 2310,
  bmi: 24.5,
  goal: 'fat_loss',
};

const mockTodayMacros: Macros = {
  ...mockBaselineMacros,
  kcal: 2200,
  carbs: 250,
};

const mockWorkoutSession: TrainingSession = {
  date: '2026-06-03',
  kind: 'easy_run',
  title: 'Easy run',
  durationMinutes: 35,
  intensity: 'easy',
};

describe('Deterministic Nutrition Calculation', () => {
  it('calculates correct BMR for male and female profiles', () => {
    const maleBmr = calculateBmr(mockProfile);
    expect(maleBmr).toBe(10 * 75 + 6.25 * 175 - 5 * 30 + 5);

    const femaleProfile = { ...mockProfile, gender: 'zena' as const };
    const femaleBmr = calculateBmr(femaleProfile);
    expect(femaleBmr).toBe(10 * 75 + 6.25 * 175 - 5 * 30 - 161);
  });

  it('calculates correct TDEE based on activity factor', () => {
    const tdee = calculateTdee(mockProfile);
    const bmr = calculateBmr(mockProfile);
    expect(tdee).toBe(Math.round(bmr * 1.375));
  });

  it('calculates macro targets matching baseline profiles', () => {
    const targets = calculateMacroTargets(mockProfile);
    expect(targets.kcal).toBeGreaterThan(1200);
    expect(targets.protein).toBeGreaterThan(100);
    expect(targets.carbs).toBeGreaterThan(50);
    expect(targets.fat).toBeGreaterThan(30);
  });
});

describe('Macro Targets & Workout Day Adjustments', () => {
  it('adjusts macros upwards on training days with higher carbs', () => {
    const baseline = calculateMacroTargets(mockProfile);
    const { macros, adjustment } = adjustMacrosForTrainingDay(baseline, mockWorkoutSession, mockProfile.weight);
    expect(macros.carbs).toBeGreaterThan(baseline.carbs);
    expect(macros.kcal).toBeGreaterThan(baseline.kcal);
    expect(adjustment.kcalDelta).toBeGreaterThan(0);
  });

  it('adjusts macros on rest days with lower carbs and higher fats', () => {
    const baseline = calculateMacroTargets(mockProfile);
    const { macros, adjustment } = adjustMacrosForRestDay(baseline);
    expect(macros.carbs).toBeLessThan(baseline.carbs);
    expect(macros.fat).toBeGreaterThan(baseline.fat);
    expect(adjustment.carbsDelta).toBeLessThan(0);
  });

  it('fueling adjustments are higher on long-run days', () => {
    const baseline = calculateMacroTargets(mockProfile);
    const regularResult = adjustMacrosForTrainingDay(baseline, mockWorkoutSession, mockProfile.weight);
    const longRunResult = adjustForLongRunDay(baseline, { ...mockWorkoutSession, kind: 'long_run', durationMinutes: 90 }, mockProfile.weight);
    expect(longRunResult.macros.carbs).toBeGreaterThan(regularResult.macros.carbs);
    expect(longRunResult.macros.kcal).toBeGreaterThan(regularResult.macros.kcal);
  });
});

describe('Readiness Score & Bands', () => {
  it('computes low readiness score when sleep duration is short and resting HR is elevated', () => {
    const recovery = {
      todaySleepMinutes: 300, // 5 hours
      todayRhrBpm: 88, // high RHR
      todayHrvMs: 20, // low HRV
      baseline: {
        sleepMeanMinutes: 480,
        rhrMeanBpm: 65,
        hrvMeanMs: 45,
      },
    };
    const readiness = scoreReadiness(recovery, 'en');
    expect(readiness.score).toBeLessThan(40);
    expect(readiness.band).toBe('low');
    expect(readiness.recommendedIntensity).toBe('rest');
  });

  it('computes high readiness score when sleep, HRV, and RHR are optimal', () => {
    const recovery = {
      todaySleepMinutes: 500,
      todayRhrBpm: 58,
      todayHrvMs: 60,
      baseline: {
        sleepMeanMinutes: 480,
        rhrMeanBpm: 60,
        hrvMeanMs: 50,
      },
    };
    const readiness = scoreReadiness(recovery, 'en');
    expect(readiness.score).toBeGreaterThan(70);
    expect(readiness.band).toBe('high');
    expect(readiness.recommendedIntensity).toBe('hard');
  });
});

describe('Training Load ACWR Statuses', () => {
  it('correctly assesses Detraining status when acute load is very low', () => {
    const workouts: WorkoutSummary[] = [
      { id: 'w1', startedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 60, avgHeartRate: 140, maxHeartRate: 175, source: 'mock' },
      { id: 'w2', startedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 60, avgHeartRate: 140, maxHeartRate: 175, source: 'mock' },
      { id: 'w3', startedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 60, avgHeartRate: 140, maxHeartRate: 175, source: 'mock' },
      { id: 'w4', startedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 60, avgHeartRate: 140, maxHeartRate: 175, source: 'mock' },
    ];
    const assessment = computeTrainingLoad({ workouts, locale: 'en' });
    expect(assessment.status).toBe('detraining');
  });

  it('assesses Optimal workload sweetspot when ACWR is between 0.8 and 1.3', () => {
    const workouts: WorkoutSummary[] = [
      { id: 'w1', startedAt: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 45, avgHeartRate: 140, source: 'mock' },
      { id: 'w2', startedAt: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 45, avgHeartRate: 140, source: 'mock' },
      { id: 'w3', startedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 45, avgHeartRate: 140, source: 'mock' },
      { id: 'w4', startedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(), endedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(), kind: 'run', durationMinutes: 45, avgHeartRate: 140, source: 'mock' },
    ];
    const assessment = computeTrainingLoad({ workouts, locale: 'en' });
    expect(assessment.status).toBe('optimal');
  });

});

describe('Safety Validation rules', () => {
  it('flags calories below the safe absolute floor limits', () => {
    const warnings = validateNutritionSafety(mockProfile, 'fat_loss', 1100, 150, 60, 'en');
    expect(warnings.join(' ')).toContain('below the safe minimum floor');
  });

  it('flags extreme calorie deficit exceeding 25% of TDEE', () => {
    const tdee = calculateTdee(mockProfile); // ~2310
    const aggressiveKcal = tdee - 700; // Deficit is 700 kcal, which is > 25% (~577 kcal)
    const warnings = validateNutritionSafety(mockProfile, 'fat_loss', aggressiveKcal, 150, 60, 'en');
    expect(warnings.join(' ')).toContain('exceeds the safe limit of 25%');
  });

  it('warns about aggressive fat loss coupled with endurance training goals', () => {
    const enduranceProfile = { ...mockProfile, trainingGoal: 'marathon' as const, planIntensity: 'ambitious_but_safe' as const };
    const warnings = validateNutritionSafety(enduranceProfile, 'fat_loss', 1600, 160, 60, 'en');
    expect(warnings.join(' ')).toContain('Combining intensive endurance race training');
  });
});

describe('AI Coach Service & Fallback Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully compiles recommendation with AI coachMessage on valid JSON response', async () => {
    vi.mocked(callAiCoachProxy).mockResolvedValue(JSON.stringify({
      coachMessage: 'Great sleep last night. Push the easy run comfortably.',
      warnings: ['Watch out for light hip soreness.'],
    }));

    const result = await fetchDailyCoachRecommendation({
      date: '2026-06-03',
      profile: mockProfile,
      session: mockWorkoutSession,
      recovery: { todaySleepMinutes: 480 },
      baselineMacros: mockBaselineMacros,
      todayMacros: mockTodayMacros,
      locale: 'en',
    });

    expect(result.coachMessage).toBe('Great sleep last night. Push the easy run comfortably.');
    expect(result.warnings).toContain('Watch out for light hip soreness.');
    expect(result.readinessScore).toBeGreaterThan(0);
    expect(result.readinessLabel).toBeDefined();
    expect(result.todayFocus).toBeDefined();
    expect(result.quickActions).toContain('Ask coach');
  });

  it('gracefully drops back to deterministic fallback message on api timeout/failure', async () => {
    vi.mocked(callAiCoachProxy).mockRejectedValue(new Error('Network failure'));

    const result = await fetchDailyCoachRecommendation({
      date: '2026-06-03',
      profile: mockProfile,
      session: mockWorkoutSession,
      recovery: { todaySleepMinutes: 480 },
      baselineMacros: mockBaselineMacros,
      todayMacros: mockTodayMacros,
      locale: 'en',
    });

    // Should resolve to a fallback message matching the readiness band
    expect(result.coachMessage).toMatch(/condition|readiness|recovery/i);
    expect(result.readinessScore).toBeDefined();
  });

  it('gracefully drops back to fallback message on malformed JSON payload', async () => {
    vi.mocked(callAiCoachProxy).mockResolvedValue('Plain string instead of JSON');

    const result = await fetchDailyCoachRecommendation({
      date: '2026-06-03',
      profile: mockProfile,
      session: mockWorkoutSession,
      recovery: { todaySleepMinutes: 480 },
      baselineMacros: mockBaselineMacros,
      todayMacros: mockTodayMacros,
      locale: 'en',
    });

    expect(result.coachMessage).toBe(fallbackCoachMessage(result.readinessLabel ?? 'medium', 'easy', true, 'en'));
  });
});

describe('Weekly Review Compilation & Adjustments', () => {
  it('correctly creates formatted summaries for weight, training, energy levels, and adjustments', () => {
    const weeklyCheckins: WeeklyCheckIn[] = [
      { weekStartISO: '2026-05-20', weightKg: 80, energyLevel: 4 as SubjectiveLevel, hungerLevel: 2 as SubjectiveLevel, adherence: 0.9, createdAt: '2026-05-20T08:00:00.000Z' },
      { weekStartISO: '2026-05-27', weightKg: 79.5, energyLevel: 3 as SubjectiveLevel, hungerLevel: 3 as SubjectiveLevel, adherence: 0.85, createdAt: '2026-05-27T08:00:00.000Z' },
    ];

    const review = generateWeeklyReview({
      completedSessions: 3,
      plannedSessions: 4,
      weights: [80.0, 79.5],
      recentCheckIns: weeklyCheckins,
      goalKind: 'fat_loss',
      locale: 'en',
    });

    expect(review.trainingCompleted).toContain('Completed 3 out of 4');
    expect(review.weightTrend).toContain('decreasing by');
    expect(review.hungerEnergy).toContain('Energy level: 3/5');
    expect(review.adherence).toContain('adherence: 85%');
    expect(review.recommendedChanges).toBeDefined();
  });

  it('correctly calculates check-in calorie adjustments delegating to adjustment planner', () => {
    const checkins = [
      { weekStartISO: '2026-05-20', weightKg: 80, energyLevel: 3 as SubjectiveLevel, hungerLevel: 3 as SubjectiveLevel, adherence: 0.8, createdAt: '2026-05-20T08:00:00.000Z' },
      { weekStartISO: '2026-05-27', weightKg: 80, energyLevel: 3 as SubjectiveLevel, hungerLevel: 3 as SubjectiveLevel, adherence: 0.8, createdAt: '2026-05-27T08:00:00.000Z' },
    ];

    const adjustment = adjustPlanFromCheckIn({
      goalKind: 'fat_loss',
      recentCheckIns: checkins,
    });

    expect(adjustment.kcalDelta).toBe(-150); // weight stagnated on fat_loss
    expect(adjustment.reason).toMatch(/stagnuje|stagnates/i);
  });
});
