// ── CHAT-FIRST ONBOARDING CONTRACT
//
// The model extracts intent into a partial profile draft. It never decides that
// onboarding is valid; `lib/onboarding/validation.ts` and training feasibility
// remain the deterministic gate.

import type {
  CoachScope,
  DietStyle,
  ExperienceLevel,
  Gender,
  NutritionMode,
  PlanIntensity,
  PrimaryGoal,
  TrainingGoalKind,
  UserProfile,
} from '../../types';
import type { Locale } from '../i18n';

export type OnboardingCoachMessage = {
  role: 'user' | 'coach';
  text: string;
};

export type OnboardingExtractedFields = Partial<Pick<UserProfile,
  | 'coachScope'
  | 'primaryGoal'
  | 'trainingGoal'
  | 'sessionsPerWeek'
  | 'experience'
  | 'currentWeeklyKm'
  | 'longestRecentRunKm'
  | 'runsPerWeek'
  | 'injuryFlag'
  | 'runWalkPreferred'
  | 'raceDateISO'
  | 'targetTimeSeconds'
  | 'currentPaceSecPerKm'
  | 'availableTrainingDays'
  | 'preferredRestDays'
  | 'gender'
  | 'age'
  | 'height'
  | 'weight'
  | 'diet'
  | 'nutritionMode'
  | 'planIntensity'
>>;

export type OnboardingCoachRequest = {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
};

export type OnboardingCoachReply = {
  reply: string;
  extracted: OnboardingExtractedFields;
  confidence: 'low' | 'medium' | 'high';
  missingFields: (keyof OnboardingExtractedFields)[];
};

const COACH_SCOPE_VALUES: CoachScope[] = ['both', 'training', 'nutrition'];
const PRIMARY_GOALS: PrimaryGoal[] = [
  'lose_fat',
  'maintain_weight',
  'gain_muscle',
  'improve_fitness',
  'improve_running',
  'improve_recovery',
  'build_consistency',
];
const TRAINING_GOALS: TrainingGoalKind[] = [
  'general_fitness',
  'walking_more',
  'couch_to_5k',
  'run_5k',
  'run_10k',
  'half_marathon',
  'marathon',
  'strength_basics',
  'sports_conditioning',
  'hyrox',
  'sprint_triathlon',
  'olympic_triathlon',
  'half_ironman',
  'full_ironman',
  'ocr',
];
const EXPERIENCE: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
const GENDERS: Gender[] = ['muz', 'zena'];
const DIETS: DietStyle[] = ['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'];
const NUTRITION_MODES: NutritionMode[] = ['balanced', 'high_protein', 'budget_friendly', 'simple_meal_prep', 'endurance_fueling', 'fat_loss_friendly', 'muscle_gain_friendly'];
const PLAN_INTENSITIES: PlanIntensity[] = ['easy', 'moderate', 'ambitious_but_safe'];

export function buildOnboardingCoachRequest(opts: {
  draft: UserProfile;
  history: OnboardingCoachMessage[];
  userText: string;
  locale: Locale;
  missingFields?: string[];
}): OnboardingCoachRequest {
  const lang = opts.locale === 'en' ? 'English' : 'Czech';
  const systemPrompt = [
    'You are Trenr onboarding coach.',
    `Reply in ${lang}.`,
    'Return ONLY valid JSON with shape {"reply":"...","extracted":{...},"confidence":"low|medium|high","missingFields":["..."]}.',
    'Extract only fields the user clearly stated or strongly implied. Do not invent body metrics, race dates, calories, macros, readiness, or training volume.',
    'The app will validate extracted fields deterministically; if something is missing, ask one concise follow-up.',
    'If DETERMINISTIC MISSING FIELDS is provided, steer the follow-up to the first listed field. Do not skip ahead.',
    'Use raw enum ids and field names only inside "extracted" and "missingFields". The user-facing "reply" must use plain language, not labels like primaryGoal, trainingGoal, nutritionMode, planIntensity, lose_fat, run_10k, easy, moderate, or ambitious_but_safe.',
    'Keep onboarding light. Do not offer advanced events or sports like marathon, triathlon, Hyrox, Ironman, or OCR unless the user explicitly mentions that exact goal.',
    `Allowed coachScope: ${COACH_SCOPE_VALUES.join(', ')}`,
    `Allowed primaryGoal: ${PRIMARY_GOALS.join(', ')}`,
    `Allowed trainingGoal: ${TRAINING_GOALS.join(', ')}`,
    `Allowed experience: ${EXPERIENCE.join(', ')}`,
    `Allowed gender: ${GENDERS.join(', ')}`,
    `Allowed diet: ${DIETS.join(', ')}`,
    `Allowed nutritionMode: ${NUTRITION_MODES.join(', ')}`,
    `Allowed planIntensity: ${PLAN_INTENSITIES.join(', ')}`,
  ].join('\n');

  const prompt = [
    'CURRENT DRAFT:',
    JSON.stringify(summarizeDraft(opts.draft)),
    '',
    'DETERMINISTIC MISSING FIELDS:',
    opts.missingFields?.length ? opts.missingFields.join(', ') : 'none',
    '',
    'RECENT CHAT:',
    ...opts.history.slice(-8).map(m => `${m.role}: ${m.text}`),
    '',
    `USER: ${opts.userText}`,
  ].join('\n');

  return { systemPrompt, prompt, maxTokens: 900 };
}

function summarizeDraft(draft: UserProfile): OnboardingExtractedFields {
  return {
    coachScope: draft.coachScope,
    primaryGoal: draft.primaryGoal,
    trainingGoal: draft.trainingGoal,
    sessionsPerWeek: draft.sessionsPerWeek,
    experience: draft.experience,
    currentWeeklyKm: draft.currentWeeklyKm,
    longestRecentRunKm: draft.longestRecentRunKm,
    runsPerWeek: draft.runsPerWeek,
    injuryFlag: draft.injuryFlag,
    runWalkPreferred: draft.runWalkPreferred,
    raceDateISO: draft.raceDateISO,
    targetTimeSeconds: draft.targetTimeSeconds,
    currentPaceSecPerKm: draft.currentPaceSecPerKm,
    availableTrainingDays: draft.availableTrainingDays,
    preferredRestDays: draft.preferredRestDays,
    gender: draft.gender,
    age: draft.age,
    height: draft.height,
    weight: draft.weight,
    diet: draft.diet,
    nutritionMode: draft.nutritionMode,
    planIntensity: draft.planIntensity,
  };
}
