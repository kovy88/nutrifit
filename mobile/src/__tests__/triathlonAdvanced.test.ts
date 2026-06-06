import { describe, it, expect } from 'vitest';
import { generateTrainingPlan } from '../lib/training';

function tri(kind: any, goalExtra: any = {}) {
  return generateTrainingPlan({ goal: { kind, ...goalExtra }, weekStartISO: '2026-01-05', weekIndex: 4 });
}

describe('triathlon advanced — dvoufázák + taper', () => {
  it('half/full Ironman má dvoufázové dny (second)', () => {
    expect(tri('half_ironman').sessions.some((s: any) => s.second)).toBe(true);
    expect(tri('full_ironman').sessions.filter((s: any) => s.second).length).toBeGreaterThanOrEqual(2);
  });

  it('sprint/olympic zůstává jednofázový', () => {
    expect(tri('sprint_triathlon').sessions.some((s: any) => s.second)).toBe(false);
    expect(tri('olympic_triathlon').sessions.some((s: any) => s.second)).toBe(false);
  });

  it('taper snižuje objem v týdnu závodu + přidá warning', () => {
    const normal = tri('full_ironman');
    const taper = tri('full_ironman', { raceDateISO: '2026-01-07' }); // závod v týdnu začínajícím 2026-01-05
    expect(taper.totalBikeKm!).toBeLessThan(normal.totalBikeKm!);
    expect(taper.warnings.some((w: string) => w.includes('Taper'))).toBe(true);
  });

  it('bez data závodu žádný taper', () => {
    expect(tri('half_ironman').warnings.some((w: string) => w.includes('Taper'))).toBe(false);
  });
});
