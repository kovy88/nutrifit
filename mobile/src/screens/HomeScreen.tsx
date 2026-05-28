import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle, FadeInView } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { normalizeFoodEstimate, primaryGoalLabel, remainingMacros, sumFoodLog, toDateKey, formatDateLabel } from '../utils/nutrition';
import type { TrainingSession, TrainingGoalKind } from '../types';
import { DateHeader } from '../components/DateHeader';
import { useNavigation } from '@react-navigation/native';
import { MacroRing } from '../components/MacroRing';
import { useTheme } from '../context/ThemeContext';
import { useDailyHealth } from '../hooks/useDailyHealth';
import { useDailyCoaching } from '../hooks/useDailyCoaching';
import type { ReadinessLevel } from '../lib/coaching/readiness';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import type { LoadStatus } from '../lib/coaching/trainingLoad';
import { composeMorningBriefing } from '../lib/coaching/composeMorningBriefing';

export function HomeScreen() {
  const { profile, macros, baselineMacros, todaySession, dailyAdjustment, setTodaySession, foodLog, addFood, removeFood, clearFood, selectedDate, weights, logWeight } = useNutriFit();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [manual, setManual] = useState({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [weightInput, setWeightInput] = useState('');
  // Health snapshot for today (steps / sleep / RHR / latest weight from provider).
  // In dev returns deterministic mock; in production returns Manual data (empty
  // until user enters values, or until AppleHealthProvider lands).
  const health = useDailyHealth(new Date(selectedDate));
  // Readiness assessment (green / yellow / red) from sleep + HRV + RHR.
  const coaching = useDailyCoaching(new Date(selectedDate));
  // If readiness suggests a reduction, compute what the downgraded session would look like
  // (we don't apply it automatically — user taps "Snížit intenzitu" CTA on the readiness card).
  const suggestedDowngrade = todaySession ? applyReadinessToSession(todaySession, coaching.assessment) : null;

  if (!profile || !macros) return null;

  const used = sumFoodLog(foodLog);
  const left = remainingMacros(macros, foodLog);

  // Calorie and macro progress rates
  const kcalProgress = macros.kcal > 0 ? (macros.kcal - left.kcal) / macros.kcal : 0;
  const proteinProgress = macros.protein > 0 ? used.protein / macros.protein : 0;
  const carbsProgress = macros.carbs > 0 ? used.carbs / macros.carbs : 0;
  const fatProgress = macros.fat > 0 ? used.fat / macros.fat : 0;

  async function addManual() {
    if (!manual.foodName.trim()) {
      Alert.alert('Chybí název', 'Napiš název jídla.');
      return;
    }
    await addFood(normalizeFoodEstimate({
      foodName: manual.foodName,
      portionGuess: 'Ručně zadané',
      kcal: Number(manual.kcal),
      protein: Number(manual.protein),
      carbs: Number(manual.carbs),
      fat: Number(manual.fat),
      confidence: 'vysoká',
      note: 'Ručně upravená hodnota uživatelem.',
    }), 'manual');
    setManual({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  }

  async function saveDnesniVahu() {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (!val || val < 30 || val > 300) {
      Alert.alert('Chyba', 'Zadej prosím platnou váhu mezi 30 a 300 kg.');
      return;
    }
    await logWeight(val, selectedDate);
    setWeightInput('');
    Alert.alert('Úspěch', `Váha ${val} kg úspěšně uložena k datu ${formatDateLabel(selectedDate)}.`);
  }

  // Get last 7 calendar days leading to selectedDate
  function getLast7DaysWeights() {
    const list = [];
    const baseDate = new Date(selectedDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const dateKey = toDateKey(d);
      
      const daysOfWeek = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
      const label = i === 0 ? 'Dnes' : daysOfWeek[d.getDay()];
      
      list.push({
        label,
        dateKey,
        value: weights[dateKey] || null,
      });
    }
    return list;
  }

  return (
    <Screen>
      <DateHeader />
      <H1>Dnes</H1>
      <Subtitle>{primaryGoalLabel(profile.primaryGoal)} · {profile.diet} · BMI {macros.bmi}</Subtitle>

      {/* Morning briefing — synthesises today's session + readiness + load + macros
          into a single human sentence. Same content will feed the morning push
          notification once expo-notifications lands. */}
      {(() => {
        const briefing = composeMorningBriefing({
          session: todaySession,
          readiness: coaching.assessment,
          trainingLoad: coaching.trainingLoad,
          macros,
          baselineMacros,
        });
        return (
          <FadeInView delay={60}>
            <Card style={[styles.briefingCard, { borderColor: colors.green }]}>
              <View style={styles.briefingHeader}>
                <Text style={styles.briefingEmoji}>{briefing.emoji}</Text>
                <Text style={[styles.briefingHeadline, { color: colors.ink }]}>{briefing.headline}</Text>
              </View>
              {briefing.detail.length > 0 && (
                <Text style={[styles.briefingDetail, { color: colors.muted }]}>{briefing.detail}</Text>
              )}
              <Text style={[styles.briefingRec, { color: colors.green }]}>→ {briefing.recommendation}</Text>
            </Card>
          </FadeInView>
        );
      })()}

      {/* Modern Circular Macro Visual Grid */}
      <FadeInView delay={100}>
        <Card>
          <Label>Zbývá dnes</Label>
          <View style={styles.ringContainer}>
            <MacroRing
              size={160}
              strokeWidth={14}
              progress={kcalProgress}
              color={colors.green}
              backgroundColor={colors.border}
            >
              <Text style={[styles.ringValue, { color: colors.ink }]}>{left.kcal}</Text>
              <Text style={[styles.ringLabel, { color: colors.muted }]}>kcal zbývá</Text>
            </MacroRing>
          </View>
          <Text style={[styles.cielText, { color: colors.muted }]}>
            Denní cíl: {macros.kcal} kcal · Snědeno: {used.kcal} kcal
          </Text>

          <View style={[styles.linearContainer, { borderTopColor: colors.border }]}>
            {/* Protein */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>🍗 Bílkoviny</Text>
                <Text style={[styles.linearValue, { color: colors.muted }]}>{used.protein} / {macros.protein} g</Text>
              </View>
              <View style={[styles.linearBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.linearBarFill, { width: `${Math.min(proteinProgress, 1) * 100}%`, backgroundColor: colors.red }]} />
              </View>
            </View>

            {/* Carbs */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>🍚 Sacharidy</Text>
                <Text style={[styles.linearValue, { color: colors.muted }]}>{used.carbs} / {macros.carbs} g</Text>
              </View>
              <View style={[styles.linearBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.linearBarFill, { width: `${Math.min(carbsProgress, 1) * 100}%`, backgroundColor: colors.orange }]} />
              </View>
            </View>

            {/* Fat */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>🥑 Tuky</Text>
                <Text style={[styles.linearValue, { color: colors.muted }]}>{used.fat} / {macros.fat} g</Text>
              </View>
              <View style={[styles.linearBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.linearBarFill, { width: `${Math.min(fatProgress, 1) * 100}%`, backgroundColor: colors.blue }]} />
              </View>
            </View>
          </View>
        </Card>
      </FadeInView>

      {/* Readiness assessment — green/yellow/red signal + coach recommendation.
          Combines sleep, HRV and RHR from the active HealthDataProvider. */}
      {coaching.assessment && !coaching.isLoading && (
        <FadeInView delay={120}>
          <Card>
            <View style={styles.readinessHeader}>
              <View style={[styles.readinessBadge, { backgroundColor: readinessColor(coaching.assessment.level, colors) }]}>
                <Text style={styles.readinessBadgeText}>{readinessLabel(coaching.assessment.level)}</Text>
              </View>
              <Text style={[styles.readinessTitle, { color: colors.ink }]}>Připravenost</Text>
            </View>
            <Text style={[styles.readinessRec, { color: colors.ink }]}>{coaching.assessment.recommendation}</Text>
            <View style={styles.readinessFactors}>
              {coaching.assessment.factors
                .filter(f => !f.key.endsWith('_missing'))
                .map(f => (
                  <Text
                    key={f.key}
                    style={[
                      styles.readinessFactor,
                      { color: colors.muted, borderColor: colors.border },
                      f.severity === 'red' && { borderColor: colors.red, color: colors.red },
                      f.severity === 'yellow' && { borderColor: colors.orange, color: colors.orange },
                    ]}
                  >
                    {f.message}
                  </Text>
                ))}
            </View>
            {suggestedDowngrade?.adjusted && (
              <View style={[styles.readinessCta, { borderTopColor: colors.border }]}>
                <Text style={[styles.readinessCtaLabel, { color: colors.faint }]}>Doporučená úprava plánu</Text>
                <Text style={[styles.readinessCtaText, { color: colors.ink }]}>
                  {todaySession?.title} → {suggestedDowngrade.session.title} ({suggestedDowngrade.session.durationMinutes} min, {suggestedDowngrade.session.intensity})
                </Text>
                <Button
                  variant="primary"
                  onPress={() => setTodaySession(suggestedDowngrade.session)}
                >
                  Upravit dnešní trénink
                </Button>
              </View>
            )}
          </Card>
        </FadeInView>
      )}

      {/* Training load (ACWR) — 7-day vs 28-day workout volume.
          Skryje se, pokud uživatel nemá za 28 dní žádný trénink. */}
      {coaching.trainingLoad && coaching.trainingLoad.workoutCountChronic > 0 && (
        <FadeInView delay={140}>
          <Card>
            <View style={styles.readinessHeader}>
              <View style={[styles.readinessBadge, { backgroundColor: trainingLoadColor(coaching.trainingLoad.status, colors) }]}>
                <Text style={styles.readinessBadgeText}>{trainingLoadLabel(coaching.trainingLoad.status)}</Text>
              </View>
              <Text style={[styles.readinessTitle, { color: colors.ink }]}>Tréninková zátěž</Text>
            </View>
            <Text style={[styles.readinessRec, { color: colors.ink }]}>{coaching.trainingLoad.message}</Text>
            <Text style={[styles.small, { color: colors.muted }]}>{coaching.trainingLoad.recommendation}</Text>
            <View style={styles.loadStatsRow}>
              <View style={[styles.loadStat, { borderColor: colors.border }]}>
                <Text style={[styles.loadStatLabel, { color: colors.faint }]}>7 dní</Text>
                <Text style={[styles.loadStatValue, { color: colors.ink }]}>{coaching.trainingLoad.acute} TRIMP/d</Text>
                <Text style={[styles.loadStatSub, { color: colors.muted }]}>{coaching.trainingLoad.workoutCountAcute} tréninků</Text>
              </View>
              <View style={[styles.loadStat, { borderColor: colors.border }]}>
                <Text style={[styles.loadStatLabel, { color: colors.faint }]}>28 dní</Text>
                <Text style={[styles.loadStatValue, { color: colors.ink }]}>{coaching.trainingLoad.chronic} TRIMP/d</Text>
                <Text style={[styles.loadStatSub, { color: colors.muted }]}>{coaching.trainingLoad.workoutCountChronic} tréninků</Text>
              </View>
              <View style={[styles.loadStat, { borderColor: colors.border }]}>
                <Text style={[styles.loadStatLabel, { color: colors.faint }]}>ACWR</Text>
                <Text style={[styles.loadStatValue, { color: trainingLoadColor(coaching.trainingLoad.status, colors) }]}>
                  {coaching.trainingLoad.acwr ?? '—'}
                </Text>
                <Text style={[styles.loadStatSub, { color: colors.muted }]}>acute / chronic</Text>
              </View>
            </View>
          </Card>
        </FadeInView>
      )}

      {/* Health snapshot from HealthDataProvider (steps / sleep / RHR).
          In dev shows mock data; production will show Apple Health after EAS prebuild. */}
      <FadeInView delay={150}>
        <Card>
          <Label>Aktivita dnes</Label>
          {health.isLoading ? (
            <Text style={[styles.healthEmpty, { color: colors.muted }]}>Načítám…</Text>
          ) : health.isEmpty ? (
            <View>
              <Text style={[styles.healthEmpty, { color: colors.muted }]}>
                Zatím nemáme žádná data ze zdravotních zdrojů.
              </Text>
              <Text style={[styles.healthEmptySub, { color: colors.faint }]}>
                Apple Health se přidá v příští verzi. Zatím můžeš zapisovat ručně.
              </Text>
            </View>
          ) : (
            <View style={styles.healthRow}>
              <HealthStat label="Kroky" value={health.activity?.steps?.toLocaleString('cs-CZ') ?? '—'} accent={colors.green} />
              <HealthStat label="Aktivní kcal" value={health.activity?.activeEnergyKcal ? String(health.activity.activeEnergyKcal) : '—'} accent={colors.orange} />
              <HealthStat label="Spánek" value={health.sleep?.totalMinutes ? `${Math.floor(health.sleep.totalMinutes / 60)}h ${health.sleep.totalMinutes % 60}m` : '—'} accent={colors.blue} />
              <HealthStat label="Klidový tep" value={health.restingHeartRate?.bpm ? `${health.restingHeartRate.bpm} bpm` : '—'} accent={colors.red} />
            </View>
          )}
        </Card>
      </FadeInView>

      {/* Sleek Weight Tracking Card */}
      <FadeInView delay={200}>
        <Card>
          <Label>📈 Sledování váhy</Label>
          <View style={styles.weightInputRow}>
            <View style={styles.weightField}>
              <Field
                keyboardType="numeric"
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="Zadej váhu v kg..."
              />
            </View>
            <Button style={styles.weightBtn} onPress={saveDnesniVahu}>
              Uložit
            </Button>
          </View>
          
          <Text style={[styles.trendTitle, { color: colors.ink }]}>Posledních 7 dní:</Text>
          <View style={styles.trendRow}>
            {getLast7DaysWeights().map((w, idx) => (
              <View
                key={idx}
                style={[
                  styles.trendItem,
                  {
                    backgroundColor: colors.isDark ? '#151d1a' : '#fbfbf8',
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.trendItemDate, { color: colors.faint }]}>{w.label}</Text>
                <Text style={[styles.trendItemVal, { color: colors.ink }]}>
                  {w.value ? `${w.value}` : '—'}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </FadeInView>

      {baselineMacros && dailyAdjustment && (
        <FadeInView delay={300}>
          <Card>
            <Label>Dnešní úprava podle tréninku</Label>
            <Text style={[styles.adjustmentTitle, { color: colors.ink }]}>{todaySession?.title || 'Volný den'}</Text>
            <Text style={[styles.adjustmentNote, { color: colors.muted }]}>{dailyAdjustment.note}</Text>
            <View style={styles.adjustmentGrid}>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>Kalorie {formatDelta(dailyAdjustment.kcalDelta)} kcal</Text>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>Sacharidy {formatDelta(dailyAdjustment.carbsDelta)} g</Text>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>Tuky {formatDelta(dailyAdjustment.fatDelta)} g</Text>
            </View>
            <Text style={[styles.small, { color: colors.muted }]}>Základní doporučení {baselineMacros.kcal} kcal → dnes {macros.kcal} kcal</Text>
            <View style={styles.rowWrap}>
              {todayOptions(selectedDate, profile.trainingGoal).map(option => (
                <Text
                  key={option.kind}
                  style={[
                    styles.trainingChip,
                    { color: colors.muted, borderColor: colors.border },
                    todaySession?.kind === option.kind && [
                      styles.trainingChipActive,
                      { backgroundColor: colors.green, borderColor: colors.green },
                    ],
                  ]}
                  onPress={() => setTodaySession(option)}
                >
                  {option.label}
                </Text>
              ))}
            </View>
          </Card>
        </FadeInView>
      )}

      <FadeInView delay={400}>
        <Card>
          <Label>Rychlé ruční zapsání</Label>
          <Field value={manual.foodName} onChangeText={foodName => setManual(v => ({ ...v, foodName }))} placeholder="Název jídla" />
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={manual.kcal} onChangeText={kcal => setManual(v => ({ ...v, kcal }))} placeholder="kcal" />
            <Field keyboardType="number-pad" value={manual.protein} onChangeText={protein => setManual(v => ({ ...v, protein }))} placeholder="B" />
          </View>
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={manual.carbs} onChangeText={carbs => setManual(v => ({ ...v, carbs }))} placeholder="S" />
            <Field keyboardType="number-pad" value={manual.fat} onChangeText={fat => setManual(v => ({ ...v, fat }))} placeholder="T" />
          </View>
          <Button onPress={addManual}>Přidat jídlo</Button>
        </Card>
      </FadeInView>

      <FadeInView delay={500}>
        <Card>
          <View style={styles.headerRow}>
            <Label>Zapsaná jídla</Label>
            {foodLog.length > 0 && <Text style={styles.link} onPress={clearFood}>Vymazat den</Text>}
          </View>
          {foodLog.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>Dnes jsi ještě nic nezapsal/a</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Nech si od AI vygenerovat ideální plán jídelníčku na míru, nebo si vyfoť hotové jídlo!</Text>
              <View style={styles.emptyActions}>
                <Button style={styles.emptyBtn} variant="primary" onPress={() => navigation.navigate('Jídelníček')}>
                  🗓️ Plán jídelníčku
                </Button>
                <Button style={styles.emptyBtn} variant="secondary" onPress={() => navigation.navigate('Foto')}>
                  📸 Vyfotit jídlo
                </Button>
              </View>
            </View>
          ) : foodLog.map(item => (
            <View key={item.id} style={[styles.foodRow, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.foodName, { color: colors.ink }]}>{item.foodName}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>{item.kcal} kcal · B {item.protein}g · S {item.carbs}g · T {item.fat}g</Text>
              </View>
              <Text style={styles.remove} onPress={() => removeFood(item.id)}>Smazat</Text>
            </View>
          ))}
        </Card>
      </FadeInView>
    </Screen>
  );
}

/** Compact stat tile used inside the "Aktivita dnes" card. */
function HealthStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.healthStat, { borderColor: colors.border }]}>
      <Text style={[styles.healthStatLabel, { color: colors.faint }]}>{label}</Text>
      <Text style={[styles.healthStatValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function readinessLabel(level: ReadinessLevel): string {
  return level === 'green' ? 'Připraven' : level === 'yellow' ? 'Mírně' : 'Regeneruj';
}

function readinessColor(level: ReadinessLevel, palette: { green: string; orange: string; red: string }): string {
  return level === 'green' ? palette.green : level === 'yellow' ? palette.orange : palette.red;
}

function trainingLoadLabel(status: LoadStatus): string {
  switch (status) {
    case 'optimal':      return 'Optimum';
    case 'detraining':   return 'Klesá';
    case 'overreaching': return 'Hodně';
    case 'high_risk':    return 'Riziko';
  }
}

function trainingLoadColor(status: LoadStatus, palette: { green: string; orange: string; red: string; blue: string }): string {
  switch (status) {
    case 'optimal':      return palette.green;
    case 'detraining':   return palette.blue;
    case 'overreaching': return palette.orange;
    case 'high_risk':    return palette.red;
  }
}

function todayOptions(date: string, trainingGoal: TrainingGoalKind): Array<TrainingSession & { label: string }> {
  const base = [
    { date, kind: 'rest' as const, title: 'Volno', durationMinutes: 0, intensity: 'rest' as const, label: 'Volno' },
  ];

  const running = ['run_5k', 'run_10k', 'half_marathon', 'marathon'].includes(trainingGoal);
  if (running) {
    return [
      ...base,
      { date, kind: 'easy_run' as const, title: 'Lehký běh', durationMinutes: 40, intensity: 'easy' as const, label: 'Lehký běh' },
      { date, kind: 'intervals' as const, title: 'Běžecké intervaly', durationMinutes: 45, intensity: 'hard' as const, label: 'Intervaly' },
      { date, kind: 'long_run' as const, title: 'Dlouhý běh (Long run)', durationMinutes: 90, intensity: 'moderate' as const, label: 'Long run' },
    ];
  }
  if (trainingGoal === 'strength_basics') {
    return [
      ...base,
      { date, kind: 'strength' as const, title: 'Silový trénink', durationMinutes: 60, intensity: 'moderate' as const, label: 'Síla' },
      { date, kind: 'mobility' as const, title: 'Mobilizační cvičení', durationMinutes: 20, intensity: 'easy' as const, label: 'Mobilita' },
      { date, kind: 'cross_training' as const, title: 'Kondiční workout', durationMinutes: 45, intensity: 'hard' as const, label: 'Kondice' },
    ];
  }
  if (trainingGoal === 'hyrox' || trainingGoal === 'ocr') {
    return [
      ...base,
      { date, kind: 'functional' as const, title: 'Funkční trénink', durationMinutes: 50, intensity: 'hard' as const, label: 'Funkční' },
      { date, kind: 'easy_run' as const, title: 'Vytrvalostní běh', durationMinutes: 60, intensity: 'moderate' as const, label: 'Běh' },
      { date, kind: 'strength' as const, title: 'Silový základ', durationMinutes: 45, intensity: 'moderate' as const, label: 'Silová síla' },
    ];
  }
  return [
    ...base,
    { date, kind: 'strength' as const, title: 'Kondiční trénink', durationMinutes: 40, intensity: 'moderate' as const, label: 'Kondice' },
    { date, kind: 'easy_run' as const, title: 'Lehký běh', durationMinutes: 30, intensity: 'easy' as const, label: 'Lehký běh' },
    { date, kind: 'mobility' as const, title: 'Strečink a mobilita', durationMinutes: 15, intensity: 'easy' as const, label: 'Strečink' },
  ];
}

function formatDelta(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

const styles = StyleSheet.create({
  ringContainer: { alignItems: 'center', marginVertical: 20 },
  ringValue: { fontSize: 32, fontWeight: '900' },
  ringLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  cielText: { fontSize: 13, textAlign: 'center', fontWeight: '800', marginBottom: 16 },
  linearContainer: { gap: 14, borderTopWidth: 1, paddingTop: 16 },
  linearRow: { gap: 6 },
  linearTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linearLabel: { fontSize: 14, fontWeight: '800' },
  linearValue: { fontSize: 13, fontWeight: '800' },
  linearBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  linearBarFill: { height: '100%', borderRadius: 4 },
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adjustmentTitle: { fontSize: 18, fontWeight: '900' },
  adjustmentNote: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  adjustmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, fontWeight: '800', fontSize: 12 },
  trainingChip: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontWeight: '800', overflow: 'hidden' },
  trainingChipActive: { color: '#fff' },
  link: { color: colors.red, fontWeight: '800' },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1 },
  foodName: { fontWeight: '800', fontSize: 15 },
  remove: { color: colors.red, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  emptyContainer: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  emptyIcon: { fontSize: 44, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 12 },
  emptyBtn: { minWidth: 140 },
  weightInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  weightField: { flex: 1 },
  weightBtn: { minHeight: 48 },
  trendTitle: { fontSize: 14, fontWeight: '800', marginTop: 12 },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 4 },
  trendItem: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 2 },
  trendItemDate: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  trendItemVal: { fontSize: 13, fontWeight: '900', marginTop: 4 },
  healthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  healthStat: { flex: 1, minWidth: '47%', borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  healthStatLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  healthStatValue: { fontSize: 18, fontWeight: '900' },
  healthEmpty: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  healthEmptySub: { fontSize: 12, marginTop: 4, lineHeight: 16, fontStyle: 'italic' },
  readinessHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  readinessBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, minWidth: 90, alignItems: 'center' },
  readinessBadgeText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  readinessTitle: { fontSize: 16, fontWeight: '800' },
  readinessRec: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginBottom: 12 },
  readinessFactors: { gap: 6 },
  readinessFactor: { fontSize: 12, lineHeight: 16, fontWeight: '600', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  readinessCta: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  readinessCtaLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  readinessCtaText: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 4 },
  loadStatsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  loadStat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10 },
  loadStatLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  loadStatValue: { fontSize: 15, fontWeight: '900' },
  loadStatSub: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  briefingCard: { borderWidth: 2, gap: 8 },
  briefingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  briefingEmoji: { fontSize: 28 },
  briefingHeadline: { flex: 1, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  briefingDetail: { fontSize: 13, lineHeight: 18 },
  briefingRec: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
});
