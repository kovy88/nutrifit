// ── MORNING BRIEFING COMPOSER
//
// Vezme všechny coaching signály (dnešní trénink, readiness, training load,
// makra) a složí z nich JEDNU lidskou zprávu. Stejný výstup se zobrazuje
// na HomeScreen jako dominantní karta nahoře A používá se jako tělo
// ranní push notifikace (jakmile přidáme expo-notifications).
//
// Filozofie: uživatel nechce vidět 4 karty s grafy. Chce ráno vědět:
//   1. Co dnes mám dělat? (session)
//   2. Můžu/měl bych to dělat? (readiness)
//   3. Jak mám jíst? (macros adjustment)
//
// Tři pole:
//   headline       — JEDEN řádek, max ~50 znaků. Akce + stav.
//   detail         — 2–3 lidské signály bez raw interních metrik.
//   recommendation — JEDNA věta s konkrétní akcí pro dnešek.

import type { TrainingSession } from '../../types';
import type { Macros } from '../../types';
import type { Locale } from '../i18n';
import type { ReadinessAssessment } from './readiness';
import type { TrainingLoadAssessment } from './trainingLoad';

/** Pick localized string. */
function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

export type MorningBriefing = {
  /** Krátký nadpis: dnešní akce + stav. */
  headline: string;
  /** 2–3 klíčové fakty, oddělené " · ". Může být prázdné. */
  detail: string;
  /** Jedna věta s nejdůležitější dnešní akcí. */
  recommendation: string;
};

export type ComposeBriefingInput = {
  session: TrainingSession | null;
  readiness: ReadinessAssessment | null;
  trainingLoad: TrainingLoadAssessment | null;
  macros: Macros | null;
  baselineMacros: Macros | null;
  /** Jazyk výstupních textů. Default 'cs'. */
  locale?: Locale;
};

export function composeMorningBriefing(input: ComposeBriefingInput): MorningBriefing {
  const { session, readiness, trainingLoad, macros, baselineMacros } = input;
  const loc: Locale = input.locale ?? 'en';

  const headline = buildHeadline(session, readiness, loc);
  const detail = buildDetail(readiness, trainingLoad, loc);
  const recommendation = buildRecommendation(session, readiness, trainingLoad, macros, baselineMacros, loc);

  return { headline, detail, recommendation };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildHeadline(session: TrainingSession | null, readiness: ReadinessAssessment | null, loc: Locale): string {
  if (!session || session.kind === 'rest') {
    return L(loc, 'Volný den. Méně sacharidů, víc tuků.', 'Rest day. Fewer carbs, more fat.');
  }
  const sessionLabel = shortSessionName(session, loc);
  if (readiness?.dataStatus === 'missing') {
    return L(loc, `${sessionLabel}. Dnes chybí data.`, `${sessionLabel}. Data missing today.`);
  }
  if (!readiness || readiness.level === 'green') {
    return L(loc, `${sessionLabel}. Můžeš jet podle plánu.`, `${sessionLabel}. You can go by plan.`);
  }
  if (readiness.level === 'yellow') {
    return L(loc, `${sessionLabel}. Mírně snížená připravenost.`, `${sessionLabel}. Slightly reduced readiness.`);
  }
  return L(loc, `${sessionLabel}. Doporučujeme regeneraci.`, `${sessionLabel}. Recovery recommended.`);
}

function shortSessionName(session: TrainingSession, loc: Locale): string {
  // Některé title z buildTrainingSessionForDate jsou už zkrácené;
  // pro distance-based session (long_run, intervals) připojíme délku.
  const minutes = session.durationMinutes;
  const en = loc === 'en';
  switch (session.kind) {
    case 'long_run':       return `Long run ${minutes} min`;
    case 'intervals':      return en ? `Intervals ${minutes} min` : `Intervaly ${minutes} min`;
    case 'tempo':          return `Tempo ${minutes} min`;
    case 'easy_run':       return en ? `Easy run ${minutes} min` : `Lehký běh ${minutes} min`;
    case 'recovery_run':   return en ? `Recovery ${minutes} min` : `Regenerace ${minutes} min`;
    case 'strength':       return en ? `Strength ${minutes} min` : `Silový trénink ${minutes} min`;
    case 'mobility':       return en ? `Mobility ${minutes} min` : `Mobilita ${minutes} min`;
    case 'cross_training': return en ? `Cross-training ${minutes} min` : `Crosstraining ${minutes} min`;
    case 'race':           return en ? `Race` : `Závod`;
    case 'swim':           return en ? `Swim ${minutes} min` : `Plavání ${minutes} min`;
    case 'bike':           return en ? `Bike ${minutes} min` : `Kolo ${minutes} min`;
    case 'brick':          return `Brick ${minutes} min`;
    case 'functional':     return en ? `Functional ${minutes} min` : `Funkční ${minutes} min`;
    case 'match':          return session.title || (en ? 'Match' : 'Zápas');
    case 'sport':          return session.title || (en ? 'Training' : 'Trénink');
    case 'combat':         return session.title || (en ? `Combat ${minutes} min` : `Bojový trénink ${minutes} min`);
    case 'recovery':       return en ? `Recovery ${minutes} min` : `Regenerace ${minutes} min`;
    default:               return session.title || (en ? `Training ${minutes} min` : `Trénink ${minutes} min`);
  }
}

function buildDetail(readiness: ReadinessAssessment | null, load: TrainingLoadAssessment | null, loc: Locale): string {
  const parts: string[] = [];
  if (readiness) {
    // Vyber jen ne-missing fakty, prioritizuj red/yellow nad green.
    const visible = readiness.factors
      .filter(f => !f.key.endsWith('_missing'))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 2);
    for (const f of visible) parts.push(readinessSignalLabel(f, loc));
  }
  if (load && load.acwr != null) {
    parts.push(trainingLoadSignalLabel(load.status, loc));
  }
  return parts.join(' · ');
}

function buildRecommendation(
  session: TrainingSession | null,
  readiness: ReadinessAssessment | null,
  load: TrainingLoadAssessment | null,
  macros: Macros | null,
  baselineMacros: Macros | null,
  loc: Locale,
): string {
  // Sestavení v pořadí důležitosti:
  //   1. Red readiness → safety override, zbytek se hodí dolů
  //   2. Overreaching ACWR → preventivní deload
  //   3. Macro úprava (refuel pro tréninkový den, redukce pro rest)
  //   4. Default — "podle plánu"

  if (readiness?.level === 'red') {
    return L(loc, 'Dnes jen lehce a jdi dřív spát. Pokud byl v plánu tvrdý trénink, zkrať ho nebo dej chůzi.',
                  'Keep it light today and get to bed earlier. If a tough workout was planned, shorten it or walk.');
  }

  if (load && (load.status === 'overreaching' || load.status === 'high_risk')) {
    if (session && session.intensity === 'hard') {
      return L(loc, 'Zátěž je výš než průměr. Zvaž zkrátit dnešní trénink o ~20 % nebo přesunout na zítra.',
                    'Load is above average. Consider cutting today’s workout ~20% or moving it to tomorrow.');
    }
    return L(loc, 'Tento týden výrazně víc než průměr. Sleduj spánek a dej si zítra spíš lehčí jednotku.',
                  'Well above average this week. Watch your sleep and keep tomorrow lighter.');
  }

  if (readiness?.dataStatus === 'missing') {
    return L(loc, 'Dnes nemáme data o regeneraci. Drž plán podle pocitu a nepřidávej.',
                  'Recovery data is missing today. Follow the plan by feel and do not add more.');
  }

  if (session && session.kind === 'match') {
    return L(loc, 'Zápas dnes — dolaď sacharidy, dobře se zahřej a hydratuj. Nech nohy odpočaté.',
                  'Match today — top up carbs, warm up well and hydrate. Keep your legs fresh.');
  }

  // Macro hint pokud máme baseline porovnání
  if (macros && baselineMacros && macros.kcal !== baselineMacros.kcal) {
    const delta = macros.kcal - baselineMacros.kcal;
    const carbsDelta = macros.carbs - baselineMacros.carbs;
    if (delta > 0) {
      return L(loc, `Kolem tréninku přidej ${Math.abs(carbsDelta)} g sacharidů navíc (+${delta} kcal proti běžnému dni).`,
                    `Around the workout, add ${Math.abs(carbsDelta)} g extra carbs (+${delta} kcal over a normal day).`);
    }
    if (delta < 0) {
      return L(loc, 'Volný den — drž lehčí jídla s vyšším podílem tuků a bílkovin.',
                    'Rest day — keep meals lighter with more fat and protein.');
    }
  }

  if (session && session.kind === 'long_run') {
    return L(loc, 'Před delším během dej snídani 2–3 h předem a vezmi vodu s sebou.',
                  'Before the long run, have breakfast 2–3 h ahead and bring water with you.');
  }
  if (session && session.kind === 'rest') {
    return L(loc, 'Pohyb 5–10 tisíc kroků, hodně vody, ne moc kávy.',
                  'Get 5–10k steps, plenty of water, not too much coffee.');
  }
  if (readiness?.level === 'yellow') {
    return L(loc, 'Můžeš odtrénovat plán, ale neforsíruj — drž tempo, ve kterém zvládneš mluvit.',
                  'You can do the planned session, but don’t push — keep it conversational.');
  }
  return L(loc, 'Drž plán a postupné navyšování. Po tréninku doplň 30 g bílkovin do 30 minut.',
                'Stick to the plan and gradual progression. Refuel 30 g protein within 30 min post-workout.');
}

function severityRank(s: 'green' | 'yellow' | 'red'): number {
  return s === 'red' ? 2 : s === 'yellow' ? 1 : 0;
}

function readinessSignalLabel(factor: ReadinessAssessment['factors'][number], loc: Locale): string {
  switch (factor.key) {
    case 'sleep_short':
      return L(loc, 'Spánek je dnes slabý.', 'Sleep is short today.');
    case 'sleep_moderate':
      return L(loc, 'Spánek je trochu pod normálem.', 'Sleep is a bit below normal.');
    case 'sleep_ok':
      return L(loc, 'Spánek podporuje plán.', 'Sleep supports the plan.');
    case 'hrv_low':
      return L(loc, 'Regenerace je slabší než obvykle.', 'Recovery looks weaker than usual.');
    case 'hrv_moderate':
      return L(loc, 'Regenerace je lehce snížená.', 'Recovery is slightly reduced.');
    case 'hrv_ok':
      return L(loc, 'Regenerace vypadá stabilně.', 'Recovery looks stable.');
    case 'rhr_high':
      return L(loc, 'Tělo dnes působí víc zatíženě.', 'Your body looks more stressed today.');
    case 'rhr_elevated':
      return L(loc, 'Tělo je lehce víc zatížené.', 'Your body is slightly more stressed.');
    case 'rhr_ok':
      return L(loc, 'Klidový stav vypadá stabilně.', 'Resting state looks stable.');
    default:
      return factor.severity === 'red'
        ? L(loc, 'Dnes radši drž rezervu.', 'Keep some reserve today.')
        : factor.severity === 'yellow'
          ? L(loc, 'Jeden signál je lehce slabší.', 'One signal is slightly weaker.')
          : L(loc, 'Signály podporují plán.', 'Signals support the plan.');
  }
}

function trainingLoadSignalLabel(status: TrainingLoadAssessment['status'], loc: Locale): string {
  switch (status) {
    case 'optimal':
      return L(loc, 'Týdenní zátěž je v normě.', 'Weekly load is on track.');
    case 'detraining':
      return L(loc, 'Tento týden je zátěž nižší než obvykle.', 'This week is lighter than usual.');
    case 'overreaching':
      return L(loc, 'Zátěž roste rychleji než obvykle.', 'Load is rising faster than usual.');
    case 'high_risk':
      return L(loc, 'Zátěž je teď vysoká; drž rezervu.', 'Load is high right now; keep some reserve.');
  }
}
