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
import type { ReadinessAssessment } from './readiness';
import type { TrainingLoadAssessment } from './trainingLoad';

export type MorningBriefing = {
  /** Vizuální emoji pro tone ("🟢 🟡 🔴 ⚪️") — odpovídá readiness levelu. */
  emoji: string;
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
};

export function composeMorningBriefing(input: ComposeBriefingInput): MorningBriefing {
  const { session, readiness, trainingLoad, macros, baselineMacros } = input;

  const emoji = pickEmoji(session, readiness);
  const headline = buildHeadline(session, readiness);
  const detail = buildDetail(readiness, trainingLoad);
  const recommendation = buildRecommendation(session, readiness, trainingLoad, macros, baselineMacros);

  return { emoji, headline, detail, recommendation };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pickEmoji(session: TrainingSession | null, readiness: ReadinessAssessment | null): string {
  // Rest day má svůj vlastní vizuál — readiness color se nehodí.
  if (!session || session.kind === 'rest') return '⚪️';
  if (!readiness) return '🟢';
  switch (readiness.level) {
    case 'green':  return '🟢';
    case 'yellow': return '🟡';
    case 'red':    return '🔴';
  }
}

function buildHeadline(session: TrainingSession | null, readiness: ReadinessAssessment | null): string {
  if (!session || session.kind === 'rest') {
    return 'Volný den. Méně sacharidů, víc tuků.';
  }
  const sessionLabel = shortSessionName(session);
  if (!readiness || readiness.level === 'green') {
    return `${sessionLabel}. Můžeš jet podle plánu.`;
  }
  if (readiness.level === 'yellow') {
    return `${sessionLabel}. Mírně snížená připravenost.`;
  }
  return `${sessionLabel}. Doporučujeme regeneraci.`;
}

function shortSessionName(session: TrainingSession): string {
  // Některé title z buildTrainingSessionForDate jsou už zkrácené;
  // pro distance-based session (long_run, intervals) připojíme délku.
  const minutes = session.durationMinutes;
  const intensity = session.intensity;
  switch (session.kind) {
    case 'long_run':       return `Long run ${minutes} min`;
    case 'intervals':      return `Intervaly ${minutes} min`;
    case 'tempo':          return `Tempo ${minutes} min`;
    case 'easy_run':       return `Lehký běh ${minutes} min`;
    case 'recovery_run':   return `Regenerace ${minutes} min`;
    case 'strength':       return `Silový trénink ${minutes} min`;
    case 'mobility':       return `Mobilita ${minutes} min`;
    case 'cross_training': return `Crosstraining ${minutes} min`;
    case 'race':           return `Závod`;
    case 'swim':           return `Plavání ${minutes} min`;
    case 'bike':           return `Kolo ${minutes} min`;
    case 'brick':          return `Brick ${minutes} min`;
    case 'functional':     return `Funkční ${minutes} min`;
    default:               return `${session.title} (${intensity})`;
  }
}

function buildDetail(readiness: ReadinessAssessment | null, load: TrainingLoadAssessment | null): string {
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
    parts.push(`ACWR ${load.acwr.toFixed(2)} (${loadStatusShort(load.status)})`);
  }
  return parts.join(' · ');
}

function buildRecommendation(
  session: TrainingSession | null,
  readiness: ReadinessAssessment | null,
  load: TrainingLoadAssessment | null,
  macros: Macros | null,
  baselineMacros: Macros | null,
): string {
  // Sestavení v pořadí důležitosti:
  //   1. Red readiness → safety override, zbytek se hodí dolů
  //   2. Overreaching ACWR → preventivní deload
  //   3. Macro úprava (refuel pro tréninkový den, redukce pro rest)
  //   4. Default — "podle plánu"

  if (readiness?.level === 'red') {
    return 'Dnes drž lehkou aktivitu, jdi dřív spát. Pokud čekal hard trénink, sniž ho na easy.';
  }

  if (load && (load.status === 'overreaching' || load.status === 'high_risk')) {
    if (session && session.intensity === 'hard') {
      return 'Zátěž je výš než průměr. Zvaž zkrátit dnešní trénink o ~20 % nebo přesunout na zítra.';
    }
    return 'Tento týden výrazně víc než průměr. Sleduj spánek a dej si zítra spíš lehčí jednotku.';
  }

  // Macro hint pokud máme baseline porovnání
  if (macros && baselineMacros && macros.kcal !== baselineMacros.kcal) {
    const delta = macros.kcal - baselineMacros.kcal;
    const carbsDelta = macros.carbs - baselineMacros.carbs;
    if (delta > 0) {
      return `Pre/post-workout fuel: přidej ${Math.abs(carbsDelta)} g sacharidů navíc (+${delta} kcal proti baseline).`;
    }
    if (delta < 0) {
      return 'Volný den — drž lehčí jídla s vyšším podílem tuků a bílkovin.';
    }
  }

  if (session && session.kind === 'long_run') {
    return 'Před long-runem ujisti se o snídani 2–3 h předem a vodu po cestě.';
  }
  if (session && session.kind === 'rest') {
    return 'Pohyb 5–10 tisíc kroků, hodně vody, ne moc kávy.';
  }
  if (readiness?.level === 'yellow') {
    return 'Můžeš odtrénovat naplánovanou jednotku, ale neforsíruj — drž HR v zóně 2.';
  }
  return 'Drž plán a postupné navyšování. Po tréninku doplň 30 g bílkovin do 30 minut.';
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

function loadStatusShort(s: TrainingLoadAssessment['status']): string {
  switch (s) {
    case 'optimal':      return 'optimum';
    case 'detraining':   return 'klesá';
    case 'overreaching': return 'hodně';
    case 'high_risk':    return 'riziko';
  }
}
