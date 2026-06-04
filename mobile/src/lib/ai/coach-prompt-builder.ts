import type { UserProfile, Macros, TrainingSession } from '../../types';
import type { ReadinessScore, RecoveryInputs } from '../../types/coach';
import type { TrainingLoadAssessment } from '../coaching/trainingLoad';
import type { WeeklyCheckIn } from '../../types/checkin';
import type { Locale } from '../i18n';

export type CoachPromptInput = {
  profile: UserProfile;
  readiness: ReadinessScore;
  session: TrainingSession | null;
  macros: Macros;
  trainingLoad: TrainingLoadAssessment | null;
  sleepMinutes?: number | null;
  weightTrendKgPerWeek?: number | null;
  latestCheckIn?: WeeklyCheckIn | null;
  planAdherencePct?: number | null;
  locale: Locale;
};

export type CoachPromptRequest = {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
};

export function buildDailyCoachPrompt(input: CoachPromptInput): CoachPromptRequest {
  const {
    profile,
    readiness,
    session,
    macros,
    trainingLoad,
    sleepMinutes,
    weightTrendKgPerWeek,
    latestCheckIn,
    planAdherencePct,
    locale,
  } = input;

  const lang = locale === 'en' ? 'English' : 'Czech';

  const systemPrompt = [
    'You are Trenr AI Coach — a daily fitness coach for nutrition, training and recovery.',
    `Reply in ${lang}.`,
    'Return ONLY a valid JSON object matching this schema:',
    '{"coachMessage":"<personalized message explaining the day\'s recommendation, tips, substitutions or encouragement (max 3 sentences)>","warnings":["<any qualitative safety warnings (e.g. pain/soreness advice) - optional>"]}',
    'Do NOT include markdown, code fences, or any text other than the JSON.',
    'CRITICAL BOUNDARIES:',
    '1. NEVER invent, hallucinate, or modify calorie targets, macros, readiness scores, or training durations. Those are pre-calculated by our deterministic engine. You only explain, motivate, and contextualize them.',
    '2. You are not a medical provider. Give no medical diagnosis or claims.',
    '3. Keep coachMessage short, motivating, and highly practical (2-3 sentences).',
  ].join('\n');

  const contextLines: string[] = [
    `Primary goal: ${profile.primaryGoal}`,
    `Training goal: ${profile.trainingGoal} (Experience: ${profile.experience})`,
    `Readiness Score: ${readiness.score}/100 (${readiness.band.toUpperCase()})`,
    `Recommended intensity: ${readiness.recommendedIntensity}`,
    `Readiness drivers: ${readiness.drivers.join(', ')}`,
  ];

  if (session && session.kind !== 'rest') {
    contextLines.push(`Today's Workout: ${session.title} (${session.durationMinutes} min, planned intensity: ${session.intensity})`);
  } else {
    contextLines.push("Today's Workout: Rest Day");
  }

  contextLines.push(`Nutrition Target: ${macros.kcal} kcal (Protein: ${macros.protein}g, Carbs: ${macros.carbs}g, Fat: ${macros.fat}g)`);

  if (trainingLoad) {
    contextLines.push(`Acute-to-Chronic Workload Ratio (ACWR): ${trainingLoad.acwr != null ? trainingLoad.acwr.toFixed(2) : 'Insufficient baseline data'} (${trainingLoad.status})`);
  }

  if (sleepMinutes != null) {
    const hrs = Math.floor(sleepMinutes / 60);
    const mins = sleepMinutes % 60;
    contextLines.push(`Last night sleep: ${hrs}h ${mins}m`);
  }

  if (weightTrendKgPerWeek != null) {
    contextLines.push(`Recent weight trend: ${weightTrendKgPerWeek.toFixed(2)} kg/week`);
  }

  if (latestCheckIn) {
    contextLines.push(`Subjective check-in: Energy ${latestCheckIn.energyLevel}/5, Hunger ${latestCheckIn.hungerLevel}/5`);
  }

  if (planAdherencePct != null) {
    contextLines.push(`Plan Adherence: ${planAdherencePct}%`);
  }

  const prompt = [
    'DAILY CALCULATED PLAN CONTEXT:',
    ...contextLines,
    '',
    'Generate the structured daily coach advice JSON.'
  ].join('\n');

  return { systemPrompt, prompt, maxTokens: 400 };
}
