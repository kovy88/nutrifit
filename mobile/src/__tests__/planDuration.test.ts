import { describe, it, expect } from 'vitest';
import { generateTrainingPlan } from '../lib/training/plan';
import type { TrainingGoalKind } from '../types';
import type { SleepSummary } from '../types/health';

// ── SESSION TITLE vs durationMinutes
//
// Session titles are prose, and many of them state a duration ("Síla 30 min").
// `durationMinutes` is the field everything else actually uses: the workout
// calorie estimate (utils/nutrition.ts), strain/training load, and the AI meal
// prompt, which interpolates BOTH into one sentence:
//
//     `${session.title} (${session.durationMinutes} min, intensity …)`
//
// When the two disagree the user is told one number while the coach plans with
// another — and utils/mealPrompts.ts renders self-contradicting text like
// "Brisk walk or easy run 30 min (19 min, intensity easy)". That happened
// because plan.ts's session() helper ignored the title and derived the field
// from estimateMinutes(), which flattens every strength session to 35 min.
//
// This test walks every goal, several program weeks and both readiness states,
// and asserts the two never disagree.

const GOALS: TrainingGoalKind[] = [
  'general_fitness', 'walking_more', 'couch_to_5k', 'run_5k', 'run_10k',
  'half_marathon', 'marathon', 'strength_basics', 'basic_strength',
  'sport_conditioning', 'sports_conditioning', 'hyrox', 'ocr',
  'sprint_triathlon', 'olympic_triathlon', 'half_ironman', 'full_ironman',
];

const sleep = (totalMinutes: number, i = 1): SleepSummary => ({
  date: `2026-01-0${i}`, totalMinutes, source: 'manual',
});
const badSleep: SleepSummary[] = Array.from({ length: 5 }, (_, i) => sleep(320, i + 1));

/** Minutes a title states in prose, e.g. "Síla 30 min (full body)" → [30]. */
function statedMinutes(title: string): number[] {
  return Array.from(title.matchAll(/(\d+)\s*min\b/g)).map(m => Number(m[1]));
}

/** A title is "simple" when it names exactly one duration and no distance, so
 *  that number can only mean the length of the whole session. Compound titles
 *  ("Mobilita 25 min + chůze 30 min", "Sport / hra 60–90 min", "Tempo běh 6 km
 *  (cca 20 min v tempu)") mix components, ranges or distances — a stated number
 *  there is a part, not the total, so equality is not the right assertion. */
function isSimpleDurationTitle(title: string): boolean {
  return statedMinutes(title).length === 1 && !/\d\s*km\b/.test(title) && !/[–-]\s*\d+\s*min/.test(title);
}

function everySession() {
  const out: { goal: TrainingGoalKind; weekIndex: number; tired: boolean; title: string; durationMinutes: number }[] = [];
  for (const goal of GOALS) {
    for (const weekIndex of [0, 1, 3, 5]) {
      for (const tired of [false, true]) {
        const plan = generateTrainingPlan({
          goal: { kind: goal, currentWeeklyKm: 30 },
          weekStartISO: '2026-01-05',
          weekIndex,
          ...(tired ? { recentSleep: badSleep } : {}),
        });
        for (const s of plan.sessions) {
          if (s.kind === 'rest') continue;
          out.push({ goal, weekIndex, tired, title: s.title, durationMinutes: s.durationMinutes });
        }
      }
    }
  }
  return out;
}

describe('session title vs durationMinutes', () => {
  it('generates sessions across every goal (guards the sweep itself)', () => {
    const all = everySession();
    expect(all.length).toBeGreaterThan(300);
    expect(all.some(s => isSimpleDurationTitle(s.title))).toBe(true);
  });

  it('never states a duration in the title that contradicts durationMinutes', () => {
    const mismatches = everySession()
      .filter(s => isSimpleDurationTitle(s.title))
      .filter(s => statedMinutes(s.title)[0] !== s.durationMinutes)
      .map(s => `${s.goal} w${s.weekIndex}${s.tired ? ' (tired)' : ''}: "${s.title}" says ${statedMinutes(s.title)[0]} min but durationMinutes=${s.durationMinutes}`);

    expect(mismatches).toEqual([]);
  });

  it('gives every non-rest session a positive duration', () => {
    const zero = everySession()
      .filter(s => !(s.durationMinutes > 0))
      .map(s => `${s.goal}: "${s.title}" → ${s.durationMinutes}`);

    expect(zero).toEqual([]);
  });

  it('keeps a compound title consistent with the sum of its parts', () => {
    // "Mobilita 25 min + chůze 30 min" is one 55-minute block, not a 20-minute
    // one — the regression that made this test worth writing.
    const combined = everySession().find(s => s.title.includes('Mobilita 25 min + chůze 30 min'));
    expect(combined?.durationMinutes).toBe(55);
  });
});
