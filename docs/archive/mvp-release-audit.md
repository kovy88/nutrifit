> **ARCHIVED 2026-06-04 → 2026-07-02.** Popisuje appku před WHOOP-inspired redesignem a několika koly UX/i18n oprav. Většina P0 položek (Today jako hlavní obrazovka, weekly check-in, quick actions) je už hotová. Neber jako popis současného stavu. Aktuální architektura: [`docs/architecture.md`](../architecture.md).

# NutriFit / Trenr MVP Release Audit

Datum: 2026-06-04

## Strucny Audit

Nejsilnejsi cast appky je deterministicka domenova logika. Projekt uz obsahuje React Native / Expo / TypeScript appku, typy pro profil a plan, health provider abstraction, mock/manual/Apple Health/Health Connect fallbacky, readiness, ACWR/training load, nutrition engine, training planner, race feasibility, daily coach, CS/EN lokalizaci a testy kriticke logiky.

Nejvetsi blok pro verejne MVP neni chybejici vypocet, ale produktovy tok: uzivatel musi po otevreni ihned videt co jist, co trenovat, zda tlacit/drzet/ubrat, proc to appka rika a co zmenit pristi tyden.

Produktove zbytecne pro prvni release: pokrocile trendy, detailni AI weekly summary jako hlavni value, sirsi zavodni sporty mimo beh, plne automaticke health integrace bez realneho produkcniho overeni.

Technicka rizika: billing a health integrace musi mit jasny fallback; AI nesmi prepocitavat kalorie, makra, readiness, race feasibility ani training progression; stary web/API strom ma vlastni necommitnute zmeny a nesmi se michat s mobilnim MVP upgradem.

Chybi pro retenci, monetizaci a duveryhodnost: velmi kratky weekly review na Progress, jasne P0 quick actions na Today, product-ready paywall copy bez falesnych slibu, release checklist a explicitni vysvetleni v DailyCoachRecommendation.

## Roadmapa

### P0 - Pred Verejnym Testem

- Chat-first onboarding s volnym textem a konkretnimi quick-start chips.
- Today jako hlavni obrazovka: readiness, focus, coach message, training, nutrition, recovery, quick actions, mini week.
- DailyCoachRecommendation s readiness, training, nutrition, warnings, quickActions a deterministic explanation.
- Nutrition/training safety guardrails overene testy.
- Weekly check-in dostupny z Today.
- Simple Progress weekly review.
- Mock/manual health fallback bez predstirani realne integrace.
- Feature flag / entitlement model bez fake billing claims.
- TypeScript build a full test suite green.

### P1 - Retence A Hodnota

- Lepsi inline check-in primo na Today misto route do Profilu.
- Meal swap UX s jednoduchym "snadne jidlo" tokem.
- Viditelne aplikovani missed-session adjustment do zbytku tydne.
- Lepsi empty/loading/error states pro health data a AI responses.
- Premium gating na urovni konkretni feature, ne jen obecny paywall.

### P2 - Po Prvnich Uzivatelich

- Produkcni RevenueCat konfigurace a store produkty.
- Produkcni Apple Health / Health Connect rollout.
- Pokrocile progress trendy, dlouhodobe readiness patterns.
- Sirsi multisport plany a zavodni varianty.
- Jemnejsi personalizace AI coach chatu.

## Implementacni Plan

| Soubor | Zmena | Proc | Riziko | Testy |
| --- | --- | --- | --- | --- |
| `mobile/src/lib/onboarding/goal-parser.ts` | Konkretni quick-start texty pro 5 km, 10 km, pulmaraton. | Onboarding umi rovnou strukturovany behovy cil. | Duplicitni `run_race` id v UI. | `goalParser.test.ts`. |
| `mobile/src/components/onboarding/*` | Quick-start select predava cely objekt, ne jen primary goal. | 5K/10K/pulmaraton se nerozpadnou na obecny zavod. | Aktivni stav chipu podle textu. | Onboarding/parser testy. |
| `mobile/src/lib/onboarding/validation.ts` | Nepokladat znovu experience, kdyz ho goal profile ma. | Mene zbytecnych otazek. | Preskoceni pouze pri existujici hodnote. | `onboardingValidation.test.ts`. |
| `mobile/src/lib/coaching/dailyCoach.ts` | Pridat P0 quickActions a `explanation`. | AI ma vysvetlovat deterministicka fakta, ne vymyslet cisla. | Zmena akci muze vyzadovat test update. | `dailyCoach.test.ts`. |
| `mobile/src/screens/TodayScreen.tsx` | P0 quick actions: check-in, done, no time, simple meal, fatigue. | Today je realny denni workflow. | Route param do Profilu. | Typecheck, UI smoke. |
| `mobile/src/screens/ProfileScreen.tsx` | Otevrit weekly check-in pres route param. | Today akce vede rovnou na check-in. | Param reset po zavreni. | Typecheck. |
| `mobile/src/lib/coaching/weekly-review.ts` | Deterministic weekly mini review. | Retence a "co zmenit tento tyden". | Bez dat ukazuje null/bez dat. | `weeklyMiniReview.test.ts`. |
| `mobile/src/screens/HistoryScreen.tsx` | Weekly review karta v Progress overview. | Jednoduchy pokrok bez preplacani. | Pocitani planovanych session podle current week. | Typecheck, full tests. |
| `mobile/src/components/PaywallModal.tsx` | Free/Premium wording a provider ceny. | Monetizace bez falesnych slibu. | Text zatim neni komplet i18n. | Typecheck. |
| `docs/mvp-release-audit.md` | Audit, roadmapa, plan, checklist. | Release evidence pro MVP. | Muze zastarat. | Manual review. |

## Release Checklist

- [ ] `npm run typecheck` v `mobile/`.
- [ ] `npm test` v `mobile/`.
- [ ] Expo app se spusti pres `npm run start:expo-go` nebo `npm run start`.
- [ ] Novy uzivatel projde onboardingem s vetou "Chci zhubnout a ubehnout pulmaraton za 4 mesice."
- [ ] Onboarding se dopta na vek, vysku, vahu, zkusenost, weekly km, longest run, training days, injury flag a stravovaci preference podle scope/cile.
- [ ] Today ukazuje readiness, focus, coach message, training, nutrition, recovery, quick actions a mini week.
- [ ] Quick action "Zapsat check-in" otevre weekly check-in modal.
- [ ] Quick action "Nemam dnes cas" ulozi skipped workout bez agresivniho dohaneni.
- [ ] Quick action "Citim unavu" pouzije readiness downgrade nebo jasny fallback.
- [ ] Progress overview ukazuje weekly review.
- [ ] Paywall neslibuje nedokoncene health integrace ani realnou platbu v dev/mock rezimu.
- [ ] AI prompt/chats pouzivaji deterministicka cisla jako vstup, ne jako zdroj pravdy.
- [ ] Health data mode ma funkcni mock/manual fallback.

