# `js/domain/` — FROZEN (legacy origin)

⚠️ **Do not add features here.** This is the original vanilla-JS domain logic of the
web app. The **canonical** nutrition / training / readiness logic now lives in the
**mobile app** as TypeScript:

| Web (frozen) | Canonical (edit here) |
|---|---|
| `js/domain/nutrition.js` | `mobile/src/utils/nutrition.ts` |
| `js/domain/training.js` | `mobile/src/lib/training/` (`plan.ts`) |
| `js/domain/types.js` | `mobile/src/types.ts` + `mobile/src/types/coach.ts` |

## Why frozen
Architecture decision (mobile-first AI coach): the **mobile app is the product and the
single source of truth** for domain logic. The web app is repositioned as a
landing/legal/waitlist page over the shared `api/` backend. To avoid web↔mobile drift
while we defer a shared `packages/core`, this folder is frozen.

## When to un-freeze
Only when a **second real consumer** of the engine appears (e.g. a web demo / prompt
playground that runs the coach, or a backend endpoint computing macros/training
server-side). That event triggers extracting `packages/core|ai|health` from
`mobile/src/{utils,lib}` and having both apps consume it — not before.

The legacy Node tests in `tests/*.test.js` still cover this folder (`node tests/run.js`).
Keep them green; don't extend the logic.
