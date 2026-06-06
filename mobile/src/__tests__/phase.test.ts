import { describe, it, expect } from 'vitest';
import { trainingPhase } from '../lib/training/phase';

describe('trainingPhase', () => {
  it('custom rytmus / žádný cíl → null', () => {
    expect(trainingPhase({ weekIndex: 2, weekStartISO: '2026-01-05', goalKind: 'play_sport' })).toBeNull();
    expect(trainingPhase({ weekIndex: 2, weekStartISO: '2026-01-05', goalKind: 'none' })).toBeNull();
  });

  it('běžný týden → build', () => {
    expect(trainingPhase({ weekIndex: 2, weekStartISO: '2026-01-05', goalKind: 'marathon' })).toBe('build');
  });

  it('každý 4. týden → deload', () => {
    expect(trainingPhase({ weekIndex: 3, weekStartISO: '2026-01-05', goalKind: 'marathon' })).toBe('deload');
  });

  it('týden závodu → race_week', () => {
    expect(trainingPhase({ weekIndex: 10, weekStartISO: '2026-01-05', raceDateISO: '2026-01-07', goalKind: 'marathon' })).toBe('race_week');
  });

  it('taper před závodem (marathon, 1 týden do závodu)', () => {
    expect(trainingPhase({ weekIndex: 10, weekStartISO: '2026-01-05', raceDateISO: '2026-01-14', goalKind: 'marathon' })).toBe('taper');
  });

  it('peak těsně před taperem', () => {
    // marathon taper = 3; závod za 4 týdny → peak (taper+1)
    expect(trainingPhase({ weekIndex: 10, weekStartISO: '2026-01-05', raceDateISO: '2026-02-02', goalKind: 'marathon' })).toBe('peak');
  });
});
