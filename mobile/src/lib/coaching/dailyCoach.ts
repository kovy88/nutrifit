// ── DAILY COACH RECOMMENDATION ENGINE
//
// HLAVNÍ deterministický engine appky. Z existujících koučovacích modulů
// (readiness, training load, makra, morning briefing) složí JEDEN typovaný
// `DailyCoachRecommendation` = "co dnes dělat". AI hodnoty NEVYMÝŠLÍ — engine
// je počítá deterministicky, AI je jen vysvětluje (lib/ai/coachChat).
//
// Nikdy nethrowuje: chybějící data degradují gracefully (viz scoreReadiness).

import { evaluateReadiness, scoreReadiness } from './readiness';
import { applyReadinessToSession } from './applyReadinessToSession';
import { composeMorningBriefing } from './composeMorningBriefing';
import type { TrainingLoadAssessment } from './trainingLoad';
import type { Locale } from '../i18n';
import type { Macros, TrainingSession, UserProfile } from '../../types';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../../types';
import type {
  CoachAction,
  DailyCoachRecommendation,
  RecommendedIntensity,
  RecoveryInputs,
} from '../../types/coach';

function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

const INTENSITY_ORDER: RecommendedIntensity[] = ['rest', 'easy', 'moderate', 'hard'];
const rankIntensity = (i: RecommendedIntensity): number => INTENSITY_ORDER.indexOf(i);

import type { WeeklyCheckIn } from '../../types/checkin';

export type DailyCoachInput = {
  date: string;
  profile: Pick<UserProfile, 'primaryGoal' | 'experience' | 'coachScope'> & Partial<UserProfile>;
  /** Dnešní naplánovaná jednotka (z planneru) nebo null = rest. */
  session: TrainingSession | null;
  recovery: RecoveryInputs;
  /** Makra bez tréninkové úpravy. */
  baselineMacros: Macros;
  /** Makra po tréninkové úpravě (to, co UI ukazuje). */
  todayMacros: Macros;
  trainingLoad?: TrainingLoadAssessment | null;
  locale?: Locale;
  recentCheckIns?: WeeklyCheckIn[];
  planAdherencePct?: number;
};

export type TodayClassification = {
  intensity: RecommendedIntensity;
  focus: string;
};

/** Spojí naplánovanou intenzitu se stropem z readiness → efektivní intenzita + focus. */
export function classifyToday(
  session: TrainingSession | null,
  ceiling: RecommendedIntensity,
  locale: Locale = 'cs',
): TodayClassification {
  if (!session || session.kind === 'rest' || session.intensity === 'rest') {
    return { intensity: 'rest', focus: L(locale, 'Regenerace', 'Recovery') };
  }
  const planned = session.intensity as RecommendedIntensity; // 'easy' | 'moderate' | 'hard'
  const effective = INTENSITY_ORDER[Math.min(rankIntensity(planned), rankIntensity(ceiling))];
  return { intensity: effective, focus: focusFor(session, effective, locale) };
}

function focusFor(session: TrainingSession, intensity: RecommendedIntensity, loc: Locale): string {
  if (intensity === 'rest' || intensity === 'easy') {
    if (session.kind === 'long_run') return L(loc, 'Vytrvalost (klidné tempo)', 'Endurance (easy pace)');
    return L(loc, 'Aerobní báze', 'Aerobic base');
  }
  switch (session.kind) {
    case 'long_run':       return L(loc, 'Vytrvalost', 'Endurance');
    case 'intervals':
    case 'tempo':          return L(loc, 'Rychlost a práh', 'Speed & threshold');
    case 'strength':       return L(loc, 'Síla', 'Strength');
    case 'mobility':       return L(loc, 'Mobilita', 'Mobility');
    case 'functional':
    case 'cross_training': return L(loc, 'Kondice', 'Conditioning');
    case 'swim':           return L(loc, 'Plavání', 'Swim');
    case 'bike':           return L(loc, 'Kolo', 'Bike');
    case 'brick':          return L(loc, 'Brick (kolo+běh)', 'Brick (bike+run)');
    default:               return L(loc, 'Aerobní báze', 'Aerobic base');
  }
}

export function generateDailyCoachRecommendation(input: DailyCoachInput): DailyCoachRecommendation {
  const loc = input.locale ?? 'cs';
  const scope = resolveCoachScope(input.profile);
  const hasTraining = scopeHasTraining(scope);
  const hasNutrition = scopeHasNutrition(scope);
  const readiness = scoreReadiness(input.recovery, loc);

  const assessment = evaluateReadiness({
    todaySleepMinutes: input.recovery.todaySleepMinutes,
    todayRhrBpm: input.recovery.todayRhrBpm,
    todayHrvMs: input.recovery.todayHrvMs,
    baseline: input.recovery.baseline,
    locale: loc,
  });

  const downgrade = input.session ? applyReadinessToSession(input.session, assessment, loc) : null;
  const adjustedSession = downgrade && downgrade.adjusted ? downgrade.session : input.session;
  const adjusted = Boolean(downgrade && downgrade.adjusted);

  const classification = classifyToday(adjustedSession, readiness.recommendedIntensity, loc);

  const briefing = composeMorningBriefing({
    session: adjustedSession,
    readiness: assessment,
    trainingLoad: input.trainingLoad ?? null,
    macros: input.todayMacros,
    baselineMacros: input.baselineMacros,
    locale: loc,
  });

  const deltaVsBaselineKcal = Math.round(input.todayMacros.kcal - input.baselineMacros.kcal);

  const rec: DailyCoachRecommendation = {
    date: input.date,
    scope,
    headline: briefing.headline,
    readiness,
    training: hasTraining ? {
      session: adjustedSession,
      focus: classification.focus,
      adjusted,
      whatNotToDo: buildWhatNotToDo(readiness.recommendedIntensity, input.session, loc),
    } : undefined,
    nutrition: hasNutrition ? {
      targets: input.todayMacros,
      deltaVsBaselineKcal,
      reason: nutritionReason(deltaVsBaselineKcal, adjustedSession, loc),
    } : undefined,
    coachNote: briefing.recommendation,
    warnings: [],
    suggestedActions: buildActions(adjustedSession, hasTraining, hasNutrition),

    // ── NEW STRUCTURED FIELDS ────────────────────────────────────────────────
    readinessScore: readiness.score,
    readinessLabel: readiness.band,
    todayFocus: classification.focus,
    trainingRecommendation: hasTraining ? {
      type: adjustedSession ? adjustedSession.kind : 'rest',
      title: adjustedSession ? adjustedSession.title : L(loc, 'Volno', 'Rest'),
      durationMinutes: adjustedSession ? adjustedSession.durationMinutes : 0,
      intensity: adjustedSession ? `RPE ${adjustedSession.intensity}` : 'rest',
    } : null,
    nutritionRecommendation: hasNutrition ? {
      calories: input.todayMacros.kcal,
      protein: input.todayMacros.protein,
      carbs: input.todayMacros.carbs,
      fat: input.todayMacros.fat,
      reason: nutritionReason(deltaVsBaselineKcal, adjustedSession, loc),
    } : null,
    coachMessage: briefing.recommendation, // initial deterministic message
    quickActions: buildQuickActionLabels(adjustedSession, hasTraining, hasNutrition, loc),
    explanation: buildExplanation({
      readiness,
      classification,
      adjusted,
      adjustedSession,
      hasTraining,
      hasNutrition,
      nutritionReasonText: hasNutrition ? nutritionReason(deltaVsBaselineKcal, adjustedSession, loc) : null,
      trainingLoad: input.trainingLoad ?? null,
      locale: loc,
    }),
  };

  return validateCoachRecommendationSafety(rec, input, loc);
}

function buildQuickActionLabels(
  session: TrainingSession | null,
  hasTraining: boolean,
  hasNutrition: boolean,
  locale: Locale
): string[] {
  const actions: string[] = [];
  if (locale === 'en') {
    actions.push('Check in');
    if (hasTraining && session && session.kind !== 'rest') actions.push('Mark workout done');
    if (hasTraining && session && session.kind !== 'rest') actions.push('No time today');
    if (hasNutrition) actions.push('Simpler meal');
    actions.push('Feeling tired');
  } else {
    actions.push('Zapsat check-in');
    if (hasTraining && session && session.kind !== 'rest') actions.push('Trénink hotový');
    if (hasTraining && session && session.kind !== 'rest') actions.push('Nemám dnes čas');
    if (hasNutrition) actions.push('Chci jednodušší jídlo');
    actions.push('Cítím únavu');
  }
  return actions;
}


function buildWhatNotToDo(
  ceiling: RecommendedIntensity,
  planned: TrainingSession | null,
  loc: Locale,
): string | undefined {
  if (!planned || planned.kind === 'rest' || planned.intensity === 'rest') return undefined;
  const plannedRank = rankIntensity(planned.intensity as RecommendedIntensity);
  if (rankIntensity(ceiling) >= plannedRank) return undefined; // readiness allows the plan
  if (ceiling === 'rest') return L(loc, 'Netrénuj dnes tvrdě — zvol regeneraci nebo chůzi.', "Don't train hard today — choose recovery or a walk.");
  if (ceiling === 'easy') return L(loc, 'Žádné intervaly ani tempo — drž tep v zóně 2.', 'No intervals or tempo — keep HR in zone 2.');
  return L(loc, 'Nepřidávej dnes objem ani intenzitu.', "Don't add volume or intensity today.");
}

function nutritionReason(delta: number, session: TrainingSession | null, loc: Locale): string {
  if (session && session.kind === 'long_run') {
    return L(loc, 'Long run — vyšší sacharidy pro vytrvalost.', 'Long run — higher carbs for endurance.');
  }
  if (delta > 0) return L(loc, `Tréninkový den — +${delta} kcal navíc (sacharidy kolem tréninku).`, `Training day — +${delta} kcal extra (carbs around the workout).`);
  if (delta < 0) return L(loc, 'Volný den — méně sacharidů, víc tuků a bílkovin.', 'Rest day — fewer carbs, more fat and protein.');
  return L(loc, 'Drž denní cíl.', 'Hold your daily target.');
}

function buildActions(session: TrainingSession | null, hasTraining: boolean, hasNutrition: boolean): CoachAction[] {
  const actions: CoachAction[] = [];
  actions.push('check_in');
  if (hasTraining && session && session.kind !== 'rest') actions.push('mark_done');
  if (hasTraining && session && session.kind !== 'rest') actions.push('no_time');
  if (hasNutrition) actions.push('simple_meal');
  actions.push('fatigue');
  return actions;
}

function buildExplanation({
  readiness,
  classification,
  adjusted,
  adjustedSession,
  hasTraining,
  hasNutrition,
  nutritionReasonText,
  trainingLoad,
  locale,
}: {
  readiness: ReturnType<typeof scoreReadiness>;
  classification: TodayClassification;
  adjusted: boolean;
  adjustedSession: TrainingSession | null;
  hasTraining: boolean;
  hasNutrition: boolean;
  nutritionReasonText: string | null;
  trainingLoad: TrainingLoadAssessment | null;
  locale: Locale;
}): string[] {
  const out: string[] = [];
  out.push(L(
    locale,
    `Readiness ${readiness.score}/100 (${readiness.band}) nastavuje dnešní strop intenzity na ${readiness.recommendedIntensity}.`,
    `Readiness ${readiness.score}/100 (${readiness.band}) sets today's intensity ceiling to ${readiness.recommendedIntensity}.`,
  ));
  if (readiness.drivers.length) out.push(readiness.drivers.slice(0, 2).join(' · '));
  if (hasTraining) {
    if (adjusted) {
      out.push(L(locale, 'Trénink byl snížen deterministicky podle readiness guardrails.', 'Training was lowered deterministically by readiness guardrails.'));
    } else if (adjustedSession && adjustedSession.kind !== 'rest') {
      out.push(L(locale, `Dnešní fokus: ${classification.focus}.`, `Today focus: ${classification.focus}.`));
    } else {
      out.push(L(locale, 'Dnes je volno nebo regenerační den.', 'Today is rest or recovery.'));
    }
  }
  if (hasNutrition && nutritionReasonText) out.push(nutritionReasonText);
  if (trainingLoad?.status === 'overreaching' || trainingLoad?.status === 'high_risk') {
    out.push(trainingLoad.recommendation || trainingLoad.message);
  }
  return out;
}

// ── SAFETY VALIDATION ─────────────────────────────────────────────────────────
//
// Poslední pojistka před zobrazením. Vynucuje: nízká readiness ⇒ žádný tvrdý
// trénink; long run ⇒ sacharidy nahoru; začátečník ⇒ žádný agresivní skok.
// Pouze přidává warnings / dorovnává flagy — NIKDY nethrowuje.

export function validateCoachRecommendationSafety(
  rec: DailyCoachRecommendation,
  input: DailyCoachInput,
  locale: Locale = 'cs',
): DailyCoachRecommendation {
  const loc = locale;
  const warnings = [...rec.warnings];
  const planned = input.session;
  const objectiveSignals = [
    input.recovery.todaySleepMinutes,
    input.recovery.todayHrvMs,
    input.recovery.todayRhrBpm,
  ].filter(v => v != null).length;

  if (objectiveSignals === 0) {
    warnings.push(L(
      loc,
      'Readiness je dnes bez dat ze spánku, HRV a klidového tepu — ber ji jen jako orientační.',
      'Readiness has no sleep, HRV or resting-HR data today — treat it as guidance only.',
    ));
  } else if (rec.readiness.confidence === 'low' && planned && planned.intensity === 'hard') {
    warnings.push(L(
      loc,
      'Readiness má nízkou jistotu a čeká tě tvrdá jednotka — před startem zkontroluj pocit únavy.',
      'Readiness confidence is low and a hard session is planned — check fatigue before starting.',
    ));
  }

  // 1) Hard session planned while readiness is low → guardrail.
  if (rec.training && rec.readiness.band === 'low' && planned && planned.intensity === 'hard') {
    if (!rec.training.whatNotToDo) {
      rec.training.whatNotToDo = L(loc, 'Nízká připravenost — vynech tvrdou jednotku.', 'Low readiness — skip the hard session.');
    }
    warnings.push(L(loc, 'Nízká připravenost při naplánované tvrdé jednotce — zvaž regeneraci.', 'Low readiness with a hard session planned — consider recovery.'));
  }

  // 2) Long-run day must not be in a calorie deficit vs baseline.
  if (rec.nutrition && planned && planned.kind === 'long_run' && rec.nutrition.deltaVsBaselineKcal <= 0) {
    warnings.push(L(loc, 'Long run by neměl být v deficitu — přidej sacharidy.', "A long run shouldn't be in a deficit — add carbs."));
  }

  // 3) Beginner + hard session on a non-high readiness day → caution.
  if (input.profile.experience === 'beginner' && planned && planned.intensity === 'hard' && rec.readiness.band !== 'high') {
    warnings.push(L(loc, 'Začátečník: tvrdou jednotku zařaď jen při dobré připravenosti.', 'Beginner: do hard sessions only when readiness is good.'));
  }

  // 4) Training load already computed elsewhere; surface high-risk statuses in
  // the main Today warning list so the user sees the guardrail before training.
  if (input.trainingLoad?.status === 'overreaching' || input.trainingLoad?.status === 'high_risk') {
    warnings.push(input.trainingLoad.recommendation || input.trainingLoad.message);
  }

  rec.warnings = warnings;
  return rec;
}
