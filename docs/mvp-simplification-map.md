# Trenr MVP Simplification Map

## P0 User Surface

- Today: one deterministic recommendation, one primary action, simple training, simple nutrition, short why, reason to return tomorrow.
- Onboarding: scope, chat/quick-start goal, training days, experience, body data only when nutrition is in scope, race date only for explicit race goals.
- Plan: week overview and today's practical details. Meal generation remains secondary.
- Coach: explanation and follow-up questions over deterministic facts. It must not invent critical numbers.
- Progress: weekly review and consistency overview first. Detailed trends stay behind a segment.
- Profile: account, health sources, goal editing, preferences, privacy/safety.

## Hidden Until P1/P2

- Today raw ACWR, strain, HRV, RHR, BMR, TDEE, BMI, full macro grid, safety warning lists, detailed weekly stats.
- Onboarding nutrition style, plan intensity, detailed race feasibility, target time, current pace, run history, rest days, injury/run-walk flags.
- Advanced sports: Hyrox, triathlon, OCR, Ironman, custom sport schedule onboarding.
- Shopping list, AI weekly summary, advanced health integrations as prominent promises.

## Deterministic Boundaries

- `DailyCoachRecommendation` is the only "what should I do today?" source for Today.
- Nutrition targets come from `calculateMacros` and `adjustForDay`.
- Training comes from the planner plus readiness guardrails.
- AI chat may explain, reword, and propose actions; deterministic validators own numbers and plan changes.

## Canonical Goal Direction

- New product language uses `TopLevelGoal`, `TrainingFocus`, `CanonicalNutritionMode`, `RaceGoalDetails`, and `UserConstraints`.
- Existing `primaryGoal`, `trainingGoal`, `nutritionMode`, and `planIntensity` remain engine-compatible mirrors until storage and planner migrations are complete.
