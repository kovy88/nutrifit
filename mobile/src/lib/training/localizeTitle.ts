// ── TRAINING TEXT LOCALIZATION (display boundary)
//
// The training generators (`plan.ts`, `training-core.ts`) emit Czech prose for
// session titles and plan warnings — they are pure domain logic with no i18n
// context. This module translates that generated text to English at the point
// where the adapter (`index.ts`) hands a plan to the UI.
//
// Design:
//  - `locale !== 'en'` → return the text unchanged (Czech is the source).
//  - Idempotent: an already-English string matches nothing and passes through.
//  - Graceful: an unknown string falls back to the original (never throws), so a
//    missed template degrades to Czech rather than breaking the screen.
//  - Coverage is guarded by `__tests__/localizeTitle.test.ts`, which generates a
//    plan for every goal in EN and asserts no Czech diacritics remain.

/** Exact-match translations (titles + warnings with no interpolation). */
const STATIC: Record<string, string> = {
  // ── Rest / generic
  'Volno': 'Rest',
  'Volný den': 'Rest day',
  'Volno / chůze': 'Rest / walk',
  'Volno / procházka': 'Rest / walk',
  'Volno / mobilita 15 min': 'Rest / mobility 15 min',
  'Volno — aktivní regenerace': 'Rest — active recovery',
  'Volno — aktivní regenerace (chůze, strečink)': 'Rest — active recovery (walk, stretching)',

  // ── Walking
  'Delší procházka': 'Longer walk',
  'Svižná chůze (lehké tempo)': 'Brisk walk (easy pace)',
  'Aktivita podle chuti (kolo, plavání, výlet)': 'Activity of choice (bike, swim, trip)',
  'Aktivita podle chuti 45 min': 'Activity of choice 45 min',
  'Lehká chůze 30 min': 'Easy walk 30 min',
  'Svižná chůze 35 min': 'Brisk walk 35 min',
  'Procházka v přírodě 45 min': 'Nature walk 45 min',

  // ── Mobility
  'Mobilita 20 min': 'Mobility 20 min',
  'Mobilita 25 min + chůze 30 min': 'Mobility 25 min + walk 30 min',
  'Mobilita + core 30 min': 'Mobility + core 30 min',
  'Mobilita + protažení 15 min': 'Mobility + stretching 15 min',
  'Mobilita + příprava 25 min (ramena, kyčle, kotníky)': 'Mobility + prep 25 min (shoulders, hips, ankles)',
  'Mobilita + síla 20 min (dřepy, výpady, plank)': 'Mobility + strength 20 min (squats, lunges, plank)',
  'Strečink a mobilita 15 min': 'Stretching and mobility 15 min',
  'Strečink a mobilita horní poloviny': 'Stretching and mobility, upper body',
  'Uvolnění: Strečink a mobilita celého těla': 'Recovery: Full-body stretching and mobility',

  // ── Easy / mixed cardio
  'Svižná chůze nebo lehký běh 30 min': 'Brisk walk or easy run 30 min',
  'Lehký běh 5 km nebo kolo 30 min': 'Easy run 5 km or bike 30 min',
  'Lehký běh nebo kolo 35 min': 'Easy run or bike 35 min',
  'Lehký klus 4 km': 'Easy jog 4 km',
  'Aerobní trénink: Lehký klus nebo svižná chůze 5 km': 'Aerobic training: Easy jog or brisk walk 5 km',
  'Lehký běh (úprava po vynechaném tréninku)': 'Easy run (adjustment after a missed session)',

  // ── Strength
  'Síla 30 min (full body)': 'Strength 30 min (full body)',
  'Síla 40 min (dolní polovina)': 'Strength 40 min (lower body)',
  'Síla 40 min (horní polovina)': 'Strength 40 min (upper body)',
  'Síla horní poloviny těla 40 min — shyby, farmer carry, sandbag, core': 'Upper body strength 40 min — pull-ups, farmer carry, sandbag, core',
  'Silový základ 30 min (dřep, mrtvý tah, kliky, plank)': 'Strength base 30 min (squat, deadlift, push-ups, plank)',
  'Silový základ 35 min — výpady, pull-upy, nošení zátěže, plank': 'Strength base 35 min — lunges, pull-ups, loaded carries, plank',
  'Triatlon síla 35 min — jednonohé dřepy, stabilita kyčle, tlak ramene, core': 'Triathlon strength 35 min — single-leg squats, hip stability, shoulder press, core',
  'Doplňkový silový trénink (core, stabilita)': 'Supplementary strength session (core, stability)',
  'Full body A (dřep, lavička, veslování, plank)': 'Full body A (squat, bench, row, plank)',
  'Full body B (mrtvý tah, tlak nad hlavu, shyby, side plank)': 'Full body B (deadlift, overhead press, pull-ups, side plank)',
  'Full body C (výpady, tlak na šikmé lavici, přítahy, břicho)': 'Full body C (lunges, incline press, rows, abs)',
  'Síla: Spodní polovina těla (dřepy, výpady)': 'Strength: Lower body (squats, lunges)',
  'Síla: Horní polovina těla (tlaky, shyby)': 'Strength: Upper body (presses, pull-ups)',
  'Síla: Střed těla + doplňky': 'Strength: Core + accessories',
  'Síla: Funkční kruhový trénink': 'Strength: Functional circuit',
  'Síla: Stabilita, výpony, core': 'Strength: Stability, calf raises, core',
  'Zpevnění: Kruhový trénink celého těla': 'Toning: Full-body circuit',
  'Zpevnění: Domácí cvičení s vlastní vahou': 'Toning: Bodyweight home workout',

  // ── Conditioning / cross-training
  'HIIT 25 min (např. 8×30/30)': 'HIIT 25 min (e.g. 8×30/30)',
  'Sport / hra 60–90 min': 'Sport / game 60–90 min',
  'Kardio na výběr 30–40 min, nízká až střední intenzita': 'Cardio of choice 30–40 min, low to moderate intensity',
  'Kardio dle výběru (kolo, plavání) 40 min': 'Cardio of choice (bike, swim) 40 min',
  'Kondice: Intervalový běh / HIIT': 'Conditioning: Interval run / HIIT',
  'Kondice: Kruhový trénink 50 min': 'Conditioning: Circuit training 50 min',
  'Aktivní odpočinek (plavání / projížďka na kole)': 'Active recovery (swim / bike ride)',

  // ── OCR (fixed copy)
  'Překážkový okruh 45 min — grip (dead hangs, rope climb), přenášení, burpees': 'Obstacle circuit 45 min — grip (dead hangs, rope climb), carries, burpees',

  // ── Warnings
  'Bez běžecké historie startujeme konzervativně.': 'No running history — starting conservatively.',
  'Bez běžecké historie startujeme konzervativně (~12 km/týden).': 'No running history — starting conservatively (~12 km/week).',
  'Bez běžecké historie startujeme konzervativně — střídání běhu a chůze.': 'No running history — starting conservatively with run/walk intervals.',
  'Bez běžecké historie startujeme konzervativně. Hyrox vyžaduje solidní aerobní základ.': 'No running history — starting conservatively. Hyrox needs a solid aerobic base.',
  'Bez běžecké historie startujeme konzervativně. OCR vyžaduje solidní běžeckou i silovou bázi.': 'No running history — starting conservatively. OCR needs a solid running and strength base.',
  'Lehký pokles HRV — drž intenzitu spíš pod kontrolou.': 'Slight HRV drop — keep the intensity in check.',
  'Únava nebo špatný spánek — kvalitní session vyměněna za snadný běh.': 'Fatigue or poor sleep — quality session swapped for an easy run.',
  'Snížená regenerace: Trénink byl upraven pro zotavení těla.': 'Reduced recovery: training adjusted to let the body recover.',

  // ── Missed session + safety checks (shown in Plan)
  'Vynechaný trénink': 'Missed session',
  'Běh maratonu vyžaduje stabilní základ. Začátečníkům doporučujeme nejprve půlmaraton.': 'Marathon running requires a stable base. For beginners we recommend a half marathon first.',
  'Kombinace intenzivního běžeckého tréninku a agresivního hubnutí (>0,5 kg/týden) může vést k vyčerpání. Doporučujeme zmírnit tempo hubnutí.': 'Combining intense run training with aggressive weight loss (>0.5 kg/week) can lead to burnout. We recommend easing the pace of weight loss.',
  'Taper: snižujeme objem před závodem.': 'Taper: reducing volume before race day.',
};

type Handler = (m: RegExpMatchArray, locale: string) => string;

/** Templated translations (titles with interpolated km / minutes). */
const PATTERNS: Array<[RegExp, Handler]> = [
  // Easy run (optional "Běh/chůze:" run-walk prefix), plain
  [/^(Běh\/chůze: )?Lehký běh ([\d.]+) km$/, m => `${m[1] ? 'Run/walk: ' : ''}Easy run ${m[2]} km`],
  [/^Lehký běh ([\d.]+) km \+ volitelné plavecké drily$/, m => `Easy run ${m[1]} km + optional swim drills`],
  [/^Lehký běh ([\d.]+) km \(aerobní báze, tempo závodu\)$/, m => `Easy run ${m[1]} km (aerobic base, race pace)`],
  [/^Náhradní lehký běh ([\d.]+) km \(přesun kvality kvůli únavě\)$/, m => `Substitute easy run ${m[1]} km (quality moved due to fatigue)`],
  // Quality
  [/^(Běh\/chůze: )?Intervaly ([\d.]+) km$/, m => `${m[1] ? 'Run/walk: ' : ''}Intervals ${m[2]} km`],
  [/^Intervaly (.+)$/, m => `Intervals ${m[1]}`],
  [/^Intervaly ([\d.]+) km \(např\. 6×800 m s pauzou na klus\)$/, m => `Intervals ${m[1]} km (e.g. 6×800 m with jog recovery)`],
  [/^(Běh\/chůze: )?Tempo běh ([\d.]+) km$/, m => `${m[1] ? 'Run/walk: ' : ''}Tempo run ${m[2]} km`],
  [/^Tempo běh ([\d.]+) km \(cca 20 min v komfortně silném tempu\)$/, m => `Tempo run ${m[1]} km (~20 min at comfortably hard pace)`],
  // Long / recovery
  [/^(Běh\/chůze: )?Long Run ([\d.]+) km$/, m => `${m[1] ? 'Run/walk: ' : ''}Long run ${m[2]} km`],
  [/^Long run ([\d.]+) km v konverzačním tempu$/, m => `Long run ${m[1]} km at conversational pace`],
  [/^Recovery klus ([\d.]+) km nebo volno$/, m => `Recovery jog ${m[1]} km or rest`],
  [/^Recovery běh ([\d.]+) km$/, m => `Recovery run ${m[1]} km`],
  // Couch-to-5k
  [/^Běh\/chůze intervaly ([\d.]+) km \(1 min běh \/ 2 min chůze\)$/, m => `Run/walk intervals ${m[1]} km (1 min run / 2 min walk)`],
  [/^Běh\/chůze intervaly ([\d.]+) km$/, m => `Run/walk intervals ${m[1]} km`],
  [/^Delší běh\/chůze ([\d.]+) km$/, m => `Longer run/walk ${m[1]} km`],
  // Hyrox
  [/^Stanice A (\d+) min — (.+)$/, m => `Station A ${m[1]} min — ${m[2]}`],
  [/^Stanice B (\d+) min — (.+)$/, m => `Station B ${m[1]} min — ${m[2]}`],
  [/^Závod-simulace: ([\d.]+) km běh \+ funkční dokončovací okruh 20 min$/, m => `Race simulation: ${m[1]} km run + functional finisher circuit 20 min`],
  // Triathlon
  [/^Technicko-aerobní plavání ([\d.]+) km — drily a základní tempo$/, m => `Technique-aerobic swim ${m[1]} km — drills and base pace`],
  [/^Vytrvalostní kolo ([\d.]+) km — zóna 2$/, m => `Endurance bike ${m[1]} km — zone 2`],
  [/^Brick: ([\d.]+) km kolo \+ ([\d.]+) km běh \(trénink přechodu\)$/, m => `Brick: ${m[1]} km bike + ${m[2]} km run (transition training)`],
  [/^Lehké plavání ([\d.]+) km \(náhrada threshold za únavu\)$/, m => `Easy swim ${m[1]} km (threshold replaced due to fatigue)`],
  [/^Threshold plavání ([\d.]+) km — intervalové série$/, m => `Threshold swim ${m[1]} km — interval sets`],
  // OCR
  [/^Trail běh ([\d.]+) km$/, m => `Trail run ${m[1]} km`],
  [/^Trail běh ([\d.]+) km \(terén, nerovný povrch\)$/, m => `Trail run ${m[1]} km (terrain, uneven surface)`],
  [/^Trail long run ([\d.]+) km s převýšením$/, m => `Trail long run ${m[1]} km with elevation`],
  // Readiness adjustments (training-core)
  [/^Zotavovací klus ([\d.]+) km \(sníženo kvůli únavě\)$/, m => `Recovery jog ${m[1]} km (reduced due to fatigue)`],
  [/^Zkrácený dlouhý běh ([\d.]+) km$/, m => `Shortened long run ${m[1]} km`],
  // Safety warnings (interpolated, shown in Plan)
  [/^Plán má málo dní odpočinku\. Pro tuto úroveň doporučujeme alespoň (\d+) dny volna\.$/, m => `The plan has too few rest days. For this level we recommend at least ${m[1]} days off.`],
  [/^Dlouhý běh tvoří příliš velkou část týdenního objemu \((\d+) %\)\. Zvyšuje se riziko zranění\.$/, m => `The long run is too large a share of weekly volume (${m[1]} %). Injury risk rises.`],
  // Triatlon dvoufázové jednotky
  [/^Regenerační plavání ([\d.]+) km$/, m => `Recovery swim ${m[1]} km`],
  [/^Volné kolo ([\d.]+) km \(spin\)$/, m => `Easy bike ${m[1]} km (spin)`],
  // Composite suffix — recurse on the inner title (place last)
  [/^(.+) \(kontroluj intenzitu\)$/, (m, loc) => `${localizeTrainingText(m[1], loc)} (check intensity)`],
];

/** Translate a generated training title or warning to `locale`. */
export function localizeTrainingText(text: string | undefined | null, locale: string): string {
  if (!text || locale !== 'en') return text ?? '';
  const exact = STATIC[text];
  if (exact) return exact;
  for (const [re, handler] of PATTERNS) {
    const m = text.match(re);
    if (m) return handler(m, locale);
  }
  return text; // graceful fallback — unknown template stays as-is
}

/** Localize every title in a session list (returns new objects, originals untouched). */
export function localizeSessionTitles<T extends { title: string; second?: { title: string } }>(sessions: T[], locale: string): T[] {
  if (locale !== 'en') return sessions;
  return sessions.map(s => ({
    ...s,
    title: localizeTrainingText(s.title, locale),
    ...(s.second ? { second: { ...s.second, title: localizeTrainingText(s.second.title, locale) } } : {}),
  }));
}
