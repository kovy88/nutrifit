// ── SPORT LIBRARY ("Můj týden")
//
// Presety sportů pro rekreační sportovce. Appka NEplánuje tréninky/zápasy na
// place/ledě (ty si zadá uživatel) — preset jen dá rychlý START (typický týden
// k editaci) + doporučí, co dělat NAVÍC „mimo led/place" ve volnu (off-field).
//
// Texty jsou locale-aware inline (vzor L(cs,en)) jako ostatní coaching moduly —
// čte je editor, materializer i tipy kouče. Nejdou přes i18n katalog schválně:
// drží sport-obsah na jednom místě a fungují i v čistých (ne-React) modulech.

import type { PlannedActivity, SessionKind, SportId, WeeklyActivityTemplate } from '../../types';

type Loc = string;
const L = (loc: Loc, cs: string, en: string) => (loc === 'en' ? en : cs);

export type OffFieldSession = {
  kind: SessionKind;
  intensity: PlannedActivity['intensity'];
  title: (loc: Loc) => string;
};

type SportDef = {
  id: SportId;
  name: (loc: Loc) => string;
  /** Typický in-season týden (0=Po … 6=Ne). Dny sportu/zápasu bez titulku — jméno doplní materializer. */
  starter: WeeklyActivityTemplate;
  /** 3–5 doporučených off-field jednotek k „přidat 1 klikem". */
  offField: OffFieldSession[];
  /** Jeden sport-specifický tip kouče (off-ice/off-field). */
  tip: (loc: Loc) => string;
};

// ── sdílené off-field jednotky ──────────────────────────────────────────────
const lowerPower: OffFieldSession = { kind: 'strength', intensity: 'hard', title: l => L(l, 'Výbušnost dolních končetin (dřepy, výskoky)', 'Lower-body power (squats, jumps)') };
const singleLeg: OffFieldSession = { kind: 'strength', intensity: 'moderate', title: l => L(l, 'Jednonohá stabilita', 'Single-leg stability') };
const hipMobility: OffFieldSession = { kind: 'mobility', intensity: 'easy', title: l => L(l, 'Mobilita kyčlí', 'Hip mobility') };
const nordics: OffFieldSession = { kind: 'strength', intensity: 'moderate', title: l => L(l, 'Nordic hamstringy (prevence)', 'Nordic hamstrings (prehab)') };
const aerobic: OffFieldSession = { kind: 'easy_run', intensity: 'easy', title: l => L(l, 'Aerobní běh (zóna 2)', 'Aerobic run (zone 2)') };
const sprintIntervals: OffFieldSession = { kind: 'intervals', intensity: 'hard', title: l => L(l, 'Sprinty / intervaly', 'Sprints / intervals') };
const core: OffFieldSession = { kind: 'strength', intensity: 'moderate', title: l => L(l, 'Core / střed těla', 'Core') };
const agility: OffFieldSession = { kind: 'functional', intensity: 'moderate', title: l => L(l, 'Agility / změny směru', 'Agility / change of direction') };
const ankle: OffFieldSession = { kind: 'mobility', intensity: 'easy', title: l => L(l, 'Stabilita kotníků', 'Ankle stability') };
const shoulderCare: OffFieldSession = { kind: 'mobility', intensity: 'easy', title: l => L(l, 'Péče o rameno (rotátorová manžeta)', 'Shoulder care (rotator cuff)') };
const rotationalPower: OffFieldSession = { kind: 'strength', intensity: 'moderate', title: l => L(l, 'Rotační síla', 'Rotational power') };
const jumpLanding: OffFieldSession = { kind: 'functional', intensity: 'moderate', title: l => L(l, 'Skoky a doskoky (technika)', 'Jump & landing mechanics') };

// ── starter helpery ─────────────────────────────────────────────────────────
function act(kind: SessionKind, intensity: PlannedActivity['intensity'], isMatch = false): PlannedActivity {
  return { kind, intensity, ...(isMatch ? { isMatch: true } : {}) };
}

/** Typický týden týmového sportu: Po trénink, Út off-field síla, St mobilita, Čt trénink, Pá rest, So zápas, Ne regenerace. */
function teamStarter(): WeeklyActivityTemplate {
  return {
    0: [act('sport', 'moderate')],
    1: [act('strength', 'moderate')],
    2: [act('mobility', 'easy')],
    3: [act('sport', 'moderate')],
    5: [act('match', 'hard', true)],
    6: [act('recovery', 'easy')],
  };
}

export const SPORTS: Record<SportId, SportDef> = {
  football: {
    id: 'football',
    name: l => L(l, 'Fotbal', 'Football'),
    starter: teamStarter(),
    offField: [nordics, sprintIntervals, agility, core, aerobic],
    tip: l => L(l, 'Mimo hřiště: Nordic hamstringy 2× týdně výrazně snižují riziko natažení zadního stehna.',
                  'Off-pitch: Nordic hamstrings twice a week sharply cut hamstring-strain risk.'),
  },
  ice_hockey: {
    id: 'ice_hockey',
    name: l => L(l, 'Lední hokej', 'Ice hockey'),
    starter: teamStarter(),
    offField: [lowerPower, singleLeg, hipMobility, sprintIntervals, core],
    tip: l => L(l, 'Mimo led: výbušnost dolních končetin (dřepy, výskoky) + mobilita kyčlí zrychlí první kroky a zlepší bruslařský postoj.',
                  'Off-ice: lower-body power (squats, jumps) + hip mobility speed up your first strides and skating stance.'),
  },
  ball_hockey: {
    id: 'ball_hockey',
    name: l => L(l, 'Hokejbal', 'Ball hockey'),
    starter: {
      0: [act('sport', 'moderate')],
      1: [act('easy_run', 'easy')],
      2: [act('strength', 'moderate')],
      5: [act('match', 'hard', true)],
      6: [act('recovery', 'easy')],
    },
    offField: [aerobic, agility, lowerPower, ankle, core],
    tip: l => L(l, 'Lehký aerobní běh mimo zápasy zvýší kondici do třetin a zrychlí regeneraci.',
                  'Easy aerobic runs between games build your engine for the third period and speed recovery.'),
  },
  floorball: {
    id: 'floorball',
    name: l => L(l, 'Florbal', 'Floorball'),
    starter: teamStarter(),
    offField: [agility, ankle, core, aerobic, lowerPower],
    tip: l => L(l, 'Agility a stabilita kotníků mimo halu = rychlejší změny směru a méně zranění.',
                  'Agility and ankle stability off-court = quicker direction changes and fewer injuries.'),
  },
  basketball: {
    id: 'basketball',
    name: l => L(l, 'Basketbal', 'Basketball'),
    starter: teamStarter(),
    offField: [jumpLanding, ankle, agility, core, lowerPower],
    tip: l => L(l, 'Nácvik doskoků a stabilita kotníků chrání kolena i kotníky při doskocích.',
                  'Jump-landing mechanics and ankle stability protect your knees and ankles on landings.'),
  },
  tennis: {
    id: 'tennis',
    name: l => L(l, 'Tenis', 'Tennis'),
    starter: {
      0: [act('sport', 'moderate')],
      1: [act('strength', 'moderate')],
      2: [act('sport', 'moderate')],
      3: [act('mobility', 'easy')],
      5: [act('match', 'hard', true)],
      6: [act('recovery', 'easy')],
    },
    offField: [rotationalPower, shoulderCare, agility, core, aerobic],
    tip: l => L(l, 'Rotační síla a péče o rameno (rotátorová manžeta) drží tvůj servis silný a zdravý.',
                  'Rotational power and shoulder care (rotator cuff) keep your serve strong and healthy.'),
  },
  martial_arts: {
    id: 'martial_arts',
    name: l => L(l, 'Bojové sporty', 'Martial arts'),
    starter: teamStarter(),
    offField: [lowerPower, hipMobility, core, sprintIntervals, rotationalPower],
    tip: l => L(l, 'Mimo dojo: výbušnost dolních končetin, mobilita kyčlí a kondička = víc síly do úderů a lepší výdrž v dalších kolech.',
                  'Outside the dojo: lower-body power, hip mobility and conditioning mean harder strikes and better stamina in the later rounds.'),
  },
  volleyball: {
    id: 'volleyball',
    name: l => L(l, 'Volejbal', 'Volleyball'),
    starter: teamStarter(),
    offField: [jumpLanding, ankle, shoulderCare, core, agility],
    tip: l => L(l, 'Nácvik doskoků a péče o rameno chrání kolena i rotátorovou manžetu při smečích a blocích.',
                  'Jump-landing work and shoulder care protect your knees and rotator cuff on spikes and blocks.'),
  },
  handball: {
    id: 'handball',
    name: l => L(l, 'Házená', 'Handball'),
    starter: teamStarter(),
    offField: [lowerPower, shoulderCare, agility, core, ankle],
    tip: l => L(l, 'Výbušnost, péče o rameno a změny směru ti dají tvrdší střelu a rychlejší obranu.',
                  'Power, shoulder care and change-of-direction give you a harder throw and quicker defense.'),
  },
};

export const SPORT_IDS = Object.keys(SPORTS) as SportId[];

export function getSportPreset(id: SportId | undefined | null): SportDef | null {
  return id && SPORTS[id] ? SPORTS[id] : null;
}

/** Lokalizované jméno sportu: preset → z knihovny, jinak uživatelův label. */
export function sportName(id: SportId | undefined | null, label: string | undefined, locale: string): string {
  if (id && SPORTS[id]) return SPORTS[id].name(locale);
  return label ?? '';
}

/** Sport-specifický off-field tip (nebo null pro „Jiné"/bez sportu). */
export function sportTip(id: SportId | undefined | null, locale: string): string | null {
  return id && SPORTS[id] ? SPORTS[id].tip(locale) : null;
}

/** Deep-clone starter šablony (aby seed nesdílel reference s katalogem). */
export function cloneStarter(id: SportId): WeeklyActivityTemplate {
  const src = SPORTS[id].starter;
  const out: WeeklyActivityTemplate = {};
  for (const k of Object.keys(src)) {
    const day = Number(k) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    out[day] = (src[day] ?? []).map(a => ({ ...a }));
  }
  return out;
}
