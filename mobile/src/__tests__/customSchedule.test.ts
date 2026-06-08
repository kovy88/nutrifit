import { describe, it, expect } from 'vitest';
import { materializeWeeklyTemplate, hasCustomSchedule, nextMatchInfo } from '../lib/training/customSchedule';
import { planForDate } from '../lib/training';
import { adjustForDay } from '../utils/nutrition';
import type { WeeklyActivityTemplate } from '../types';

const WEEK = '2026-01-05'; // pondělí

const template: WeeklyActivityTemplate = {
  0: [{ kind: 'sport', title: 'Hokejbal', intensity: 'moderate' }],                                   // Po
  1: [{ kind: 'combat', title: 'Thai box', intensity: 'hard' }],                                      // Út
  2: [{ kind: 'strength', title: 'Fitko', intensity: 'moderate' }, { kind: 'recovery', title: 'Sauna', intensity: 'easy' }], // St (2 aktivity)
  3: [{ kind: 'easy_run', intensity: 'easy' }],                                                        // Čt (bez titulku → default)
  4: [],                                                                                                // Pá (prázdno → rest)
  5: [{ kind: 'match', title: 'Zápas', intensity: 'hard', isMatch: true }],                            // So (zápas)
  // Ne chybí → rest
};

function profileWith(tpl?: WeeklyActivityTemplate): any {
  return { trainingGoal: 'general_fitness', weight: 80, weeklyActivities: tpl, mainSport: { label: 'Hokejbal' } };
}

describe('custom weekly schedule — „Můj týden"', () => {
  it('hasCustomSchedule detekuje neprázdnou šablonu', () => {
    expect(hasCustomSchedule(profileWith(template))).toBe(true);
    expect(hasCustomSchedule(profileWith({}))).toBe(false);
    expect(hasCustomSchedule(profileWith(undefined))).toBe(false);
    expect(hasCustomSchedule(null)).toBe(false);
  });

  it('materializuje 7 session se správnými daty (Po→Ne)', () => {
    const plan = materializeWeeklyTemplate(profileWith(template), WEEK, 'cs');
    expect(plan.sessions).toHaveLength(7);
    expect(plan.sessions[0].date).toBe('2026-01-05');
    expect(plan.sessions[6].date).toBe('2026-01-11');
  });

  it('zachová uživatelský titul, jinak lokalizovaný default', () => {
    const cs = materializeWeeklyTemplate(profileWith(template), WEEK, 'cs');
    const en = materializeWeeklyTemplate(profileWith(template), WEEK, 'en');
    expect(cs.sessions[0].title).toBe('Hokejbal'); // user content beze změny
    expect(cs.sessions[3].title).toBe('Lehký běh'); // bez titulku → cs default
    expect(en.sessions[3].title).toBe('Easy run');  // bez titulku → en default
  });

  it('zápasový den → kind match + hard', () => {
    const plan = materializeWeeklyTemplate(profileWith(template), WEEK, 'cs');
    expect(plan.sessions[5].kind).toBe('match');
    expect(plan.sessions[5].intensity).toBe('hard');
  });

  it('prázdný i chybějící den → rest', () => {
    const plan = materializeWeeklyTemplate(profileWith(template), WEEK, 'cs');
    expect(plan.sessions[4].kind).toBe('rest'); // Pá prázdno
    expect(plan.sessions[6].kind).toBe('rest'); // Ne chybí
  });

  it('víc aktivit za den → primary + druhá jednotka (second)', () => {
    const plan = materializeWeeklyTemplate(profileWith(template), WEEK, 'cs');
    const wed = plan.sessions[2];
    expect(wed.kind).toBe('strength'); // moderate > easy
    expect(wed.title).toBe('Fitko');
    expect(wed.second?.title).toBe('Sauna');
    expect(wed.second?.kind).toBe('recovery');
  });

  it('planForDate routuje na materializer když je šablona', () => {
    const plan = planForDate(profileWith(template), new Date('2026-01-07T12:00:00'), {}, 'cs');
    expect(plan.sessions.find(s => s.date === '2026-01-05')?.title).toBe('Hokejbal');
  });

  it('planForDate použije generátor bez šablony (regrese)', () => {
    const plan = planForDate(profileWith(undefined), new Date('2026-01-07T12:00:00'), {}, 'cs');
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.sessions.some(s => s.title === 'Hokejbal')).toBe(false);
  });

  it('zápasový den dostane carb pre-fuel (fueling)', () => {
    const baseline = { kcal: 2200, protein: 150, carbs: 250, fat: 70, tdee: 2200 } as any;
    const match = { date: WEEK, kind: 'match' as const, title: 'Zápas', durationMinutes: 70, intensity: 'hard' as const };
    const res = adjustForDay(baseline, match, { weight: 80 });
    expect(res.adjustment.carbsDelta).toBeGreaterThan(0);
  });

  it('dvojitý den sečte zátěž obou jednotek (víc sacharidů než jednofázový)', () => {
    const baseline = { kcal: 2200, protein: 150, carbs: 250, fat: 70, tdee: 2200 } as any;
    const single = adjustForDay(baseline, { date: WEEK, kind: 'easy_run', title: 'Běh', durationMinutes: 40, intensity: 'easy' }, { weight: 80 });
    const double = adjustForDay(
      baseline,
      { date: WEEK, kind: 'easy_run', title: 'Běh', durationMinutes: 40, intensity: 'easy', second: { kind: 'bike', title: 'Kolo', durationMinutes: 60, intensity: 'moderate' } },
      { weight: 80 },
    );
    expect(double.adjustment.carbsDelta).toBeGreaterThan(single.adjustment.carbsDelta);
  });

  it('play_sport aktivuje custom režim i s prázdnou šablonou', () => {
    const profile = { trainingGoal: 'play_sport', weight: 80 } as any;
    expect(hasCustomSchedule(profile)).toBe(true);
    const plan = planForDate(profile, new Date('2026-01-07T12:00:00'), {}, 'cs');
    expect(plan.sessions).toHaveLength(7);
    expect(plan.sessions.every(x => x.kind === 'rest')).toBe(true); // prázdná šablona → samé rest, uživatel si týden postaví
  });

  it('sport den bez titulku → jméno sportu (locale-correct)', () => {
    const profile = { trainingGoal: 'play_sport', weeklyActivities: { 0: [{ kind: 'sport', intensity: 'moderate' }] }, mainSport: { id: 'ice_hockey', label: 'Lední hokej' } } as any;
    expect(materializeWeeklyTemplate(profile, WEEK, 'cs').sessions[0].title).toBe('Lední hokej');
    expect(materializeWeeklyTemplate(profile, WEEK, 'en').sessions[0].title).toBe('Ice hockey');
  });
});

describe('nextMatchInfo — odpočet do zápasu', () => {
  const tpl: any = { 0: [{ kind: 'sport', intensity: 'moderate' }], 5: [{ kind: 'match', intensity: 'hard', isMatch: true }] };
  it('dny do příštího zápasu (opakující se týden)', () => {
    expect(nextMatchInfo(tpl, '2026-01-08')).toEqual({ date: '2026-01-10', daysUntil: 2 }); // Čt → So
    expect(nextMatchInfo(tpl, '2026-01-10')?.daysUntil).toBe(0); // zápasový den
    expect(nextMatchInfo(tpl, '2026-01-11')?.daysUntil).toBe(6); // Ne → příští So
  });
  it('bez zápasu → null', () => {
    expect(nextMatchInfo({ 0: [{ kind: 'sport', intensity: 'moderate' }] } as any, '2026-01-08')).toBeNull();
  });
});
