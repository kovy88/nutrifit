// ── WORKOUT CARD
//
// Kompaktní list-item pro recent workout. Source-aware (badge ukazuje
// odkud data jsou — Strava, Apple Health, Manual, ...).

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate, TranslationKey } from '../lib/i18n';
import type { WorkoutSummary, WorkoutKind, HealthDataSource } from '../lib/health';

const KIND_EMOJI: Record<WorkoutKind, string> = {
  run: '🏃',
  walk: '🚶',
  cycle: '🚴',
  swim: '🏊',
  strength: '🏋️',
  hiit: '⚡',
  yoga: '🧘',
  functional: '💪',
  rowing: '🚣',
  other: '🏅',
};

const SOURCE_LABEL: Partial<Record<HealthDataSource, string>> = {
  apple_health:   '🍎 Apple',
  apple_watch:    '⌚ Watch',
  health_connect: '🤖 HC',
  google_fit:     'GFit',
  strava:         '🟠 Strava',
  whoop:          'Whoop',
  garmin:         'Garmin',
  polar:          'Polar',
  oura:           'Oura',
  fitbit:         'Fitbit',
  zepp:           'Zepp',
  suunto:         'Suunto',
  mock:           '🧪 Mock',
  manual:         '✋ Manual',
};

export type WorkoutCardProps = {
  workout: WorkoutSummary;
  onPress?: () => void;
};

export function WorkoutCard({ workout, onPress }: WorkoutCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const emoji = KIND_EMOJI[workout.kind];
  const kindLabel = t(`wkind.${workout.kind}` as TranslationKey);
  const sourceBadge = SOURCE_LABEL[workout.source] || workout.source;
  const dateLabel = formatDateTime(workout.startedAt, t);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.card },
        pressed && onPress ? { opacity: 0.75 } : null,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: colors.ink }]}>{kindLabel}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{dateLabel}</Text>
        </View>
        <Text style={[styles.sourceBadge, { color: colors.faint, borderColor: colors.border }]}>
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
    <View style={styles.metric}>
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
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  titleCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: '900' },
  subtitle: { fontSize: 12, marginTop: 2 },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 999,
    letterSpacing: 0.3,
  },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metric: { minWidth: 70 },
  metricLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 14, fontWeight: '900', marginTop: 2 },
});
