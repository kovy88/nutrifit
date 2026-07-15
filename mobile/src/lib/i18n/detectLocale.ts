// ── LOCALE DETECTION (Hermes-safe, no native dep)
//
// English is the default for every new install, regardless of device/OS
// language — the primary market is English-speaking. This intentionally
// does NOT auto-switch Czech/Slovak devices into Czech: a user who wants
// Czech picks it manually in Settings (see LanguageContext), which persists
// and overrides this default from then on.

import type { Locale } from './types';

export function detectDeviceLocale(): Locale {
  return 'en';
}
