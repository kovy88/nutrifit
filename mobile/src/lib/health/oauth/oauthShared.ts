// ── Shared OAuth helpers ──────────────────────────────────────────────────
//
// Strava/Whoop/Oura/Garmin each had their own byte-identical copy of "N
// random hex chars" (used for CSRF state, and — Garmin only — the PKCE
// verifier) and of deep-link query parsing. Consolidated here so there's
// one implementation instead of four.

/** Random hex string of `length` chars. Not crypto.getRandomValues-backed
 *  (not available on all Hermes versions) — Math.random is sufficient
 *  entropy for CSRF state and a PKCE verifier (~1e19 combinations at
 *  length 16, astronomically more at length 64). */
export function generateRandomHex(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function parseQuery(url: string): { code?: string; state?: string; error?: string } {
  const q = url.split('?')[1] || '';
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}
