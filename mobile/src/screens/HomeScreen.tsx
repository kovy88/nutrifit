import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle, FadeInView } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useTrenr } from '../context/TrenrContext';
import { normalizeFoodEstimate, remainingMacros, sumFoodLog, toDateKey, formatDateLabel } from '../utils/nutrition';
import type { TrainingSession, TrainingGoalKind } from '../types';
import { DateHeader } from '../components/DateHeader';
import { useNavigation } from '@react-navigation/native';
import { MacroRing } from '../components/MacroRing';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import type { Translate, TranslationKey } from '../lib/i18n';
import { useDailyHealth } from '../hooks/useDailyHealth';
import { useDailyCoachRecommendation } from '../hooks/useDailyCoachRecommendation';
import { useTrainingCompletion } from '../hooks/useTrainingCompletion';
import type { ReadinessLevel } from '../lib/coaching/readiness';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import type { LoadStatus } from '../lib/coaching/trainingLoad';
import { composeMorningBriefing } from '../lib/coaching/composeMorningBriefing';
import type { StrainBand } from '../lib/coaching/strainScore';

export function HomeScreen() {
  const {
    profile,
    currentMacros: macros,
    baselineMacros,
    currentSession: todaySession,
    dailyAdjustment,
    setTodaySession,
    currentFoodLog: foodLog,
    addFood,
    removeFood,
    clearFood,
    selectedDate,
    weights,
    logWeight,
  } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { completion, mark: markTraining } = useTrainingCompletion();
  const [manual, setManual] = useState({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [weightInput, setWeightInput] = useState('');
  // Health snapshot for today (steps / sleep / RHR / latest weight from provider).
  // In dev returns deterministic mock; in production returns Manual data (empty
  // until user enters values, or until AppleHealthProvider lands).
  const health = useDailyHealth(new Date(selectedDate));
  // Daily coach recommendation (readiness score 0–100 + coach note + focus) and the
  // underlying coaching state (assessment / strain / load / debts) in one fetch.
  const { recommendation: rec, coaching } = useDailyCoachRecommendation(new Date(selectedDate));
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
      Alert.alert(t('home.alertMissingName'), t('home.alertMissingNameMsg'));
      return;
    }
    await addFood(normalizeFoodEstimate({
      foodName: manual.foodName,
      portionGuess: t('home.manualPortion'),
      kcal: Number(manual.kcal),
      protein: Number(manual.protein),
      carbs: Number(manual.carbs),
      fat: Number(manual.fat),
      confidence: 'vysoká',
      note: t('home.manualNote'),
    }), 'manual');
    setManual({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  }

  async function saveDnesniVahu() {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (!val || val < 30 || val > 300) {
      Alert.alert(t('common.error'), t('home.alertWeightInvalid'));
      return;
    }
    await logWeight(val, selectedDate);
    setWeightInput('');
    Alert.alert(t('home.alertSuccess'), t('home.alertWeightSaved', { w: val, date: formatDateLabel(selectedDate) }));
  }

  async function markTodayDone() {
    await markTraining('completed');
    Alert.alert(t('today.completedTitle'), t('today.completedMsg'));
  }

  // Get last 7 calendar days leading to selectedDate
  function getLast7DaysWeights() {
    const list = [];
    const baseDate = new Date(selectedDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const dateKey = toDateKey(d);

      const label = i === 0 ? t('common.today') : t('home.weekdayShort', { dow: d.getDay() });

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
      <H1>{t('home.title')}</H1>
      <Subtitle>{t(`goal.${profile.primaryGoal}` as TranslationKey)} · {t(`diet.${profile.diet}` as TranslationKey)} · BMI {macros.bmi}</Subtitle>

      {/* Daily coach hero — the single "what should I do today?" answer:
          readiness score (0–100) + focus + coach note + what-not-to-do + actions. */}
      {rec && (
        <FadeInView delay={60}>
          <Card style={[styles.heroCard, { borderColor: bandColor(rec.readiness.band, colors) }]}>
            <View style={styles.heroTop}>
              <MacroRing
                size={96}
                strokeWidth={9}
                progress={rec.readiness.score / 100}
                color={bandColor(rec.readiness.band, colors)}
                backgroundColor={colors.border}
              >
                <Text style={[styles.heroScore, { color: colors.ink }]}>{rec.readiness.score}</Text>
                <Text style={[styles.heroScoreLabel, { color: colors.muted }]}>{bandLabel(rec.readiness.band, t)}</Text>
              </MacroRing>
              <View style={styles.heroHeadlineWrap}>
                <Text style={styles.heroEmoji}>{rec.emoji}</Text>
                <Text style={[styles.heroHeadline, { color: colors.ink }]}>{rec.headline}</Text>
                <Text style={[styles.heroFocus, { color: colors.green }]}>{t('today.focus')}: {rec.training.focus}</Text>
              </View>
            </View>
            <Text style={[styles.heroNote, { color: colors.muted }]}>{rec.coachNote}</Text>
            {rec.training.whatNotToDo && (
              <Text style={[styles.heroNotToDo, { color: colors.orange }]}>⚠ {rec.training.whatNotToDo}</Text>
            )}
            {rec.warnings.map((w, i) => (
              <Text key={`hw-${i}`} style={[styles.heroWarning, { color: colors.red }]}>• {w}</Text>
            ))}
            <View style={styles.heroActions}>
              <Button variant="secondary" style={styles.heroActionBtn} onPress={() => navigation.navigate('Jídelníček')}>{t('today.meals')}</Button>
              {rec.suggestedActions.includes('mark_done') && (
                <Button
                  variant={completion?.status === 'completed' ? 'secondary' : 'primary'}
                  style={styles.heroActionBtn}
                  onPress={markTodayDone}
                  disabled={completion?.status === 'completed'}
                >
                  {completion?.status === 'completed' ? t('today.completed') : t('today.markDone')}
                </Button>
              )}
              <Button variant="secondary" style={styles.heroActionBtn} onPress={() => navigation.navigate('Coach')}>{t('today.askCoach')}</Button>
            </View>
            <Text style={[styles.heroReadinessNote, { color: colors.faint }]}>{t('today.readinessNote')}</Text>
          </Card>
        </FadeInView>
      )}

      {/* Modern Circular Macro Visual Grid */}
      <FadeInView delay={100}>
        <Card>
          <Label>{t('home.remainingToday')}</Label>
          <View style={styles.ringContainer}>
            <MacroRing
              size={160}
              strokeWidth={14}
              progress={kcalProgress}
              color={colors.green}
              backgroundColor={colors.border}
            >
              <Text style={[styles.ringValue, { color: colors.ink }]}>{left.kcal}</Text>
              <Text style={[styles.ringLabel, { color: colors.muted }]}>{t('home.kcalRemaining')}</Text>
            </MacroRing>
          </View>
          <Text style={[styles.cielText, { color: colors.muted }]}>
            {t('home.dailyTarget', { target: macros.kcal, used: used.kcal })}
          </Text>

          <View style={[styles.linearContainer, { borderTopColor: colors.border }]}>
            {/* Protein */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>{t('home.protein')}</Text>
                <Text style={[styles.linearValue, { color: colors.muted }]}>{used.protein} / {macros.protein} g</Text>
              </View>
              <View style={[styles.linearBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.linearBarFill, { width: `${Math.min(proteinProgress, 1) * 100}%`, backgroundColor: colors.red }]} />
              </View>
            </View>

            {/* Carbs */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>{t('home.carbs')}</Text>
                <Text style={[styles.linearValue, { color: colors.muted }]}>{used.carbs} / {macros.carbs} g</Text>
              </View>
              <View style={[styles.linearBarBg, { backgroundColor: colors.border }]}>
                <View style={[styles.linearBarFill, { width: `${Math.min(carbsProgress, 1) * 100}%`, backgroundColor: colors.orange }]} />
              </View>
            </View>

            {/* Fat */}
            <View style={styles.linearRow}>
              <View style={styles.linearTextRow}>
                <Text style={[styles.linearLabel, { color: colors.ink }]}>{t('home.fat')}</Text>
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
              <View style={[styles.readinessBadge, { backgroundColor: readinessColor(coaching.assessment.level, colors, coaching.assessment.dataStatus) }]}>
                <Text style={styles.readinessBadgeText}>{readinessLabel(coaching.assessment.level, t, coaching.assessment.dataStatus)}</Text>
              </View>
              <Text style={[styles.readinessTitle, { color: colors.ink }]}>{t('home.readiness')}</Text>
            </View>
            <Text style={[styles.readinessRec, { color: colors.ink }]}>{coaching.assessment.recommendation}</Text>
            <View style={styles.readinessFactors}>
              {coaching.assessment.factors
                .filter(f => !f.key.endsWith('_missing') || coaching.assessment?.dataStatus === 'missing')
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
              {/* Sleep + recovery debt — surface only when meaningful */}
              {coaching.sleepDebt && coaching.sleepDebt.totalDebtHours >= 2 && (
                <Text
                  style={[
                    styles.readinessFactor,
                    {
                      color: coaching.sleepDebt.totalDebtHours >= 10 ? colors.red : colors.orange,
                      borderColor: coaching.sleepDebt.totalDebtHours >= 10 ? colors.red : colors.orange,
                    },
                  ]}
                >
                  {t('home.sleepDebtBadge', { h: coaching.sleepDebt.totalDebtHours })}
                </Text>
              )}
              {coaching.recoveryDebt && coaching.recoveryDebt.currentDebt >= 2 && (
                <Text
                  style={[
                    styles.readinessFactor,
                    {
                      color: coaching.recoveryDebt.currentDebt >= 6 ? colors.red : colors.orange,
                      borderColor: coaching.recoveryDebt.currentDebt >= 6 ? colors.red : colors.orange,
                    },
                  ]}
                >
                  {t('home.recoveryDebtBadge', { n: coaching.recoveryDebt.currentDebt })}
                </Text>
              )}
            </View>
            {suggestedDowngrade?.adjusted && (
              <View style={[styles.readinessCta, { borderTopColor: colors.border }]}>
                <Text style={[styles.readinessCtaLabel, { color: colors.faint }]}>{t('readiness.planAdjust')}</Text>
                <Text style={[styles.readinessCtaText, { color: colors.ink }]}>
                  {todaySession?.title} → {suggestedDowngrade.session.title} ({suggestedDowngrade.session.durationMinutes} min, {suggestedDowngrade.session.intensity})
                </Text>
                <Button
                  variant="primary"
                  onPress={() => setTodaySession(suggestedDowngrade.session)}
                >
                  {t('readiness.adjustToday')}
                </Button>
              </View>
            )}
            <Text style={[styles.heroReadinessNote, { color: colors.faint }]}>{t('readiness.disclaimer')}</Text>
          </Card>
        </FadeInView>
      )}

      {/* Strain (0–21) a training load (ACWR) se přesunuly na záložku Pokrok,
          aby Today drželo „jeden hero + pár karet". Hero coach note je dál
          zohledňuje přes composeMorningBriefing. */}

      {/* Health snapshot from HealthDataProvider (steps / sleep / RHR).
          In dev shows mock data; production will show Apple Health after EAS prebuild. */}
      <FadeInView delay={150}>
        <Card>
          <Label>{t('home.todayActivity')}</Label>
          {health.isLoading ? (
            <Text style={[styles.healthEmpty, { color: colors.muted }]}>{t('common.loading')}</Text>
          ) : health.isEmpty ? (
            <View>
              <Text style={[styles.healthEmpty, { color: colors.muted }]}>
                {t('home.noHealthData')}
              </Text>
              <Text style={[styles.healthEmptySub, { color: colors.faint }]}>
                {t('home.appleHealthSoon')}
              </Text>
            </View>
          ) : (
            <View style={styles.healthRow}>
              <HealthStat label={t('home.steps')} value={health.activity?.steps?.toLocaleString('cs-CZ') ?? '—'} accent={colors.green} />
              <HealthStat label={t('home.activeKcal')} value={health.activity?.activeEnergyKcal ? String(health.activity.activeEnergyKcal) : '—'} accent={colors.orange} />
              <HealthStat label={t('home.sleep')} value={health.sleep?.totalMinutes ? `${Math.floor(health.sleep.totalMinutes / 60)}h ${health.sleep.totalMinutes % 60}m` : '—'} accent={colors.blue} />
              <HealthStat label={t('home.restingHr')} value={health.restingHeartRate?.bpm ? `${health.restingHeartRate.bpm} bpm` : '—'} accent={colors.red} />
            </View>
          )}
        </Card>
      </FadeInView>

      {baselineMacros && dailyAdjustment && (
        <FadeInView delay={200}>
          <Card>
            <Label>{t('home.adjustmentTitle')}</Label>
            <Text style={[styles.adjustmentTitle, { color: colors.ink }]}>{todaySession?.title || t('home.restDay')}</Text>
            {completion && (
              <Text style={[styles.small, { color: completion.status === 'completed' ? colors.green : colors.orange }]}>
                {completion.status === 'completed' ? t('today.completed') : t('today.notCompleted')}
              </Text>
            )}
            <Text style={[styles.adjustmentNote, { color: colors.muted }]}>{dailyAdjustment.note}</Text>
            <View style={styles.adjustmentGrid}>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>{t('home.adjCalories')} {formatDelta(dailyAdjustment.kcalDelta)} kcal</Text>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>{t('home.adjCarbs')} {formatDelta(dailyAdjustment.carbsDelta)} g</Text>
              <Text style={[styles.badge, { color: colors.green, borderColor: colors.border }]}>{t('home.adjFat')} {formatDelta(dailyAdjustment.fatDelta)} g</Text>
            </View>
            <Text style={[styles.small, { color: colors.muted }]}>{t('home.baselineRec', { base: baselineMacros.kcal, today: macros.kcal })}</Text>
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

function readinessLabel(level: ReadinessLevel, t: Translate, dataStatus?: 'missing' | 'partial' | 'complete'): string {
  if (dataStatus === 'missing') return t('readiness.noData');
  return level === 'green' ? t('readiness.ready') : level === 'yellow' ? t('readiness.mild') : t('readiness.regenerate');
}

function readinessColor(
  level: ReadinessLevel,
  palette: { green: string; orange: string; red: string },
  dataStatus?: 'missing' | 'partial' | 'complete',
): string {
  if (dataStatus === 'missing') return palette.orange;
  return level === 'green' ? palette.green : level === 'yellow' ? palette.orange : palette.red;
}

function bandColor(band: 'low' | 'medium' | 'high', palette: { accent: string; orange: string; red: string }): string {
  return band === 'high' ? palette.accent : band === 'medium' ? palette.orange : palette.red;
}

function bandLabel(band: 'low' | 'medium' | 'high', t: Translate): string {
  return band === 'high' ? t('readiness.high') : band === 'medium' ? t('readiness.medium') : t('readiness.low');
}

function trainingLoadLabel(status: LoadStatus, t: Translate): string {
  switch (status) {
    case 'optimal':      return t('load.optimal');
    case 'detraining':   return t('load.detraining');
    case 'overreaching': return t('load.overreaching');
    case 'high_risk':    return t('load.high_risk');
  }
}

function strainColor(band: StrainBand, palette: { green: string; orange: string; red: string; blue: string }): string {
  switch (band) {
    case 'recovery': return palette.blue;
    case 'light':    return palette.green;
    case 'moderate': return palette.green;
    case 'high':     return palette.orange;
    case 'all_out':  return palette.red;
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
  ringValue: { fontSize: 40, fontFamily: 'Archivo_900Black', letterSpacing: -1.5 },
  ringLabel: { fontSize: 12, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
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
  heroCard: { borderWidth: 2, gap: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroHeadlineWrap: { flex: 1, gap: 2 },
  heroEmoji: { fontSize: 22 },
  heroHeadline: { fontSize: 18, fontFamily: 'Archivo_800ExtraBold', lineHeight: 22, letterSpacing: -0.3 },
  heroFocus: { fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', marginTop: 3 },
  heroNote: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  heroNotToDo: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  heroWarning: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  heroActionBtn: { flex: 1 },
  heroScore: { fontSize: 44, fontFamily: 'Archivo_900Black', lineHeight: 46, letterSpacing: -2 },
  heroScoreLabel: { fontSize: 10.5, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 },
  heroReadinessNote: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  briefingCard: { borderWidth: 2, gap: 8 },
  briefingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  briefingEmoji: { fontSize: 28 },
  briefingHeadline: { flex: 1, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  briefingDetail: { fontSize: 13, lineHeight: 18 },
  briefingRec: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  strainScoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strainScoreValue: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  strainScoreMax: { fontSize: 10, fontWeight: '700' },
});
