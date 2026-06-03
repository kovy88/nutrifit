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
//   detail         — 2–3 fakty (spánek, HRV, ACWR), oddělené " · "
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
  const loc: Locale = input.locale ?? 'cs';

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
    return L(loc, `${sessionLabel}. Recovery data chybí.`, `${sessionLabel}. Recovery data missing.`);
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
  const intensity = session.intensity;
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
    default:               return `${session.title} (${intensity})`;
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
    for (const f of visible) parts.push(condense(f.message));
  }
  if (load && load.acwr != null) {
    parts.push(`ACWR ${load.acwr.toFixed(2)} (${loadStatusShort(load.status, loc)})`);
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
    return L(loc, 'Dnes drž lehkou aktivitu, jdi dřív spát. Pokud čekal hard trénink, sniž ho na easy.',
                  'Keep it light today, go to bed earlier. If a hard workout was planned, drop it to easy.');
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
    return L(loc, 'Recovery data dnes chybí. Drž plán podle pocitu a nepřidávej intenzitu.',
                  'Recovery data is missing today. Follow the plan by feel and do not add intensity.');
  }

  // Macro hint pokud máme baseline porovnání
  if (macros && baselineMacros && macros.kcal !== baselineMacros.kcal) {
    const delta = macros.kcal - baselineMacros.kcal;
    const carbsDelta = macros.carbs - baselineMacros.carbs;
    if (delta > 0) {
      return L(loc, `Pre/post-workout fuel: přidej ${Math.abs(carbsDelta)} g sacharidů navíc (+${delta} kcal proti baseline).`,
                    `Pre/post-workout fuel: add ${Math.abs(carbsDelta)} g extra carbs (+${delta} kcal over baseline).`);
    }
    if (delta < 0) {
      return L(loc, 'Volný den — drž lehčí jídla s vyšším podílem tuků a bílkovin.',
                    'Rest day — keep meals lighter with more fat and protein.');
    }
  }

  if (session && session.kind === 'long_run') {
    return L(loc, 'Před long-runem ujisti se o snídani 2–3 h předem a vodu po cestě.',
                  'Before the long run, have breakfast 2–3 h ahead and water on the way.');
  }
  if (session && session.kind === 'rest') {
    return L(loc, 'Pohyb 5–10 tisíc kroků, hodně vody, ne moc kávy.',
                  'Get 5–10k steps, plenty of water, not too much coffee.');
  }
  if (readiness?.level === 'yellow') {
    return L(loc, 'Můžeš odtrénovat naplánovanou jednotku, ale neforsíruj — drž HR v zóně 2.',
                  'You can do the planned session, but don’t push — keep HR in zone 2.');
  }
  return L(loc, 'Drž plán a postupné navyšování. Po tréninku doplň 30 g bílkovin do 30 minut.',
                'Stick to the plan and gradual progression. Refuel 30 g protein within 30 min post-workout.');
}

function condense(message: string): string {
  // Zkrátí dlouhé "X 30 ms — 60 % průměru (50 ms). Vysoký stres nebo nemoc."
  // na klíčovou část před první tečkou.
  const firstSentence = message.split('.')[0];
  return firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}…` : firstSentence;
}

function severityRank(s: 'green' | 'yellow' | 'red'): number {
  return s === 'red' ? 2 : s === 'yellow' ? 1 : 0;
}

function loadStatusShort(s: TrainingLoadAssessment['status'], loc: Locale): string {
  const en = loc === 'en';
  switch (s) {
    case 'optimal':      return en ? 'optimal' : 'optimum';
    case 'detraining':   return en ? 'detraining' : 'klesá';
    case 'overreaching': return en ? 'high' : 'hodně';
    case 'high_risk':    return en ? 'risk' : 'riziko';
  }
}
