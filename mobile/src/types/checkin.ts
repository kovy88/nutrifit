// ── WEEKLY CHECK-IN TYPES
//
// Týdenní reflexe od uživatele. Tři kanály:
//   1. objektivní     → weightKg (váha)
//   2. subjektivní    → energyLevel, hungerLevel (1–5)
//   3. provozní       → adherencePct (kolik % naplánovaných jídel snědl)
//
// Z N posledních check-inů odvodíme `PlanAdjustment` — co změnit pro
// příští týden. Logika v lib/coaching/weeklyAdjustment.ts.

import type { NutritionGoalKind } from '../types';

export type SubjectiveLevel = 1 | 2 | 3 | 4 | 5;

export type WeeklyCheckIn = {
  /** ISO datum pondělí týdne, kterého se check-in týká. */
  weekStartISO: string;
  /** Uložená váha v kg z pondělí ráno (nebo z dne check-inu). */
  weightKg?: number;
  /** 1 = velmi nízká, 5 = výborná. */
  energyLevel?: SubjectiveLevel;
  /** 1 = ne hladový, 5 = neustále hladový. */
  hungerLevel?: SubjectiveLevel;
  /** Adherence k plánovanému jídelníčku 0..1. */
  adherence: number;
  /** Kolik plánovaných tréninků uživatel dokončil v daném týdnu. */
  completedSessions?: number;
  /** Kolik tréninků bylo v týdnu naplánováno. */
  plannedSessions?: number;
  /** Subjektivní pocit ze spánku/regenerace 1..5. */
  sleepFeel?: SubjectiveLevel;
  /** Volitelná poznámka, např. „dovolená, jedl jsem hodně venku“. */
  notes?: string;
  /** Kdy byl check-in uložen. */
  createdAt: string;
};

export type PlanAdjustment = {
  /** Doporučená změna denního příjmu (může být 0). */
  kcalDelta: number;
  /** Lidský důvod, proč doporučujeme tuto změnu. */
  reason: string;
  /** Bezpečnostní varování (např. „hubneš moc rychle“). */
  warnings: string[];
  /** Cílový NutritionGoalKind po případné automatické korekci (např. „přepneme z fat_loss na maintenance“). */
  adjustedGoalKind?: NutritionGoalKind;
};
