// ── SDÍLENÝ STAV APLIKACE
// Ostatní moduly importují appState a mutují ho přímo (objekty jsou předávány referencí)

export const appState = {
  gender: 'muz',
  goal: 'hubnutí',
  activityFactor: 1.375,
  macros: {},
  mealCount: 5,
  dayPlannerOpen: false,
  selectedDate: '',
  dailyData: null,
  weeklyDays: [],
  trackingTrends: { days: [], streak: 0 },
  waterGoalMl: 0,
  currentRecipes: [],
  foodLog: [],
  pendingFoodEstimate: null,
  ingredientLevel: 'standard',
  profileGenderVal: 'muz',
  profileGoalVal: 'hubnutí',
  dayDurations: [60, 60, 60, 60, 60, 60, 60],
  afs: {}, // animation frame handles
};

// ── KONSTANTY

export const MEAL_NAMES = {
  2: ['Snídaně', 'Večeře'],
  3: ['Snídaně', 'Oběd', 'Večeře'],
  4: ['Snídaně', 'Oběd', 'Odpolední svačina', 'Večeře'],
  5: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře'],
  6: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře', '2. večeře'],
};

export const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

export const ACTIVITY_TYPES = [
  { value: 'rest',    label: 'Volno',                 met: 0 },
  { value: 'gym',     label: 'Posilovna / Silový',     met: 6 },
  { value: 'cardio',  label: 'Běh / Kardio',           met: 8 },
  { value: 'hiit',    label: 'HIIT / CrossFit',        met: 9 },
  { value: 'boxing',  label: 'Box / Thaibox / MMA',    met: 10 },
  { value: 'bike',    label: 'Cyklistika',             met: 7 },
  { value: 'sport',   label: 'Míčové sporty',          met: 7 },
  { value: 'yoga',    label: 'Jóga / Pilates',         met: 3 },
  { value: 'walk',    label: 'Chůze / Turistika',      met: 4 },
  { value: 'swim',    label: 'Plavání',                met: 7 },
  { value: 'work',    label: 'Fyzická práce',          met: 5 },
];

export const MACRO_LIMITS = {
  kcal:    { min: 1200, max: 5000 },
  protein: { min: 10,   max: 300  },
  carbs:   { min: 0,    max: 600  },
  fat:     { min: 10,   max: 200  },
};

export const SHOP_CATEGORIES = {
  'Maso & ryby':         ['kuřec', 'hovězí', 'vepřov', 'losos', 'tuňák', 'ryb', 'krůt', 'mlet'],
  'Vejce & mléčné':     ['vejc', 'jogurt', 'tvaroh', 'sýr', 'mléko', 'kefír', 'máslo', 'řecký'],
  'Zelenina':            ['brokolice', 'špenát', 'rajče', 'paprik', 'cuketa', 'mrkev', 'zeleni', 'salát', 'cibul', 'česnek', 'dýn', 'kukuřic'],
  'Ovoce':               ['banán', 'jablk', 'pomeranč', 'citron', 'maliny', 'jahod', 'borůvk', 'mango', 'avokádo', 'hrozn'],
  'Obiloviny & přílohy': ['rýže', 'těstovin', 'ovesn', 'chleb', 'pečivo', 'quinoa', 'kuskus', 'pohank', 'knedlík', 'brambor'],
  'Luštěniny & ořechy':  ['čočka', 'fazol', 'hrách', 'cizrna', 'ořech', 'mandle', 'kešu', 'arašíd'],
  'Ostatní':             [],
};

// ── AUTH LISTENER
// Inicializuje Supabase session listener; volat jednou z main.js při startu

import { supabase } from './supabase.js?v=8';
import { _setCurrentUser } from './auth.js?v=8';

export function initAuthListener(onSignIn, onSignOut) {
  // Zkontroluj existující session (přežití reloadu stránky díky persistSession: true)
  supabase.auth.getSession().then(({ data: { session } }) => {
    _setCurrentUser(session?.user ?? null);
    if (session?.user) onSignIn(); else onSignOut?.();
  });

  // Sleduj změny stavu autentizace (přihlášení, odhlášení, vypršení tokenu)
  supabase.auth.onAuthStateChange((_event, session) => {
    _setCurrentUser(session?.user ?? null);
    if (_event === 'SIGNED_IN')  onSignIn();
    if (_event === 'SIGNED_OUT') onSignOut?.();
  });
}
