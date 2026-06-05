import { describe, it, expect } from 'vitest';
import { planForDate, adjustedPlanForDate } from '../lib/training';
import { localizeTrainingText } from '../lib/training/localizeTitle';

// Any Czech-specific diacritic leaking into an EN plan is a localization miss.
const CZECH = /[ěščřžýáíéůúňťďóĚŠČŘŽÝÁÍÉŮÚŇŤĎÓ]/;

const GOALS = [
  'run_5k', 'run_10k', 'half_marathon', 'marathon', 'couch_to_5k', 'walking_more',
  'strength_basics', 'basic_strength', 'sports_conditioning', 'sport_conditioning',
  'general_fitness', 'hyrox', 'sprint_triathlon', 'olympic_triathlon',
  'half_ironman', 'full_ironman', 'ocr',
];

const DATE = new Date('2026-01-08T12:00:00');
// avg < 360 min → "red" readiness → triggers recovery downgrades / composite titles
const LOW_SLEEP = Array.from({ length: 7 }, () => ({ date: '2026-01-07', totalMinutes: 300 }));

function profileFor(kind: string): any {
  return { trainingGoal: kind, weight: 75, experience: 'beginner', runsPerWeek: 3, programStartISO: '2026-01-05' };
}

function assertNoCzech(plan: any) {
  for (const s of plan.sessions) {
    expect(CZECH.test(s.title), `title leaked Czech: "${s.title}"`).toBe(false);
  }
  for (const w of plan.warnings ?? []) {
    expect(CZECH.test(w), `warning leaked Czech: "${w}"`).toBe(false);
  }
  for (const w of plan.safetyWarnings ?? []) {
    expect(CZECH.test(w), `safetyWarning leaked Czech: "${w}"`).toBe(false);
  }
}

describe('training engine localization (EN)', () => {
  for (const kind of GOALS) {
    it(`${kind}: no Czech in EN plan`, () => {
      assertNoCzech(planForDate(profileFor(kind), DATE, {}, 'en'));
    });

    it(`${kind}: no Czech under low readiness (recovery adjustments)`, () => {
      assertNoCzech(planForDate(profileFor(kind), DATE, { recentSleep: LOW_SLEEP as any }, 'en'));
    });
  }

  it('no Czech after a skipped session (missed-session make-up + "Vynechaný trénink")', () => {
    const profile = profileFor('run_10k');
    const base = planForDate(profile, DATE, {}, 'en');
    const target = base.sessions.find((s: any) => s.kind !== 'rest' && s.durationMinutes > 0);
    expect(target).toBeTruthy();
    const completions = { [target!.date]: { status: 'skipped' } } as any;
    assertNoCzech(adjustedPlanForDate(profile, DATE, completions, {}, 'en').plan);
  });

  it('cs locale is unchanged (Czech preserved)', () => {
    const plan = planForDate(profileFor('general_fitness'), DATE, {}, 'cs');
    expect(CZECH.test(plan.sessions.map((s: any) => s.title).join(' | '))).toBe(true);
  });

  it('localizeTrainingText is idempotent on already-English input', () => {
    expect(localizeTrainingText('Easy run 5 km', 'en')).toBe('Easy run 5 km');
    expect(localizeTrainingText('Rest', 'en')).toBe('Rest');
    expect(localizeTrainingText('Tempo run 6 km (check intensity)', 'en')).toBe('Tempo run 6 km (check intensity)');
  });

  it('translates a representative sample', () => {
    expect(localizeTrainingText('Lehký běh 5 km', 'en')).toBe('Easy run 5 km');
    expect(localizeTrainingText('Volný den', 'en')).toBe('Rest day');
    expect(localizeTrainingText('Síla 30 min (full body)', 'en')).toBe('Strength 30 min (full body)');
    expect(localizeTrainingText('Tempo běh 6 km (kontroluj intenzitu)', 'en')).toBe('Tempo run 6 km (check intensity)');
  });
});
