import type { ExperienceLevel, Macros, TrainingGoalKind, TrainingSession, UserProfile } from '../../types';
import type { ReadinessBand, ReadinessScore, RecommendedIntensity } from '../../types/coach';
import type { TrainingLoadAssessment } from '../coaching/trainingLoad';
import type { WeeklyCheckIn } from '../../types/checkin';
import type { Locale } from '../i18n';
import { primaryGoalLabel } from '../../utils/nutrition';

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
    '4. Use user-facing wording. Do not repeat stored enum ids or internal acronyms such as primaryGoal, trainingGoal, lose_fat, run_10k, easy, moderate, hard, ACWR, TDEE, or BMR.',
  ].join('\n');

  const contextLines: string[] = [
    `Goal: ${primaryGoalLabel(profile.primaryGoal, locale)}`,
    `Training focus: ${trainingGoalLabel(profile.trainingGoal, locale)} (Experience: ${experienceLabel(profile.experience, locale)})`,
    `Today score: ${readiness.score}/100 (${readinessBandLabel(readiness.band, locale)})`,
    `Today's ceiling: ${intensityLabel(readiness.recommendedIntensity, locale)}`,
    `Key signals: ${readiness.drivers.join(', ')}`,
  ];

  if (session && session.kind !== 'rest') {
    contextLines.push(`Today's workout: ${session.title} (${session.durationMinutes} min, ${intensityLabel(session.intensity, locale)})`);
  } else {
    contextLines.push(locale === 'en' ? "Today's workout: Rest day" : 'Dnešní trénink: Volno');
  }

  contextLines.push(`Nutrition target: ${macros.kcal} kcal (protein ${macros.protein}g, carbs ${macros.carbs}g, fat ${macros.fat}g)`);

  if (trainingLoad) {
    contextLines.push(`Training load vs usual: ${trainingLoadLabel(trainingLoad, locale)}`);
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

function trainingGoalLabel(goal: TrainingGoalKind, locale: Locale): string {
  const en = locale === 'en';
  switch (goal) {
    case 'none': return en ? 'No training focus' : 'Bez tréninkového cíle';
    case 'general_fitness': return en ? 'Fitness' : 'Kondice';
    case 'walking_more': return en ? 'Walking' : 'Chůze';
    case 'couch_to_5k': return 'Couch to 5K';
    case 'run_5k': return '5 km';
    case 'run_10k': return '10 km';
    case 'half_marathon': return en ? 'Half marathon' : 'Půlmaraton';
    case 'marathon': return en ? 'Marathon' : 'Maraton';
    case 'strength_basics':
    case 'basic_strength': return en ? 'Strength' : 'Síla';
    case 'sports_conditioning':
    case 'sport_conditioning':
    case 'play_sport': return en ? 'Sport conditioning' : 'Sportovní kondice';
    case 'hyrox': return 'Hyrox';
    case 'sprint_triathlon': return en ? 'Sprint triathlon' : 'Sprint triatlon';
    case 'olympic_triathlon': return en ? 'Olympic triathlon' : 'Olympijský triatlon';
    case 'half_ironman': return 'Half Ironman';
    case 'full_ironman': return 'Ironman';
    case 'ocr': return 'OCR';
  }
}

function experienceLabel(experience: ExperienceLevel, locale: Locale): string {
  if (locale === 'en') {
    if (experience === 'advanced') return 'Advanced';
    if (experience === 'intermediate') return 'Intermediate';
    return 'Beginner';
  }
  if (experience === 'advanced') return 'Pokročilý';
  if (experience === 'intermediate') return 'Středně pokročilý';
  return 'Začátečník';
}

function readinessBandLabel(band: ReadinessBand, locale: Locale): string {
  if (band === 'high') return locale === 'en' ? 'good day to follow the plan' : 'dobrý den držet plán';
  if (band === 'low') return locale === 'en' ? 'go easier' : 'radši uber';
  return locale === 'en' ? 'steady' : 'drž plán rozumně';
}

function intensityLabel(intensity: RecommendedIntensity | TrainingSession['intensity'], locale: Locale): string {
  if (intensity === 'rest') return locale === 'en' ? 'rest or recovery' : 'volno nebo regenerace';
  if (intensity === 'hard') return locale === 'en' ? 'challenging' : 'náročně';
  if (intensity === 'moderate') return locale === 'en' ? 'steady' : 'normálně';
  return locale === 'en' ? 'light' : 'lehce';
}

function trainingLoadLabel(load: TrainingLoadAssessment, locale: Locale): string {
  const value = load.acwr != null ? ` (${load.acwr.toFixed(2)})` : '';
  if (load.acwr == null) {
    return locale === 'en' ? 'not enough history yet' : 'zatím málo historie';
  }
  if (load.status === 'detraining') return `${locale === 'en' ? 'lighter than usual' : 'lehčí než obvykle'}${value}`;
  if (load.status === 'optimal') return `${locale === 'en' ? 'stable' : 'stabilní'}${value}`;
  if (load.status === 'overreaching') return `${locale === 'en' ? 'higher than usual' : 'vyšší než obvykle'}${value}`;
  return `${locale === 'en' ? 'sharp increase' : 'prudký nárůst'}${value}`;
}
