import { describe, it, expect } from 'vitest';
import { SPORTS, SPORT_IDS, sportName, sportTip, cloneStarter } from '../lib/training/sports';

describe('sport library', () => {
  it('knihovna Základ = 6 sportů', () => {
    expect(SPORT_IDS.length).toBe(6);
  });

  for (const id of SPORT_IDS) {
    it(`${id}: kompletní preset (jméno cs/en, starter, ≥3 off-field, tip cs/en)`, () => {
      const sp = SPORTS[id];
      expect(sp.name('cs')).toBeTruthy();
      expect(sp.name('en')).toBeTruthy();
      expect(Object.keys(sp.starter).length).toBeGreaterThanOrEqual(4);
      expect(sp.offField.length).toBeGreaterThanOrEqual(3);
      sp.offField.forEach(o => {
        expect(o.title('cs')).toBeTruthy();
        expect(o.title('en')).toBeTruthy();
      });
      expect(sp.tip('cs')).toBeTruthy();
      expect(sp.tip('en')).toBeTruthy();
    });
  }

  it('každý starter má zápasový den', () => {
    for (const id of SPORT_IDS) {
      const all = Object.values(cloneStarter(id)).flat();
      expect(all.some(a => a.isMatch || a.kind === 'match')).toBe(true);
    }
  });

  it('cloneStarter nesdílí reference s katalogem', () => {
    const a = cloneStarter('football');
    a[0]![0].intensity = 'hard';
    expect(SPORTS.football.starter[0]![0].intensity).toBe('moderate');
  });

  it('sportName/sportTip: id → knihovna, jinak label / null', () => {
    expect(sportName('ice_hockey', 'x', 'en')).toBe('Ice hockey');
    expect(sportName('ice_hockey', 'x', 'cs')).toBe('Lední hokej');
    expect(sportName(undefined, 'Moje hra', 'cs')).toBe('Moje hra');
    expect(sportTip('football', 'cs')).toContain('Nordic');
    expect(sportTip(undefined, 'cs')).toBeNull();
  });
});
