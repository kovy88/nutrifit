// ── APPLY READINESS TO SESSION
//
// Sníží intenzitu naplánovaného tréninku podle dnešní readiness. Nikdy
// neupgraduje — kdyby uživatel měl rest day a readiness 'green', stále
// to zůstane rest day.
//
// Pravidla:
//   readiness.trainingAdjustment = 'reduce_to_easy'      → intensity 'easy'
//   readiness.trainingAdjustment = 'reduce_to_moderate'  → intensity 'moderate' (jen pokud byla 'hard')
//   readiness.trainingAdjustment = null                  → beze změny

import type { TrainingSession } from '../../types';
import type { ReadinessAssessment } from './readiness';

const intensityRank: Record<TrainingSession['intensity'], number> = {
  rest: 0,
  easy: 1,
  moderate: 2,
  hard: 3,
};

export type AppliedSession = {
  /** Konečný session, který se má dnes provést. */
  session: TrainingSession;
  /** True, pokud readiness aktuálně snížila intenzitu oproti původnímu plánu. */
  adjusted: boolean;
  /** Lidská zpráva, proč se intenzita snížila (jen když adjusted=true). */
  reason?: string;
};

export function applyReadinessToSession(
  original: TrainingSession,
  assessment: ReadinessAssessment | null,
): AppliedSession {
  if (!assessment || assessment.trainingAdjustment === null) {
    return { session: original, adjusted: false };
  }
  // Rest a recovery dny necháváme být — readiness je neovlivňuje
  if (original.kind === 'rest' || original.intensity === 'rest') {
    return { session: original, adjusted: false };
  }

  const target: TrainingSession['intensity'] =
    assessment.trainingAdjustment === 'reduce_to_easy' ? 'easy' : 'moderate';

  // Nikdy neupgraduj. Pokud je intenzita už nižší než cíl, beze změny.
  if (intensityRank[target] >= intensityRank[original.intensity]) {
    return { session: original, adjusted: false };
  }

  // Při red day konvertujeme i 'intervals' / 'tempo' / 'long_run' kind na 'easy_run',
  // aby to dávalo smysl s intensitou. Při yellow zachováme kind a jen snížíme intensitu.
  const isHardKind = original.kind === 'intervals' || original.kind === 'tempo';
  const nextKind: TrainingSession['kind'] =
    target === 'easy' && isHardKind ? 'easy_run' : original.kind;

  const nextTitle =
    target === 'easy' && nextKind === 'easy_run' && original.kind !== 'easy_run'
      ? 'Lehký běh (snížená intenzita)'
      : `${original.title} (snížená intenzita)`;

  // Reduce duration too — red day = both intensity AND volume drop ~30 %
  const durationFactor = target === 'easy' ? 0.7 : 0.85;
  const nextDuration = Math.max(20, Math.round(original.durationMinutes * durationFactor));

  return {
    session: {
      ...original,
      kind: nextKind,
      intensity: target,
      durationMinutes: nextDuration,
      title: nextTitle,
    },
    adjusted: true,
    reason: assessment.recommendation,
  };
}
