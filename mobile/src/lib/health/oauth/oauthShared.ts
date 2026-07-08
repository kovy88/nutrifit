// ── Shared OAuth helpers ──────────────────────────────────────────────────
//
// Strava/Whoop/Oura/Garmin each had their own byte-identical copy of "N
// random hex chars" (used for CSRF state, and — Garmin only — the PKCE
// verifier) and of deep-link query parsing. Consolidated here so there's
// one implementation instead of four.

const HEX_CHARS = '0123456789abcdef';

/** Random hex string of `length` chars. Prefers `expo-crypto`'s CSPRNG
 *  (same optional-dependency pattern as `sha256Base64Url` in
 *  GarminOAuth.ts), falling back to Math.random() if the native module
 *  isn't resolvable. Math.random's entropy was already sufficient in
 *  practice for CSRF state / PKCE verifier (~1e19 combinations at length
 *  16), but a CSPRNG is the correct primitive when available. */
export async function generateRandomHex(length: number): Promise<string> {
  try {
    // @ts-ignore — optional native dep, not a declared dependency; falls
    // through to Math.random below if it isn't installed/resolvable.
    // eslint-disable-next-line import/no-unresolved -- intentionally optional, see above
    const mod = await import('expo-crypto');
    if (mod?.getRandomBytesAsync) {
      const bytes = await mod.getRandomBytesAsync(length);
      let s = '';
      for (let i = 0; i < length; i++) s += HEX_CHARS[bytes[i] % 16];
      return s;
    }
  } catch {
    /* fall through to Math.random */
  }
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
