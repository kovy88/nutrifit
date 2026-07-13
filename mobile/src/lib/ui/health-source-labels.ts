import type { HealthDataSource } from '../../types/health';

type Locale = 'cs' | 'en';
type LabelVariant = 'compact' | 'full';

const COMPACT_LABELS: Record<HealthDataSource, { cs: string; en: string }> = {
  apple_health: { cs: 'Apple', en: 'Apple' },
  apple_watch: { cs: 'Watch', en: 'Watch' },
  health_connect: { cs: 'Zdraví', en: 'Health' },
  google_fit: { cs: 'Google Fit', en: 'Google Fit' },
  strava: { cs: 'Strava', en: 'Strava' },
  whoop: { cs: 'Whoop', en: 'Whoop' },
  garmin: { cs: 'Garmin', en: 'Garmin' },
  polar: { cs: 'Polar', en: 'Polar' },
  oura: { cs: 'Oura', en: 'Oura' },
  fitbit: { cs: 'Fitbit', en: 'Fitbit' },
  zepp: { cs: 'Zepp', en: 'Zepp' },
  suunto: { cs: 'Suunto', en: 'Suunto' },
  mock: { cs: 'Demo', en: 'Demo' },
  manual: { cs: 'Ručně', en: 'Manual' },
};

const FULL_LABELS: Record<HealthDataSource, { cs: string; en: string }> = {
  apple_health: { cs: 'Apple Health', en: 'Apple Health' },
  apple_watch: { cs: 'Apple Watch', en: 'Apple Watch' },
  health_connect: { cs: 'Health Connect', en: 'Health Connect' },
  google_fit: { cs: 'Google Fit', en: 'Google Fit' },
  strava: { cs: 'Strava', en: 'Strava' },
  whoop: { cs: 'Whoop', en: 'Whoop' },
  garmin: { cs: 'Garmin Connect', en: 'Garmin Connect' },
  polar: { cs: 'Polar Flow', en: 'Polar Flow' },
  oura: { cs: 'Oura Ring', en: 'Oura Ring' },
  fitbit: { cs: 'Fitbit', en: 'Fitbit' },
  zepp: { cs: 'Zepp', en: 'Zepp' },
  suunto: { cs: 'Suunto', en: 'Suunto' },
  mock: { cs: 'Demo data', en: 'Demo data' },
  manual: { cs: 'Ruční zápis', en: 'Manual entry' },
};

export function formatHealthSourceLabel(
  source: HealthDataSource,
  locale: Locale,
  variant: LabelVariant = 'compact',
): string {
  const labels = variant === 'full' ? FULL_LABELS : COMPACT_LABELS;
  return labels[source]?.[locale] ?? (locale === 'en' ? 'Health data' : 'Zdravotní data');
}
