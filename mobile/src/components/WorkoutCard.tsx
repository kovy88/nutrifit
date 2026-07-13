// ── WORKOUT CARD
//
// Kompaktní list-item pro recent workout. Source-aware (badge ukazuje
// odkud data jsou — Strava, Apple Health, Manual, ...).

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate, TranslationKey } from '../lib/i18n';
import { formatHealthSourceLabel } from '../lib/ui/health-source-labels';
import type { WorkoutSummary, WorkoutKind } from '../lib/health';

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

export type WorkoutCardProps = {
  workout: WorkoutSummary;
  onPress?: () => void;
};

export function WorkoutCard({ workout, onPress }: WorkoutCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const icon = KIND_ICON[workout.kind];
  const kindLabel = t(`wkind.${workout.kind}` as TranslationKey);
  const sourceBadge = formatHealthSourceLabel(workout.source, locale, 'compact');
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
        <View style={[styles.iconWrap, { backgroundColor: colors.accent + '10' }]}>
          <Ionicons name={icon} size={22} color={colors.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: colors.ink }]}>{kindLabel}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{dateLabel}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.sourceBadge, { color: colors.muted, borderColor: colors.border, backgroundColor: colors.bgElev }]}>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  titleCol: { flex: 1 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    letterSpacing: 0,
    maxWidth: 92,
  },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { minWidth: 76, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  metricLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0 },
  metricValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});
