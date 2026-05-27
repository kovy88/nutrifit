// Tiny zero-dep test runner. Spouštěj přes `node tests/run.js`.
// Nahrává všechny soubory tests/*.test.js, sbírá výsledky z test() volání.

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const state = { passed: 0, failed: 0, current: '', errors: [] };

globalThis.test = (name, fn) => {
  const fullName = `${state.current} › ${name}`;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { state.passed++; log('ok', fullName); },
        err => { state.failed++; state.errors.push({ name: fullName, err }); log('fail', fullName, err); },
      );
    }
    state.passed++;
    log('ok', fullName);
  } catch (err) {
    state.failed++;
    state.errors.push({ name: fullName, err });
    log('fail', fullName, err);
  }
};

globalThis.expect = actual => ({
  toBe(expected) {
    if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  toEqual(expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  toBeCloseTo(expected, tolerance = 1) {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`expected ~${expected} (±${tolerance}), got ${actual}`);
    }
  },
  toBeGreaterThan(n) {
    if (!(actual > n)) throw new Error(`expected > ${n}, got ${actual}`);
  },
  toBeLessThan(n) {
    if (!(actual < n)) throw new Error(`expected < ${n}, got ${actual}`);
  },
  toBeGreaterThanOrEqual(n) {
    if (!(actual >= n)) throw new Error(`expected >= ${n}, got ${actual}`);
  },
  toBeLessThanOrEqual(n) {
    if (!(actual <= n)) throw new Error(`expected <= ${n}, got ${actual}`);
  },
  toBeTruthy() {
    if (!actual) throw new Error(`expected truthy, got ${JSON.stringify(actual)}`);
  },
  toBeFalsy() {
    if (actual) throw new Error(`expected falsy, got ${JSON.stringify(actual)}`);
  },
  toContain(needle) {
    if (typeof actual === 'string') {
      if (!actual.includes(needle)) throw new Error(`expected "${actual}" to contain "${needle}"`);
    } else if (Array.isArray(actual)) {
      if (!actual.includes(needle)) throw new Error(`expected array to contain ${JSON.stringify(needle)}`);
    } else {
      throw new Error('toContain works only on string or array');
    }
  },
});

function log(kind, name, err) {
  const symbol = kind === 'ok' ? '✓' : '✗';
  const color = kind === 'ok' ? '\x1b[32m' : '\x1b[31m';
  process.stdout.write(`${color}${symbol}\x1b[0m ${name}\n`);
  if (err) process.stdout.write(`   ${err.message ?? err}\n`);
}

const files = readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
for (const file of files) {
  state.current = file.replace(/\.test\.js$/, '');
  await import(pathToFileURL(join(__dirname, file)).href);
}

process.stdout.write(`\n${state.passed} passed, ${state.failed} failed\n`);
if (state.failed > 0) process.exit(1);
