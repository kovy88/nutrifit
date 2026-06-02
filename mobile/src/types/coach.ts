// ── COACH DOMAIN TYPES
//
// Centrální entity pro denního AI kouče. `DailyCoachRecommendation` je hlavní
// výstup appky ("co dnes dělat") — skládá ji DETERMINISTICKY
// lib/coaching/dailyCoach.ts z readiness + strain + load + maker + session.
// AI tyhle hodnoty NIKDY nevymýšlí, jen je vysvětluje (viz lib/ai/coachChat).

import type { CoachScope, Macros, TrainingSession } from '../types';
import type { SubjectiveLevel } from './checkin';

/** Koučovací úroveň připravenosti (app-specific, NE medicínská). */
export type ReadinessBand = 'low' | 'medium' | 'high';

/** Doporučená intenzita dnešní aktivity. */
export type RecommendedIntensity = 'rest' | 'easy' | 'moderate' | 'hard';

/** Jak moc datům věříme — odvozeno od počtu dostupných vstupů. */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** Numerické readiness skóre 0–100 + lidské drivery. App-specific, NE medicínské. */
export type ReadinessScore = {
  /** 0–100. */
  score: number;
  band: ReadinessBand;
  recommendedIntensity: RecommendedIntensity;
  /** Krátké lidské faktory, např. "Spánek 5h pod průměrem". */
  drivers: string[];
  /** Spolehlivost podle množství dostupných dat. */
  confidence: ConfidenceLevel;
};

/** Vstupy pro readiness/recovery výpočet. Skládá je lib/coaching/recoveryInputs.ts
 *  z health providera + posledního check-inu + debtTrackeru. Žádná raw HR série. */
export type RecoveryInputs = {
  todaySleepMinutes?: number | null;
  todayRhrBpm?: number | null;
  todayHrvMs?: number | null;
  baseline?: {
    rhrMeanBpm?: number | null;
    hrvMeanMs?: number | null;
    sleepMeanMinutes?: number | null;
  };
  /** Acute:chronic workload ratio z trainingLoad.ts. */
  acwr?: number | null;
  /** Spánkový dluh v hodinách za 14 dní (debtTracker). */
  sleepDebtHours?: number | null;
  /** Recovery debt body (debtTracker). */
  recoveryDebt?: number | null;
  /** Subjektivní energie z posledního check-inu (1–5). */
  subjectiveEnergy?: SubjectiveLevel | null;
  /** Subjektivní bolest/svalovka z posledního check-inu (1–5). */
  subjectiveSoreness?: SubjectiveLevel | null;
};

/** Akce, které kouč nabízí jako quick-action na Today obrazovce. */
export type CoachAction = 'swap_meal' | 'adjust_today' | 'mark_done' | 'ask_coach';

/** HLAVNÍ VÝSTUP APPKY: "co dnes dělat". Deterministicky složené, AI to jen
 *  vysvětluje. Persistuje se per den (history + explainer). */
export type DailyCoachRecommendation = {
  /** YYYY-MM-DD v lokální TZ. */
  date: string;
  /** Na co je kouč zaměřený — řídí, které sekce jsou přítomné. */
  scope: CoachScope;
  /** Krátký nadpis: dnešní akce + stav. */
  headline: string;
  readiness: ReadinessScore;
  /** Přítomné jen když scope zahrnuje trénink. */
  training?: {
    session: TrainingSession | null;
    /** Krátký fokus dne, např. "Aerobní báze" / "Aerobic base". */
    focus: string;
    /** True když jsme session downgradovali kvůli nízké připravenosti. */
    adjusted: boolean;
    /** Co dnes NEdělat (např. "žádné tvrdé intervaly"). */
    whatNotToDo?: string;
  };
  /** Přítomné jen když scope zahrnuje jídelníček. */
  nutrition?: {
    targets: Macros;
    /** Rozdíl proti baseline kvůli tréninku (může být 0). */
    deltaVsBaselineKcal: number;
    reason: string;
  };
  /** Jedna věta s nejdůležitější dnešní akcí. */
  coachNote: string;
  warnings: string[];
  suggestedActions: CoachAction[];
};

/** Role zprávy v coach chatu. */
export type CoachRole = 'user' | 'coach';

/** Jedna zpráva v coach chatu. */
export type CoachMessage = {
  id: string;
  role: CoachRole;
  text: string;
  createdAt: string;
};

/** Malá, odvozená paměť pro coach chat. ŽÁDNÁ raw health data — jen pár faktů,
 *  aby AI mělo kontext bez posílání celé historie. */
export type CoachMemory = {
  /** Stručné shrnutí cíle, např. "lose_fat + run_10k". */
  goalSummary: string;
  /** Týdenní váhový trend v kg/týden (z weekly adjustment / trendu). */
  recentWeightTrendKgPerWeek?: number | null;
  /** Poslední aplikovaná kcal úprava. */
  lastAdjustmentKcal?: number | null;
  updatedAt: string;
};

export type DailyCoachHistoryRecord = {
  date: string;
  recommendation: DailyCoachRecommendation;
  memory: CoachMemory;
  createdAt: string;
  updatedAt: string;
};

export type DailyCoachHistoryMap = Record<string, DailyCoachHistoryRecord>;

export type CoachThreadRecord = {
  date: string;
  messages: CoachMessage[];
  memory: CoachMemory;
  createdAt: string;
  updatedAt: string;
};

export type CoachThreadRecordMap = Record<string, CoachThreadRecord>;
