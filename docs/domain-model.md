# Trenr Domain Model

This document defines the canonical model names for the mobile-first coach.
Types may still physically live in `mobile/src` until package extraction.

## Core User And Goals

| Canonical model | Current source | Notes |
|---|---|---|
| `UserProfile` | `mobile/src/types.ts` | Demographics, preferences, coach scope, running inputs. |
| `GoalProfile` | `mobile/src/types.ts` | New derived shape for primary goal, intensity, constraints, and start date. |
| `PrimaryGoal` | `mobile/src/types.ts` | User-level outcome such as fat loss, running, muscle, consistency. |
| `TrainingGoal` | `TrainingGoalKind` in `mobile/src/types.ts` | Discipline-specific target such as 5K, 10K, half, marathon. |
| `RaceGoal` | `mobile/src/types.ts` | New derived shape for race distance, date, current base, feasibility, and safety inputs. |
| `NutritionMode` | `mobile/src/types.ts` | Macro/meal preference mode. |
| `PlanIntensity` | `mobile/src/types.ts` | Safety modifier for deficit and training progression. |

## Nutrition

| Canonical model | Current source | Notes |
|---|---|---|
| `NutritionTargets` | `Macros` in `mobile/src/types.ts` | Alias-ready name for kcal, macros, fiber, water, BMR, TDEE, BMI, goal. |
| `MealPlan` | `Meal[]` and `DailyPlanRecord` | New wrapper for date, meals, totals, validation, and source. |
| `MealPlanValidationResult` | `mobile/src/types.ts` | Existing validation output for AI and fallback meals. |

## Training And Running

| Canonical model | Current source | Notes |
|---|---|---|
| `TrainingPlan` | `mobile/src/lib/training/plan.ts` | Weekly plan, total km, warnings. |
| `TrainingSession` | `mobile/src/types.ts` | One planned day or workout. |
| `TrainingLoad` | `TrainingLoadAssessment` | ACWR, acute/chronic load, status, recommendation. |

Supported running goals for the core coach are:

- 5K: `run_5k`
- 10K: `run_10k`
- Half marathon: `half_marathon`
- Marathon: `marathon`

`couch_to_5k` is a beginner bridge goal. Race feasibility must guard injury
flags, short timelines, low current weekly km, low recent long-run base, and
insufficient weekly run frequency.

## Recovery And Health

| Canonical model | Current source | Notes |
|---|---|---|
| `ReadinessScore` | `mobile/src/types/coach.ts` | 0-100 score, band, intensity ceiling, drivers, confidence. |
| `HealthDataSummary` | `mobile/src/types/health.ts` | New daily aggregate for activity, sleep, RHR, HRV, weight, sources, completeness. |
| `TrainingLoad` | `mobile/src/lib/coaching/trainingLoad.ts` | ACWR risk assessment. |

Health data source order is decided by `CompositeHealthDataProvider`; UI should
show confidence and missing-data state rather than pretending all sources exist.

## Coaching

| Canonical model | Current source | Notes |
|---|---|---|
| `DailyCoachRecommendation` | `mobile/src/types/coach.ts` | Main answer: what to do today. |
| `CoachMessage` | `mobile/src/types/coach.ts` | Chat message with optional structured action metadata. |
| `CoachAction` | `mobile/src/types/coach.ts` | Quick actions and AI-proposed action types. |
| `CheckIn` | `WeeklyCheckIn` in `mobile/src/types/checkin.ts` | Weekly subjective and objective feedback. |
| `WeeklyReview` | `mobile/src/types/checkin.ts` | New weekly summary model. |
| `PlanAdjustment` | `mobile/src/types/checkin.ts` | Deterministic change to nutrition or training plan. |

AI returns text plus structured proposed actions. The app applies only actions
that deterministic validators approve.
