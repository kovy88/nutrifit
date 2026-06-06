import { describe, it, expect } from 'vitest';
import { complementarySuggestions } from '../lib/coaching/complementarySuggestions';
import type { SessionKind, TrainingSession } from '../types';

function s(date: string, kind: SessionKind, intensity: TrainingSession['intensity'] = 'moderate'): TrainingSession {
  return { date, kind, title: kind, durationMinutes: 60, intensity };
}

// Týden Po 2026-01-05 … Ne 2026-01-11, zápas So 2026-01-10
const week: TrainingSession[] = [
  s('2026-01-05', 'sport'),
  s('2026-01-06', 'combat', 'hard'),
  s('2026-01-07', 'strength'),
  s('2026-01-08', 'easy_run', 'easy'),
  s('2026-01-09', 'rest', 'rest'),
  s('2026-01-10', 'match', 'hard'),
  s('2026-01-11', 'rest', 'rest'),
];

describe('complementarySuggestions', () => {
  it('zítra zápas → taper tip', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Hokejbal' }, sessions: week, todayISO: '2026-01-09', locale: 'cs' });
    expect(tips.some(t => t.includes('Zítra zápas'))).toBe(true);
  });

  it('dnes zápas → fueling tip', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Hokejbal' }, sessions: week, todayISO: '2026-01-10', locale: 'cs' });
    expect(tips.some(t => t.includes('Dnes zápas'))).toBe(true);
  });

  it('den po zápase → regenerační tip', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Hokejbal' }, sessions: week, todayISO: '2026-01-11', locale: 'cs' });
    expect(tips.some(t => t.includes('zápase'))).toBe(true);
  });

  it('chybí aerobní + hlavní sport → aerobní tip (en)', () => {
    const noAerobic = week.filter(x => x.kind !== 'easy_run');
    const tips = complementarySuggestions({ mainSport: { label: 'Ball hockey' }, sessions: noAerobic, todayISO: '2026-01-07', locale: 'en' });
    expect(tips.some(t => t.includes('aerobic base for Ball hockey'))).toBe(true);
  });

  it('chybí mobilita → mobility tip', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Hokejbal' }, sessions: week, todayISO: '2026-01-07', locale: 'cs' });
    expect(tips.some(t => t.toLowerCase().includes('mobilit'))).toBe(true);
  });

  it('max 2 tipy', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Hokejbal' }, sessions: week, todayISO: '2026-01-09', locale: 'cs' });
    expect(tips.length).toBeLessThanOrEqual(2);
  });

  it('en locale → anglicky', () => {
    const tips = complementarySuggestions({ mainSport: { label: 'Ball hockey' }, sessions: week, todayISO: '2026-01-09', locale: 'en' });
    expect(tips.some(t => t.includes('Match tomorrow'))).toBe(true);
  });

  it('preset sportu (id) → sport-specifický off-field tip (cs+en)', () => {
    const noMatch = week.filter(x => x.kind !== 'match');
    const cs = complementarySuggestions({ mainSport: { id: 'ice_hockey' }, sessions: noMatch, todayISO: '2026-01-07', locale: 'cs' });
    expect(cs.some(t => t.includes('Mimo led'))).toBe(true);
    const en = complementarySuggestions({ mainSport: { id: 'ice_hockey' }, sessions: noMatch, todayISO: '2026-01-07', locale: 'en' });
    expect(en.some(t => t.includes('Off-ice'))).toBe(true);
  });
});
