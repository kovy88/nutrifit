import { describe, expect, it } from 'vitest';
import { formatHealthSourceLabel } from '../lib/ui/health-source-labels';
import type { HealthDataSource } from '../types/health';

describe('health source labels', () => {
  it('uses product wording for demo and manual sources', () => {
    expect(formatHealthSourceLabel('mock', 'en')).toBe('Demo');
    expect(formatHealthSourceLabel('mock', 'en', 'full')).toBe('Demo data');
    expect(formatHealthSourceLabel('manual', 'cs')).toBe('Ručně');
    expect(formatHealthSourceLabel('manual', 'cs', 'full')).toBe('Ruční zápis');
  });

  it('does not leak raw enum text for unknown future sources', () => {
    const futureSource = 'future_provider' as HealthDataSource;

    expect(formatHealthSourceLabel(futureSource, 'en')).toBe('Health data');
    expect(formatHealthSourceLabel(futureSource, 'cs')).toBe('Zdravotní data');
  });
});
