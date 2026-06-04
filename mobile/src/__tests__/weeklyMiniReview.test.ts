import { describe, expect, it } from 'vitest';
import { generateWeeklyMiniReview } from '../lib/coaching/weekly-review';

describe('generateWeeklyMiniReview', () => {
  it('summarizes the P0 weekly review metrics', () => {
    const review = generateWeeklyMiniReview({
      completedSessions: 3,
      plannedSessions: 4,
      readinessScores: [72, 68, 64],
      nutritionTargetDays: 5,
      nutritionLoggedDays: 6,
    });

    expect(review.trainingAdherencePct).toBe(75);
    expect(review.averageReadiness).toBe(68);
    expect(review.nutritionAdherencePct).toBe(83);
    expect(review.recommendationKey).toBe('history.weeklyRecommendationHold');
  });

  it('prioritizes recovery before consistency and nutrition advice', () => {
    const review = generateWeeklyMiniReview({
      completedSessions: 1,
      plannedSessions: 5,
      readinessScores: [42, 50, 48],
      nutritionTargetDays: 1,
      nutritionLoggedDays: 5,
    });

    expect(review.recommendationKey).toBe('history.weeklyRecommendationRecover');
  });

  it('falls back to consistency when training adherence is low', () => {
    const review = generateWeeklyMiniReview({
      completedSessions: 1,
      plannedSessions: 4,
      readinessScores: [70, 72],
      nutritionTargetDays: 4,
      nutritionLoggedDays: 4,
    });

    expect(review.recommendationKey).toBe('history.weeklyRecommendationConsistency');
  });
});
