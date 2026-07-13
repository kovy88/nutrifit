import { describe, expect, it } from 'vitest';
import {
  buildWeeklySummaryRequest,
  parseWeeklySummary,
  type WeeklySummaryInput,
} from '../lib/ai/weeklySummary';

const baseInput: WeeklySummaryInput = {
  weekStartISO: '2026-05-20',
  weekEndISO: '2026-05-26',
  goalKind: 'fat_loss',
};

describe('buildWeeklySummaryRequest — system prompt', () => {
  it('instructs Czech-only output when locale is cs', () => {
    const r = buildWeeklySummaryRequest({ ...baseInput, locale: 'cs' });
    expect(r.systemPrompt).toContain('Czech');
  });

  it('instructs English-only output by default', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.systemPrompt).toContain('English');
  });

  it('instructs not to recompute metrics', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.systemPrompt.toLowerCase()).toContain('do not recompute');
  });

  it('instructs the model to avoid internal product terms in the final text', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.systemPrompt).toContain('Use user-facing wording');
    expect(r.systemPrompt).toContain('ACWR');
    expect(r.systemPrompt).toContain('fat_loss');
  });

  it('embeds schema with headline / highlights / concerns / recommendation', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.systemPrompt).toContain('"headline"');
    expect(r.systemPrompt).toContain('"highlights"');
    expect(r.systemPrompt).toContain('"concerns"');
    expect(r.systemPrompt).toContain('"recommendation"');
  });

  it('uses tight maxTokens (under 1500)', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.maxTokens).toBeLessThan(1500);
    expect(r.maxTokens).toBeGreaterThan(300);
  });
});

describe('buildWeeklySummaryRequest — user prompt content', () => {
  it('includes the week range', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.prompt).toContain('2026-05-20');
    expect(r.prompt).toContain('2026-05-26');
  });

  it('includes the goal kind', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.prompt).toContain('hubnutí');
    expect(r.prompt).not.toContain('fat_loss');
  });

  it('includes main sport when provided', () => {
    const r = buildWeeklySummaryRequest({ ...baseInput, mainSport: 'Ice hockey' });
    expect(r.prompt).toContain('Ice hockey');
  });

  it('passes the unit system to the model', () => {
    expect(buildWeeklySummaryRequest({ ...baseInput, units: 'imperial' }).systemPrompt).toContain('imperial');
  });

  it('embeds weight delta when both endpoints present', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      weightStartKg: 82.5,
      weightEndKg: 81.7,
    });
    expect(r.prompt).toContain('82.5');
    expect(r.prompt).toContain('81.7');
    expect(r.prompt).toContain('-0.8');
  });

  it('omits weight delta when missing', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.prompt).not.toContain('Váha:');
  });

  it('embeds readiness counts', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      readinessCounts: { red: 1, yellow: 2, green: 4 },
    });
    expect(r.prompt).toContain('4× dobrý den');
    expect(r.prompt).toContain('2× opatrně');
    expect(r.prompt).toContain('1× uber');
    expect(r.prompt).not.toContain('4× green');
  });

  it('embeds training load index formatted to 2 decimals without exposing ACWR in the data lines', () => {
    const r = buildWeeklySummaryRequest({ ...baseInput, acwr: 1.234 });
    expect(r.prompt).toContain('1.23');
    expect(r.prompt).toContain('Zátěž proti normálu');
    expect(r.prompt).not.toContain('ACWR:');
  });

  it('embeds adherence as percent', () => {
    const r = buildWeeklySummaryRequest({ ...baseInput, averageAdherence: 0.85 });
    expect(r.prompt).toContain('85%');
  });

  it('embeds latest check-in notes verbatim', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      latestCheckIn: {
        weekStartISO: '2026-05-20',
        adherence: 0.9,
        energyLevel: 4,
        hungerLevel: 2,
        sorenessLevel: 4,
        notes: 'Týden v Itálii, hodně chození',
        createdAt: '2026-05-26T20:00:00Z',
      },
    });
    expect(r.prompt).toContain('Týden v Itálii');
    expect(r.prompt).toContain('Subjektivní bolest/svalovka');
    expect(r.prompt).toContain('"Týden v Itálii, hodně chození"');
  });

  it('instructs to use exact numbers, not round', () => {
    const r = buildWeeklySummaryRequest(baseInput);
    expect(r.prompt.toLowerCase()).toContain('exact numbers');
  });

  it('embeds energy balance kcal when present', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      energyBalanceKcal: -3500,
    });
    expect(r.prompt).toContain('-3500');
    expect(r.prompt).toContain('udržovacímu příjmu');
    expect(r.prompt).not.toContain('TDEE');
  });

  it('embeds theoretical kg change with sign', () => {
    const r1 = buildWeeklySummaryRequest({ ...baseInput, theoreticalKgChange: -0.45 });
    expect(r1.prompt).toContain('-0.45');
    const r2 = buildWeeklySummaryRequest({ ...baseInput, theoreticalKgChange: 0.32 });
    expect(r2.prompt).toContain('+0.32');
  });

  it('embeds streaks when > 0', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      currentLogStreak: 5,
      currentAdherenceStreak: 3,
    });
    expect(r.prompt).toContain('5 dní v řadě se zápisem');
    expect(r.prompt).toContain('3 dní v řadě v cíli');
  });

  it('omits zero streaks (no need to highlight nothing)', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      currentLogStreak: 0,
      currentAdherenceStreak: 0,
    });
    expect(r.prompt).not.toContain('log streak');
    expect(r.prompt).not.toContain('Adherence streak');
  });

  it('embeds per-macro adherence when provided', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      macroAdherence: { protein: 0.92, carbs: 1.08, fat: 0.78 },
    });
    expect(r.prompt).toContain('Protein 92%');
    expect(r.prompt).toContain('Sacharidy 108%');
    expect(r.prompt).toContain('Tuky 78%');
  });

  it('omits per-macro line when all macros are null', () => {
    const r = buildWeeklySummaryRequest({
      ...baseInput,
      macroAdherence: { protein: null, carbs: null, fat: null },
    });
    expect(r.prompt).not.toContain('Dodržení maker');
  });
});

describe('parseWeeklySummary', () => {
  it('parses a valid response', () => {
    const out = parseWeeklySummary({
      headline: 'Skvělý týden!',
      highlights: ['Adherence 95%', 'Spánek nad 7h'],
      concerns: ['HRV klesající'],
      recommendation: 'Přidej regenerace.',
    });
    expect(out).not.toBeNull();
    expect(out!.headline).toBe('Skvělý týden!');
    expect(out!.highlights.length).toBe(2);
    expect(out!.concerns.length).toBe(1);
  });

  it('returns null when headline missing', () => {
    expect(parseWeeklySummary({ highlights: [], concerns: [] })).toBeNull();
  });

  it('returns null for non-object input or missing required fields', () => {
    expect(parseWeeklySummary(null)).toBeNull();
    expect(parseWeeklySummary('string')).toBeNull();
    // Arrays without headline → null (no required string field)
    expect(parseWeeklySummary([1, 2, 3])).toBeNull();
  });

  it('filters non-string entries from highlights / concerns', () => {
    const out = parseWeeklySummary({
      headline: 'X',
      highlights: ['ok', 123, null, 'good'],
      concerns: [],
      recommendation: 'do thing',
    });
    expect(out!.highlights).toEqual(['ok', 'good']);
  });

  it('defaults concerns and highlights to empty array when missing', () => {
    const out = parseWeeklySummary({ headline: 'X', recommendation: 'Y' });
    expect(out!.highlights).toEqual([]);
    expect(out!.concerns).toEqual([]);
  });

  it('treats non-string recommendation as empty', () => {
    const out = parseWeeklySummary({ headline: 'X', recommendation: 42 });
    expect(out!.recommendation).toBe('');
  });
});
