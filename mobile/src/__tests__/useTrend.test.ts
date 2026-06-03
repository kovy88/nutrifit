import { describe, expect, it } from 'vitest';
import { buildTrendFromRecord } from '../hooks/useTrend';

describe('buildTrendFromRecord', () => {
  it('returns exactly `days` points', () => {
    const out = buildTrendFromRecord({}, 7, new Date('2026-05-28'));
    expect(out.length).toBe(7);
  });

  it('points are chronological (oldest first)', () => {
    const out = buildTrendFromRecord({}, 5, new Date('2026-05-28'));
    expect(out[0].date).toBe('2026-05-24');
    expect(out[out.length - 1].date).toBe('2026-05-28');
  });

  it('null for dates without data', () => {
    const out = buildTrendFromRecord({}, 3, new Date('2026-05-28'));
    expect(out.every(p => p.value === null)).toBe(true);
  });

  it('fills in known values from the record', () => {
    const record = { '2026-05-26': 80.5, '2026-05-28': 80.0 };
    const out = buildTrendFromRecord(record, 3, new Date('2026-05-28'));
    expect(out).toEqual([
      { date: '2026-05-26', value: 80.5 },
      { date: '2026-05-27', value: null },
      { date: '2026-05-28', value: 80.0 },
    ]);
  });

  it('ignores values outside the date window', () => {
    const record = { '2026-04-01': 75, '2026-05-28': 80 };
    const out = buildTrendFromRecord(record, 3, new Date('2026-05-28'));
    // Only the last value (within window) should be present
    expect(out.find(p => p.value === 75)).toBeUndefined();
    expect(out.find(p => p.value === 80)).toBeDefined();
  });

  it('treats explicit 0 as a valid value, not as null', () => {
    const record = { '2026-05-28': 0 };
    const out = buildTrendFromRecord(record, 3, new Date('2026-05-28'));
    const today = out[out.length - 1];
    expect(today.value).toBe(0);
  });

  it('endDate defaults to today when omitted', () => {
    const out = buildTrendFromRecord({}, 3);
    // Last entry should be today
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(out[out.length - 1].date).toBe(expected);
  });
});
