// ── WORKOUT DETAIL MODAL
//
// Otevírá se po klepnutí na WorkoutCard v Trénink screen / HomeScreen
// (recent workouts). User-facing workout detail with optional source deep-link.

import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './UI';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate, TranslationKey } from '../lib/i18n';
import { computeFueling } from '../lib/nutrition/workoutFueling';
import { formatPace } from '../lib/units';
import type { WorkoutSummary, WorkoutKind, HealthDataSource } from '../lib/health';

const KIND_ICON: Record<WorkoutKind, keyof typeof Ionicons.glyphMap> = {
  run: 'fitness-outline', walk: 'walk-outline', cycle: 'bicycle-outline', swim: 'water-outline',
  strength: 'barbell-outline', hiit: 'flash-outline', yoga: 'body-outline',
  functional: 'fitness-outline', rowing: 'boat-outline', other: 'ellipse-outline',
};

const SOURCE_LABEL: Partial<Record<HealthDataSource, string>> = {
  apple_health:   'Apple Health',
  apple_watch:    'Apple Watch',
  health_connect: 'Health Connect',
  google_fit:     'Google Fit',
  strava:         'Strava',
  whoop:          'Whoop',
  garmin:         'Garmin Connect',
  polar:          'Polar Flow',
  oura:           'Oura Ring',
  fitbit:         'Fitbit',
  zepp:           'Zepp',
  suunto:         'Suunto',
  mock:           'Mock (dev)',
};

export type WorkoutDetailModalProps = {
  workout: WorkoutSummary | null;
  onClose: () => void;
};

export function WorkoutDetailModal({ workout, onClose }: WorkoutDetailModalProps) {
  const { colors } = useTheme();
  const { profile } = useTrenr();
  const { t, locale } = useLanguage();
  if (!workout) return null;

  const fueling = profile ? computeFueling({ workout, weightKg: profile.weight, locale }) : null;

  const icon = KIND_ICON[workout.kind] || 'ellipse-outline';
  const kindLabel = t(`wkindFull.${workout.kind}` as TranslationKey);
  const sourceLabel = workout.source === 'manual' ? t('workout.srcManual') : (SOURCE_LABEL[workout.source] || workout.source);
  const startedAt = formatFullDateTime(workout.startedAt, t);
  const endedAt = formatTime(workout.endedAt);
  const pace = workout.avgPaceSecPerKm ? formatPace(workout.avgPaceSecPerKm, profile?.units ?? 'metric') : null;

  function openSource() {
    if (workout?.source === 'strava' && workout.externalId) {
      void Linking.openURL(`https://www.strava.com/activities/${workout.externalId}`);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
          <ScrollView contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Ionicons name={icon} size={34} color={colors.green} style={styles.kindIcon} />
              <View style={styles.headerCol}>
                <Text style={[styles.title, { color: colors.ink }]}>{kindLabel}</Text>
                <Text style={[styles.dateTime, { color: colors.muted }]}>{startedAt} – {endedAt}</Text>
              </View>
            </View>

            {/* Source badge */}
            <Text style={[styles.sourceBadge, { color: colors.muted, borderColor: colors.border, backgroundColor: colors.bgElev }]}>
              {sourceLabel}
            </Text>

            {/* Big primary metric */}
            <View style={[styles.primaryCol, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
              <Metric
                label={t('workout.duration')}
                value={`${workout.durationMinutes} min`}
                color={colors.ink}
                big
              />
              {workout.distanceKm != null && (
                <Metric label={t('workout.distance')} value={`${workout.distanceKm} km`} color={colors.blue} big />
              )}
            </View>

            {/* Secondary metrics grid */}
            <View style={styles.metricsGrid}>
              {pace && (
                <Metric label={t('workout.avgPace')} value={pace} color={colors.green} />
              )}
              {workout.avgHeartRate != null && (
                <Metric label={t('workout.avgHr')} value={`${workout.avgHeartRate} bpm`} color={colors.red} />
              )}
              {workout.maxHeartRate != null && (
                <Metric label={t('workout.maxHr')} value={`${workout.maxHeartRate} bpm`} color={colors.red} />
              )}
              {workout.activeEnergyKcal != null && (
                <Metric label={t('workout.burned')} value={`${workout.activeEnergyKcal} kcal`} color={colors.orange} />
              )}
            </View>

            {/* Fueling recommendation — pre/intra/post per workout intensity */}
            {fueling && (
              <View style={[styles.fuelingBox, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
                <Text style={[styles.fuelingTitle, { color: colors.ink }]}>{t('workout.fuelingTitle')}</Text>
                <Text style={[styles.fuelingSummary, { color: colors.muted }]}>{fueling.summary}</Text>
                {fueling.pre && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>
                      {t('workout.fuelPre', { min: fueling.pre.timingMinBefore })}
                    </Text>
                    <Text style={[styles.fuelingValue, { color: colors.green }]}>
                      {t('workout.fuelCarbsProtein', { c: fueling.pre.carbsG, p: fueling.pre.proteinG })}
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.pre.note}</Text>
                  </View>
                )}
                {fueling.intra && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>{t('workout.duringWorkout')}</Text>
                    <Text style={[styles.fuelingValue, { color: colors.orange }]}>
                      {t('workout.fuelCarbsPerHour', { c: fueling.intra.carbsGPerHour })}
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.intra.note}</Text>
                  </View>
                )}
                {fueling.post && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>
                      {t('workout.fuelPost', { min: fueling.post.timingMinAfter })}
                    </Text>
                    <Text style={[styles.fuelingValue, { color: colors.red }]}>
                      {t('workout.fuelCarbsProtein', { c: fueling.post.carbsG, p: fueling.post.proteinG })}
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.post.note}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Source action */}
            {workout.source === 'strava' && workout.externalId && (
              <Button variant="primary" onPress={openSource}>
                {t('workout.openStrava')}
              </Button>
            )}
          </ScrollView>
          <Button variant="secondary" onPress={onClose}>{t('common.close')}</Button>
        </View>
      </View>
    </Modal>
  );
}

function Metric({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, { borderColor: colors.border, backgroundColor: colors.bgElev }, big && styles.metricBig]}>
      <Text style={[styles.metricLabel, { color: colors.faint }]}>{label}</Text>
      <Text style={[big ? styles.metricValueBig : styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function formatFullDateTime(iso: string, t: Translate): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compared = new Date(d);
  compared.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - compared.getTime()) / 86_400_000);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 0) return t('workout.dtTodayFull', { time });
  if (diffDays === 1) return t('workout.dtYesterdayFull', { time });
  return t('workout.dtFull', { date: `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`, time });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(25,33,29,0.5)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 8,
  },
  content: { gap: 16, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kindIcon: { width: 40, textAlign: 'center' },
  headerCol: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontWeight: '900' },
  dateTime: { fontSize: 13, fontWeight: '600' },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
    borderWidth: 1,
    borderRadius: 999,
    letterSpacing: 0.3,
  },
  primaryCol: {
    flexDirection: 'row',
    gap: 24,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
    justifyContent: 'space-around',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: { minWidth: 100, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  metricBig: { alignItems: 'center', minWidth: 0 },
  metricLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  metricValue: { fontSize: 17, fontWeight: '900' },
  metricValueBig: { fontSize: 28, fontWeight: '900' },
  fuelingBox: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  fuelingTitle: { fontSize: 15, fontWeight: '900' },
  fuelingSummary: { fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  fuelingRow: { gap: 2, marginTop: 6 },
  fuelingLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  fuelingValue: { fontSize: 14, fontWeight: '900' },
  fuelingNote: { fontSize: 11, lineHeight: 15, marginTop: 2 },
});
