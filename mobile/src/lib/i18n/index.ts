// ── I18N CORE
//
// createTranslator(locale) → t(key, params?) function.
// Fallback: if a key is missing in the target locale → en → the key itself (debug-friendly).
// English is the primary/default catalog (English-speaking market is primary).

import { cs, type TranslationKey } from './catalog.cs';
import { en } from './catalog.en';
import type { Locale } from './types';

const CATALOGS = { cs, en } as const;

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslateParams) => string;

export function createTranslator(locale: Locale): Translate {
  const primary = CATALOGS[locale];
  return (key: TranslationKey, params?: TranslateParams): string => {
    const value = (primary as Record<string, unknown>)[key] ?? (en as Record<string, unknown>)[key];
    if (value == null) return key; // missing → show key for debugging
    if (typeof value === 'function') {
      return (value as (p: TranslateParams) => string)(params ?? {});
    }
    return value as string;
  };
}

export { type Locale, SUPPORTED_LOCALES, LOCALE_LABELS } from './types';
export { detectDeviceLocale } from './detectLocale';
export type { TranslationKey } from './catalog.cs';
