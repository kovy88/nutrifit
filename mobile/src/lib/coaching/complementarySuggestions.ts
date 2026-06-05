// ── COMPLEMENTARY SUGGESTIONS ("Můj týden")
//
// Volitelné, NEpovinné tipy kouče kolem uživatelova vlastního týdne. Nikdy
// nevkládá nic do plánu — jen navrhuje. Cap na 2 tipy (priorita: zápas > po
// zápase > aerobní báze > mobilita). Locale-aware (vzor L(cs, en)).

import type { TrainingSession } from '../../types';

export type ComplementaryInput = {
  /** Název hlavního sportu (např. „Hokejbal"). Bez něj se aerobní/mobility tip neváže na sport. */
  mainSport?: string;
  /** Materializovaný týden (custom režim). */
  sessions: TrainingSession[];
  /** Dnešní datum YYYY-MM-DD. */
  todayISO: string;
  locale?: string;
};

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T12:00:00`).getTime();
  const b = new Date(`${bISO}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const AEROBIC_KINDS = ['easy_run', 'recovery_run', 'recovery_walk', 'swim', 'bike', 'cross_training'];
const MOBILITY_KINDS = ['mobility', 'recovery'];

/** 0–2 volitelné tipy kolem uživatelova týdne. */
export function complementarySuggestions(input: ComplementaryInput): string[] {
  const { sessions, todayISO } = input;
  const en = (input.locale ?? 'cs') === 'en';
  const L = (cs: string, e: string) => (en ? e : cs);
  const sport = (input.mainSport && input.mainSport.trim()) || L('tvůj sport', 'your sport');
  const tips: string[] = [];

  const matches = sessions.filter(s => s.kind === 'match').sort((a, b) => a.date.localeCompare(b.date));
  const nextMatch = matches.find(m => daysBetween(todayISO, m.date) >= 0);
  const lastMatch = [...matches].reverse().find(m => daysBetween(m.date, todayISO) > 0);

  // 1) Zápas dnes / zítra — nejvyšší priorita (taper + fueling)
  if (nextMatch) {
    const d = daysBetween(todayISO, nextMatch.date);
    if (d === 0) {
      tips.push(L('Dnes zápas — dolaď sacharidy a hydrataci, lehké rozcvičení stačí.',
                  'Match today — top up carbs and hydration; an easy warm-up is enough.'));
    } else if (d === 1) {
      tips.push(L('Zítra zápas — dnes drž lehčí trénink, priorita je spánek a sacharidy.',
                  'Match tomorrow — keep today easy; prioritize sleep and carbs.'));
    }
  }

  // 2) Den po zápase — regenerace
  if (lastMatch && daysBetween(lastMatch.date, todayISO) === 1) {
    tips.push(L('Po včerejším zápase zvol lehký regenerační den — chůze, mobilita, bílkoviny.',
                "After yesterday's match, take it easy today — walking, mobility, protein."));
  }

  // 3) Aerobní báze pro hlavní sport (jen když sport je zadaný a v týdnu chybí lehké kardio)
  const hasAerobic = sessions.some(s => AEROBIC_KINDS.includes(s.kind));
  if (input.mainSport && !hasAerobic) {
    tips.push(L(`Lehký Z2 běh 1× týdně zlepší aerobní bázi pro ${sport}.`,
                `An easy Z2 run once a week would build the aerobic base for ${sport}.`));
  }

  // 4) Mobilita / prehab
  const hasMobility = sessions.some(s => MOBILITY_KINDS.includes(s.kind));
  if (!hasMobility) {
    tips.push(L(`Zařaď den mobility/prehabu — drží tě bez zranění pro ${sport}.`,
                `Add a mobility/prehab day — it keeps you injury-free for ${sport}.`));
  }

  return tips.slice(0, 2);
}
