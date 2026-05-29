// ── WORKOUT DETAIL MODAL
//
// Otevírá se po klepnutí na WorkoutCard v Trénink screen / HomeScreen
// (recent workouts). Plná breakdown a deep-link na source provider.

import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from './UI';
import { useTheme } from '../context/ThemeContext';
import { useNutriFit } from '../context/NutriFitContext';
import { computeFueling } from '../lib/nutrition/workoutFueling';
import type { WorkoutSummary, WorkoutKind, HealthDataSource } from '../lib/health';

const KIND_EMOJI: Record<WorkoutKind, string> = {
  run: '🏃', walk: '🚶', cycle: '🚴', swim: '🏊',
  strength: '🏋️', hiit: '⚡', yoga: '🧘',
  functional: '💪', rowing: '🚣', other: '🏅',
};

const KIND_LABEL: Record<WorkoutKind, string> = {
  run: 'Běh', walk: 'Chůze', cycle: 'Kolo', swim: 'Plavání',
  strength: 'Silový trénink', hiit: 'HIIT', yoga: 'Jóga',
  functional: 'Funkční trénink', rowing: 'Veslování', other: 'Trénink',
};

const SOURCE_LABEL: Partial<Record<HealthDataSource, string>> = {
  apple_health:   '🍎 Apple Health',
  apple_watch:    '⌚ Apple Watch',
  health_connect: '🤖 Health Connect',
  google_fit:     'Google Fit',
  strava:         '🟠 Strava',
  whoop:          'Whoop',
  garmin:         'Garmin Connect',
  polar:          'Polar Flow',
  oura:           'Oura Ring',
  fitbit:         'Fitbit',
  zepp:           'Zepp',
  suunto:         'Suunto',
  mock:           '🧪 Mock (dev)',
  manual:         '✋ Ručně zapsáno',
};

export type WorkoutDetailModalProps = {
  workout: WorkoutSummary | null;
  onClose: () => void;
};

export function WorkoutDetailModal({ workout, onClose }: WorkoutDetailModalProps) {
  const { colors } = useTheme();
  const { profile } = useNutriFit();
  if (!workout) return null;

  const fueling = profile ? computeFueling({ workout, weightKg: profile.weight }) : null;

  const emoji = KIND_EMOJI[workout.kind] || '🏅';
  const kindLabel = KIND_LABEL[workout.kind] || 'Trénink';
  const sourceLabel = SOURCE_LABEL[workout.source] || workout.source;
  const startedAt = formatFullDateTime(workout.startedAt);
  const endedAt = formatTime(workout.endedAt);
  const pace = workout.avgPaceSecPerKm ? formatPace(workout.avgPaceSecPerKm) : null;

  function openSource() {
    if (workout?.source === 'strava' && workout.externalId) {
      void Linking.openURL(`https://www.strava.com/activities/${workout.externalId}`);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <ScrollView contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={styles.emoji}>{emoji}</Text>
              <View style={styles.headerCol}>
                <Text style={[styles.title, { color: colors.ink }]}>{kindLabel}</Text>
                <Text style={[styles.dateTime, { color: colors.muted }]}>{startedAt} – {endedAt}</Text>
              </View>
            </View>

            {/* Source badge */}
            <Text style={[styles.sourceBadge, { color: colors.muted, borderColor: colors.border }]}>
              {sourceLabel}
            </Text>

            {/* Big primary metric */}
            <View style={[styles.primaryCol, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
              <Metric
                label="Délka"
                value={`${workout.durationMinutes} min`}
                color={colors.ink}
                big
              />
              {workout.distanceKm != null && (
                <Metric label="Vzdálenost" value={`${workout.distanceKm} km`} color={colors.blue} big />
              )}
            </View>

            {/* Secondary metrics grid */}
            <View style={styles.metricsGrid}>
              {pace && (
                <Metric label="Průměrné tempo" value={pace} color={colors.green} />
              )}
              {workout.avgHeartRate != null && (
                <Metric label="Avg HR" value={`${workout.avgHeartRate} bpm`} color={colors.red} />
              )}
              {workout.maxHeartRate != null && (
                <Metric label="Max HR" value={`${workout.maxHeartRate} bpm`} color={colors.red} />
              )}
              {workout.activeEnergyKcal != null && (
                <Metric label="Spáleno" value={`${workout.activeEnergyKcal} kcal`} color={colors.orange} />
              )}
            </View>

            {/* Fueling recommendation — pre/intra/post per workout intensity */}
            {fueling && (
              <View style={[styles.fuelingBox, { borderTopColor: colors.border }]}>
                <Text style={[styles.fuelingTitle, { color: colors.ink }]}>🍌 Doporučený fueling</Text>
                <Text style={[styles.fuelingSummary, { color: colors.muted }]}>{fueling.summary}</Text>
                {fueling.pre && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>
                      Pre · {fueling.pre.timingMinBefore} min předem
                    </Text>
                    <Text style={[styles.fuelingValue, { color: colors.green }]}>
                      {fueling.pre.carbsG}g sacharidů + {fueling.pre.proteinG}g bílkovin
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.pre.note}</Text>
                  </View>
                )}
                {fueling.intra && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>Během tréninku</Text>
                    <Text style={[styles.fuelingValue, { color: colors.orange }]}>
                      {fueling.intra.carbsGPerHour}g sacharidů / hodinu
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.intra.note}</Text>
                  </View>
                )}
                {fueling.post && (
                  <View style={styles.fuelingRow}>
                    <Text style={[styles.fuelingLabel, { color: colors.faint }]}>
                      Post · do {fueling.post.timingMinAfter} min po
                    </Text>
                    <Text style={[styles.fuelingValue, { color: colors.red }]}>
                      {fueling.post.carbsG}g sacharidů + {fueling.post.proteinG}g bílkovin
                    </Text>
                    <Text style={[styles.fuelingNote, { color: colors.muted }]}>{fueling.post.note}</Text>
                  </View>
                )}
              </View>
            )}

            {/* External ID footer (debug-ish, useful for support) */}
            {workout.externalId && (
              <Text style={[styles.externalId, { color: colors.faint }]}>
                ID: {workout.externalId}
              </Text>
            )}

            {/* Source action */}
            {workout.source === 'strava' && workout.externalId && (
              <Button variant="primary" onPress={openSource}>
                🟠 Otevřít na Strava
              </Button>
            )}
          </ScrollView>
          <Button variant="secondary" onPress={onClose}>Zavřít</Button>
        </View>
      </View>
    </Modal>
  );
}

function Metric({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, big && styles.metricBig]}>
      <Text style={[styles.metricLabel, { color: colors.faint }]}>{label}</Text>
      <Text style={[big ? styles.metricValueBig : styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compared = new Date(d);
  compared.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - compared.getTime()) / 86_400_000);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 0) return `Dnes ${time}`;
  if (diffDays === 1) return `Včera ${time}`;
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${time}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(25,33,29,0.5)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
  content: { gap: 16, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 40 },
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
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    justifyContent: 'space-around',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  metric: { minWidth: 100 },
  metricBig: { alignItems: 'center', minWidth: 0 },
  metricLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  metricValue: { fontSize: 17, fontWeight: '900' },
  metricValueBig: { fontSize: 28, fontWeight: '900' },
  externalId: { fontSize: 11, fontFamily: 'System', marginTop: 8 },
  fuelingBox: { borderTopWidth: 1, paddingTop: 14, gap: 10 },
  fuelingTitle: { fontSize: 15, fontWeight: '900' },
  fuelingSummary: { fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  fuelingRow: { gap: 2, marginTop: 6 },
  fuelingLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  fuelingValue: { fontSize: 14, fontWeight: '900' },
  fuelingNote: { fontSize: 11, lineHeight: 15, marginTop: 2 },
});
