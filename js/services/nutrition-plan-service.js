// ── NUTRITION PLAN SERVICE
//
// Tenká orchestrační vrstva nad [[nutrition]]. Poskytuje volajícím (UI,
// dashboard, AI plan service) jediný stabilní vstupní bod pro získání
// [[MacroTargets]] a denních úprav.

import {
  calcMacroTargets,
  adjustForDay,
  planWeeklyAdjustment,
  validateMealPlanMacros,
} from '../domain/nutrition.js';

/** @typedef {import('../domain/types.js').UserProfile} UserProfile */
/** @typedef {import('../domain/types.js').NutritionGoal} NutritionGoal */
/** @typedef {import('../domain/types.js').MacroTargets} MacroTargets */
/** @typedef {import('../domain/types.js').TrainingSession} TrainingSession */
/** @typedef {import('../domain/types.js').WeeklyCheckIn} WeeklyCheckIn */

export class NutritionPlanService {
  /**
   * @param {UserProfile} profile
   * @param {NutritionGoal} goal
   */
  constructor(profile, goal) {
    this.profile = profile;
    this.goal = goal;
  }

  /** @returns {MacroTargets} */
  baseline() {
    return calcMacroTargets(this.profile, this.goal);
  }

  /**
   * @param {TrainingSession|null} session
   * @returns {MacroTargets}
   */
  forDay(session) {
    return adjustForDay(this.baseline(), session, this.profile);
  }

  /** @param {WeeklyCheckIn[]} history */
  weeklyAdjustment(history) {
    return planWeeklyAdjustment(this.baseline(), this.goal, history);
  }

  /** @param {{kcal:number,proteinG:number,carbsG:number,fatG:number}[]} meals */
  validate(meals) {
    return validateMealPlanMacros(meals, this.baseline());
  }
}
