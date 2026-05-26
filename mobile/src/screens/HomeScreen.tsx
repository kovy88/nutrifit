import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { normalizeFoodEstimate, remainingMacros, sumFoodLog } from '../utils/nutrition';

export function HomeScreen() {
  const { profile, macros, foodLog, addFood, removeFood, clearFood } = useNutriFit();
  const [manual, setManual] = useState({ foodName: '', kcal: '', protein: '', carbs: '', fat: '' });
  if (!profile || !macros) return null;

  const used = sumFoodLog(foodLog);
  const left = remainingMacros(macros, foodLog);

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

  return (
    <Screen>
      <H1>Dnes</H1>
      <Subtitle>{profile.goal} · {profile.diet} · BMI {macros.bmi}</Subtitle>
      <Card>
        <Label>Zbývá dnes</Label>
        <View style={styles.macroGrid}>
          <Macro label="Kalorie" value={left.kcal} unit="kcal" tone={colors.green} />
          <Macro label="Bílkoviny" value={left.protein} unit="g" tone={colors.red} />
          <Macro label="Sacharidy" value={left.carbs} unit="g" tone={colors.orange} />
          <Macro label="Tuky" value={left.fat} unit="g" tone={colors.blue} />
        </View>
        <Text style={styles.small}>Cíl: {macros.kcal} kcal · B {macros.protein}g · S {macros.carbs}g · T {macros.fat}g</Text>
        <Text style={styles.small}>Zapsáno: {used.kcal} kcal</Text>
      </Card>

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

      <Card>
        <View style={styles.headerRow}>
          <Label>Zapsaná jídla</Label>
          {foodLog.length > 0 && <Text style={styles.link} onPress={clearFood}>Vymazat den</Text>}
        </View>
        {foodLog.length === 0 ? (
          <Text style={styles.empty}>Zatím tu nic není. Přidej jídlo ručně nebo z fotky.</Text>
        ) : foodLog.map(item => (
          <View key={item.id} style={styles.foodRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.foodName}>{item.foodName}</Text>
              <Text style={styles.small}>{item.kcal} kcal · B {item.protein}g · S {item.carbs}g · T {item.fat}g</Text>
            </View>
            <Text style={styles.remove} onPress={() => removeFood(item.id)}>Smazat</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Macro({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={[styles.macroValue, { color: tone }]}>{value}</Text>
      <Text style={styles.small}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  macro: { width: '47%', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: '#fbfbf8' },
  macroLabel: { color: colors.faint, fontSize: 12, fontWeight: '800' },
  macroValue: { fontSize: 28, fontWeight: '900' },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.red, fontWeight: '800' },
  empty: { color: colors.faint, lineHeight: 20 },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  foodName: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  remove: { color: colors.red, fontWeight: '800' },
});
