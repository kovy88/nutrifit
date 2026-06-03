// ── I18N TYPES
//
// NutriFit podporuje dva jazyky: češtinu (default, native trh) a angličtinu
// (international). Catalog je keyed slovník; cs je zdroj pravdy pro klíče.

export type Locale = 'cs' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['cs', 'en'];

export const LOCALE_LABELS: Record<Locale, string> = {
  cs: 'Čeština',
  en: 'English',
};

/** Hodnoty v katalogu jsou buď string, nebo funkce s parametry pro
 *  interpolaci a pluralizaci (počty dní, hodnot atd.). */
export type CatalogValue = string | ((params: Record<string, string | number>) => string);

export type Catalog = Record<string, CatalogValue>;
