import { describe, expect, it } from 'vitest';
import { generateWeeklyReview, adjustPlanFromCheckIn } from '../lib/coaching/weekly-review';
import type { WeeklyCheckIn, SubjectiveLevel } from '../types/checkin';

describe('Weekly Review Compilation & Adjustments', () => {
  it('creates formatted summaries for weight, training, energy and adjustments', () => {
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

  it('delegates check-in calorie adjustments to the planner', () => {
    const checkins: WeeklyCheckIn[] = [
      { weekStartISO: '2026-05-20', weightKg: 80, energyLevel: 3 as SubjectiveLevel, hungerLevel: 3 as SubjectiveLevel, adherence: 0.8, createdAt: '2026-05-20T08:00:00.000Z' },
      { weekStartISO: '2026-05-27', weightKg: 80, energyLevel: 3 as SubjectiveLevel, hungerLevel: 3 as SubjectiveLevel, adherence: 0.8, createdAt: '2026-05-27T08:00:00.000Z' },
    ];

    const adjustment = adjustPlanFromCheckIn({ goalKind: 'fat_loss', recentCheckIns: checkins, locale: 'cs' });

    expect(adjustment.kcalDelta).toBe(-150); // weight stagnated on fat_loss
    expect(adjustment.reason).toMatch(/stagnuje|stalled/i);
  });
});
