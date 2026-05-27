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

export function HomeScreen() {
  const { profile, macros, baselineMacros, todaySession, dailyAdjustment, setTodaySession, foodLog, addFood, removeFood, clearFood, selectedDate, weights, logWeight } = useNutriFit();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [manual, setManual] = useState({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [weightInput, setWeightInput] = useState('');

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
});
