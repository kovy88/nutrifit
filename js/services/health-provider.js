// ── HEALTH DATA PROVIDER ABSTRACTION
//
// Jednotné rozhraní nad zdroji dat o aktivitě a zdraví uživatele. Cílový
// stav: konzument (nutrition / training / dashboard) nezná původ dat.
// Web demo používá Mock, později můžeme přepnout na Apple HealthKit přes
// nativní bridge bez zásahu do business logiky.
//
// Žádný DOM přístup, žádný stav uvnitř providerů kromě nastavení.

/** @typedef {import('../domain/types.js').DailyActivitySummary} DailyActivitySummary */
/** @typedef {import('../domain/types.js').WorkoutSummary} WorkoutSummary */
/** @typedef {import('../domain/types.js').SleepSummary} SleepSummary */
/** @typedef {import('../domain/types.js').HealthMetric} HealthMetric */

/**
 * Společné rozhraní. JS nemá interfaces, používáme abstract třídu jako
 * dokumentaci kontraktu. Volající nikdy nevolá HealthDataProvider přímo.
 *
 * @abstract
 */
export class HealthDataProvider {
  /** @returns {string} */
  get name() { return 'abstract'; }
  /** @returns {Promise<boolean>} */
  async isAvailable() { return false; }

  /**
   * @param {string} _startISO
   * @param {string} _endISO
   * @returns {Promise<DailyActivitySummary[]>}
   */
  async getDailyActivityRange(_startISO, _endISO) { throw new Error('not implemented'); }

  /**
   * @param {string} _startISO
   * @param {string} _endISO
   * @returns {Promise<WorkoutSummary[]>}
   */
  async getWorkoutSummaries(_startISO, _endISO) { throw new Error('not implemented'); }

  /** @returns {Promise<number|null>} */
  async getLatestBodyWeight() { return null; }

  /**
   * @param {string} _startISO
   * @param {string} _endISO
   * @returns {Promise<SleepSummary[]>}
   */
  async getSleepSummary(_startISO, _endISO) { return []; }

  /**
   * @param {string} _startISO
   * @param {string} _endISO
   * @returns {Promise<HealthMetric[]>}
   */
  async getHeartRateMetrics(_startISO, _endISO) { return []; }
}

// ── MOCK PROVIDER ────────────────────────────────────────────────────────
//
// Deterministická náhrada pro vývoj, demo a testy. Generuje pravděpodobné
// hodnoty z hashe (date+seed), takže opakované volání vrátí stejná data —
// dobré pro snapshot testy.

export class MockHealthDataProvider extends HealthDataProvider {
  /** @param {{ seed?:string, weightKg?:number }} [opts] */
  constructor(opts = {}) {
    super();
    this.seed = opts.seed ?? 'nutriplan';
    this.weightKg = opts.weightKg ?? 75;
  }
  get name() { return 'mock'; }
  async isAvailable() { return true; }

  async getDailyActivityRange(startISO, endISO) {
    return rangeDays(startISO, endISO).map(date => {
      const rng = mulberry(hash(`${this.seed}|${date}|act`));
      const isWeekend = ['Sat', 'Sun'].includes(new Date(`${date}T12:00:00`).toDateString().slice(0, 3));
      const baseSteps = isWeekend ? 5500 : 8500;
      const steps = Math.round(baseSteps + (rng() - 0.5) * 4000);
      const activeEnergyKcal = Math.round(steps * 0.04 + (rng() - 0.5) * 80);
      return {
        date,
        steps: Math.max(0, steps),
        activeEnergyKcal: Math.max(0, activeEnergyKcal),
        basalEnergyKcal: Math.round(this.weightKg * 22),
        exerciseMinutes: Math.round(rng() * 60),
        standHours: Math.round(8 + rng() * 4),
      };
    });
  }

  async getWorkoutSummaries(startISO, endISO) {
    const out = /** @type {WorkoutSummary[]} */ ([]);
    rangeDays(startISO, endISO).forEach((date, i) => {
      const rng = mulberry(hash(`${this.seed}|${date}|wk`));
      // Tréninky v Po/St/Pá/Ne pattern
      const dow = new Date(`${date}T12:00:00`).getDay();
      if (![1, 3, 5, 0].includes(dow)) return;
      const isRun = dow !== 5;
      if (isRun) {
        const km = 5 + Math.round(rng() * 8);
        const paceSec = 360 + Math.round(rng() * 60);
        out.push({
          id: `mock-${date}-run`,
          date,
          kind: 'run',
          durationMinutes: Math.round((km * paceSec) / 60),
          distanceKm: km,
          avgPaceSecPerKm: paceSec,
          avgHeartRate: 140 + Math.round(rng() * 20),
          activeEnergyKcal: Math.round(km * 65),
          source: 'mock',
        });
      } else {
        out.push({
          id: `mock-${date}-str`,
          date,
          kind: 'strength',
          durationMinutes: 40 + Math.round(rng() * 15),
          activeEnergyKcal: 260,
          source: 'mock',
        });
      }
    });
    return out;
  }

  async getLatestBodyWeight() {
    return this.weightKg;
  }

  async getSleepSummary(startISO, endISO) {
    return rangeDays(startISO, endISO).map(date => {
      const rng = mulberry(hash(`${this.seed}|${date}|sl`));
      const total = Math.round(380 + (rng() - 0.5) * 90);
      return {
        date,
        totalMinutes: total,
        deepMinutes: Math.round(total * 0.18),
        remMinutes: Math.round(total * 0.22),
        efficiency: 0.85 + rng() * 0.1,
      };
    });
  }

  async getHeartRateMetrics(startISO, endISO) {
    const out = /** @type {HealthMetric[]} */ ([]);
    rangeDays(startISO, endISO).forEach(date => {
      const rng = mulberry(hash(`${this.seed}|${date}|hr`));
      out.push({ date, kind: 'resting_heart_rate', value: Math.round(54 + rng() * 8), unit: 'bpm', source: 'mock' });
      out.push({ date, kind: 'hrv', value: Math.round(45 + rng() * 20), unit: 'ms', source: 'mock' });
    });
    return out;
  }
}

// ── MANUAL PROVIDER ──────────────────────────────────────────────────────
//
// Čte data z manuálně zadaných záznamů. Slouží i jako fallback, když nemá
// uživatel HealthKit (web). Vstupní data drží volající (typicky Supabase
// nebo localStorage), provider nad nimi jen filtruje.

export class ManualHealthDataProvider extends HealthDataProvider {
  /**
   * @param {{
   *   activities?: DailyActivitySummary[],
   *   workouts?: WorkoutSummary[],
   *   sleep?: SleepSummary[],
   *   weights?: { date:string, weightKg:number }[],
   * }} [data]
   */
  constructor(data = {}) {
    super();
    this.activities = data.activities ?? [];
    this.workouts = data.workouts ?? [];
    this.sleep = data.sleep ?? [];
    this.weights = data.weights ?? [];
  }
  get name() { return 'manual'; }
  async isAvailable() { return true; }

  async getDailyActivityRange(startISO, endISO) {
    return this.activities.filter(a => inRange(a.date, startISO, endISO));
  }
  async getWorkoutSummaries(startISO, endISO) {
    return this.workouts.filter(w => inRange(w.date, startISO, endISO));
  }
  async getSleepSummary(startISO, endISO) {
    return this.sleep.filter(s => inRange(s.date, startISO, endISO));
  }
  async getLatestBodyWeight() {
    const sorted = [...this.weights].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.length ? sorted[sorted.length - 1].weightKg : null;
  }
}

// ── APPLE HEALTH PLACEHOLDER ────────────────────────────────────────────
//
// Web build NEMÁ skutečné HealthKit napojení a tato třída nikdy nepředstírá,
// že má. Slouží jako kontrakt pro budoucí iOS verzi (Expo + react-native-health
// nebo nativní modul). Konzument (services / UI) může od počátku importovat
// AppleHealthProvider — fallback se postará o demo data, dokud nepřijde build,
// který nativní bridge skutečně poskytne.
//
// Plánované HealthKit data types (HKQuantityTypeIdentifier*):
//   - stepCount
//   - activeEnergyBurned
//   - basalEnergyBurned
//   - distanceWalkingRunning
//   - heartRate
//   - restingHeartRate
//   - heartRateVariabilitySDNN
//   - bodyMass
//   - bodyFatPercentage (volitelné)
//   - dietaryEnergyConsumed / protein / carbohydrates / fat (později, pro export naopak)
// Plus HKWorkoutType pro workouty (běh, kolo, plavání, silové).
//
// Permission strategy:
//   - vždy explicitně vyžádat MINIMÁLNÍ množinu (read-only) při onboardingu
//   - každé povolení doprovázet textem „proč ho aplikace potřebuje“
//   - zápisy do HealthKit (např. dietary energy) jsou opt-in v nastavení

export class AppleHealthProvider extends HealthDataProvider {
  /**
   * @param {{ fallback?: HealthDataProvider }} [opts]
   */
  constructor(opts = {}) {
    super();
    this.fallback = opts.fallback ?? new MockHealthDataProvider();
    // TODO(ios): nahradit fallback skutečným bridgem do HealthKit
    //   - inicializace: HealthKit.initHealthKit(permissions)
    //   - permissions.read = ['Steps','ActiveEnergyBurned','HeartRate','Workout','SleepAnalysis','BodyMass','HeartRateVariability','RestingHeartRate']
    //   - vrácení dat → mapovat na DailyActivitySummary / WorkoutSummary / SleepSummary
  }

  get name() { return 'apple_health_placeholder'; }
  async isAvailable() {
    // TODO(ios): vrátit true jen když je nativní bridge skutečně dostupný
    return false;
  }

  async getDailyActivityRange(startISO, endISO) {
    // TODO(ios): HealthKit query, mapování → DailyActivitySummary
    return this.fallback.getDailyActivityRange(startISO, endISO);
  }
  async getWorkoutSummaries(startISO, endISO) {
    // TODO(ios): HKWorkoutType query, mapování → WorkoutSummary (kind dle activity type)
    return this.fallback.getWorkoutSummaries(startISO, endISO);
  }
  async getLatestBodyWeight() {
    // TODO(ios): bodyMass sample, kg
    return this.fallback.getLatestBodyWeight();
  }
  async getSleepSummary(startISO, endISO) {
    // TODO(ios): SleepAnalysis samples, agregace per noc → SleepSummary
    return this.fallback.getSleepSummary(startISO, endISO);
  }
  async getHeartRateMetrics(startISO, endISO) {
    // TODO(ios): RHR + HRV samples per den
    return this.fallback.getHeartRateMetrics(startISO, endISO);
  }
}

// ── FACTORY ─────────────────────────────────────────────────────────────

/**
 * Vybere providera podle prostředí. Pro web vrací Mock (nebo Manual, pokud
 * jsou předaná data). Apple verze později vrátí AppleHealthProvider.
 *
 * @param {{ mode?:'auto'|'mock'|'manual'|'apple_health', manualData?:any, weightKg?:number }} [opts]
 * @returns {HealthDataProvider}
 */
export function createHealthDataProvider(opts = {}) {
  if (opts.mode === 'mock') return new MockHealthDataProvider({ weightKg: opts.weightKg });
  if (opts.mode === 'manual') return new ManualHealthDataProvider(opts.manualData);
  if (opts.mode === 'apple_health') return new AppleHealthProvider();
  // auto: na webu Mock, na iOS později Apple
  return new MockHealthDataProvider({ weightKg: opts.weightKg });
}

// ── helpers ──────────────────────────────────────────────────────────────

function rangeDays(startISO, endISO) {
  const out = [];
  const cur = new Date(`${startISO}T12:00:00`);
  const end = new Date(`${endISO}T12:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
