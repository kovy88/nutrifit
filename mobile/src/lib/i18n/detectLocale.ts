// ── LOCALE DETECTION (Hermes-safe, no native dep)
//
// Intl.DateTimeFormat().resolvedOptions().locale is available in Hermes
// (RN JS engine) and Node — returns something like 'en-US' or 'cs-CZ'.
// No expo-localization package needed.
//
// Mapping: anything starting with 'cs'/'sk' → 'cs', everything else → 'en'.
// Default is 'en' — the primary market is English-speaking; Czech/Slovak
// devices still get their own language.

import type { Locale } from './types';

export function detectDeviceLocale(): Locale {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US"
    const lang = resolved.toLowerCase().split('-')[0];
    if (lang === 'cs' || lang === 'sk') return 'cs'; // Czech/Slovak devices get Czech
    return 'en';
  } catch {
    return 'en';
  }
}
