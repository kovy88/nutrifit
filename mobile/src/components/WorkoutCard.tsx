// ── WORKOUT CARD
//
// Kompaktní list-item pro recent workout. Source-aware (badge ukazuje
// odkud data jsou — Strava, Apple Health, Manual, ...).

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate, TranslationKey } from '../lib/i18n';
import type { WorkoutSummary, WorkoutKind, HealthDataSource } from '../lib/health';

const KIND_ICON: Record<WorkoutKind, keyof typeof Ionicons.glyphMap> = {
  run: 'fitness-outline',
  walk: 'walk-outline',
  cycle: 'bicycle-outline',
  swim: 'water-outline',
  strength: 'barbell-outline',
  hiit: 'flash-outline',
  yoga: 'body-outline',
  functional: 'fitness-outline',
  rowing: 'boat-outline',
  other: 'ellipse-outline',
};

const SOURCE_LABEL: Partial<Record<HealthDataSource, string>> = {
  apple_health:   'Apple',
  apple_watch:    'Watch',
  health_connect: 'HC',
  google_fit:     'GFit',
  strava:         'Strava',
  whoop:          'Whoop',
  garmin:         'Garmin',
  polar:          'Polar',
  oura:           'Oura',
  fitbit:         'Fitbit',
  zepp:           'Zepp',
  suunto:         'Suunto',
  mock:           'Mock',
  manual:         'Manual',
};

export type WorkoutCardProps = {
  workout: WorkoutSummary;
  onPress?: () => void;
};

export function WorkoutCard({ workout, onPress }: WorkoutCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const icon = KIND_ICON[workout.kind];
  const kindLabel = t(`wkind.${workout.kind}` as TranslationKey);
  const sourceBadge = SOURCE_LABEL[workout.source] || workout.source;
  const dateLabel = formatDateTime(workout.startedAt, t);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.card, shadowColor: colors.shadow },
        pressed && onPress ? { opacity: 0.75 } : null,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent + '14' }]}>
          <Ionicons name={icon} size={22} color={colors.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: colors.ink }]}>{kindLabel}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{dateLabel}</Text>
        </View>
        <Text style={[styles.sourceBadge, { color: colors.muted, borderColor: colors.border, backgroundColor: colors.bgElev }]}>
          {sourceBadge}
        </Text>
      </View>
      <View style={styles.metricsRow}>
        <Metric label={t('workout.duration')} value={`${workout.durationMinutes} min`} color={colors.ink} />
        {workout.distanceKm != null && (
          <Metric label={t('workout.distance')} value={`${workout.distanceKm} km`} color={colors.blue} />
        )}
        {workout.avgHeartRate != null && (
          <Metric label={t('workout.avgHr')} value={`${workout.avgHeartRate} bpm`} color={colors.red} />
        )}
        {workout.activeEnergyKcal != null && (
          <Metric label={t('workout.kcal')} value={`${workout.activeEnergyKcal}`} color={colors.orange} />
        )}
      </View>
    </Pressable>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.bgElev, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.faint }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function formatDateTime(iso: string, t: Translate): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compared = new Date(d);
  compared.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - compared.getTime()) / 86_400_000);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 0) return t('workout.dtToday', { time });
  if (diffDays === 1) return t('workout.dtYesterday', { time });
  return t('workout.dtDate', { date: `${d.getDate()}. ${d.getMonth() + 1}.`, time });
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  titleCol: { flex: 1 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 999,
    letterSpacing: 0.3,
  },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { minWidth: 76, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  metricLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 14, fontWeight: '900', marginTop: 2 },
});
