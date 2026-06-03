// ── LOCALE DETECTION (Hermes-safe, no native dep)
//
// Intl.DateTimeFormat().resolvedOptions().locale je dostupný v Hermes
// (RN JS engine) i Node — vrací něco jako 'en-US' nebo 'cs-CZ'. Žádný
// expo-localization balíček není potřeba.
//
// Mapování: cokoli začínající 'cs' → 'cs', vše ostatní → 'en'. Default
// 'cs' protože je to native trh; ale pokud telefon je anglicky, dostane
// uživatel rovnou angličtinu.

import type { Locale } from './types';

export function detectDeviceLocale(): Locale {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US"
    const lang = resolved.toLowerCase().split('-')[0];
    if (lang === 'cs' || lang === 'sk') return 'cs'; // Slováci dostanou češtinu
    return 'en';
  } catch {
    return 'cs';
  }
}
