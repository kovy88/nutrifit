import { describe, it, expect } from 'vitest';
import {
  displayWeight, parseWeightToKg, displayDistance, parseDistanceToKm,
  formatWeight, formatDistance, weightUnitLabel, distanceUnitLabel,
} from '../lib/units';

describe('units', () => {
  it('metric = identita', () => {
    expect(displayWeight(72, 'metric')).toBe(72);
    expect(parseWeightToKg(72, 'metric')).toBe(72);
    expect(displayDistance(5, 'metric')).toBe(5);
    expect(parseDistanceToKm(5, 'metric')).toBe(5);
  });

  it('kg ↔ lb', () => {
    expect(displayWeight(80, 'imperial')).toBeCloseTo(176.4, 1);
    expect(parseWeightToKg(176.4, 'imperial')).toBeCloseTo(80, 1);
  });

  it('km ↔ mi', () => {
    expect(displayDistance(10, 'imperial')).toBeCloseTo(6.2, 1);
    expect(parseDistanceToKm(6.21, 'imperial')).toBeCloseTo(10, 1);
  });

  it('round-trip zachová hodnotu', () => {
    const kg = 73.5;
    expect(parseWeightToKg(displayWeight(kg, 'imperial'), 'imperial')).toBeCloseTo(kg, 0);
    const km = 12.3;
    expect(parseDistanceToKm(displayDistance(km, 'imperial'), 'imperial')).toBeCloseTo(km, 0);
  });

  it('formáty + labely', () => {
    expect(formatWeight(72, 'metric')).toBe('72 kg');
    expect(formatDistance(5, 'metric')).toBe('5 km');
    expect(weightUnitLabel('imperial')).toBe('lb');
    expect(distanceUnitLabel('imperial')).toBe('mi');
  });
});
