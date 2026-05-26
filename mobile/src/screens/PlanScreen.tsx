import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { generateMealPlan } from '../services/api';

export function PlanScreen() {
  const { profile, macros, meals, setMeals, setProfile } = useNutriFit();
  const [loading, setLoading] = useState(false);
  if (!profile || !macros) return null;
  const activeProfile = profile;
  const activeMacros = macros;

  async function generate() {
    setLoading(true);
    try {
      const next = await generateMealPlan(activeProfile, activeMacros);
      await setMeals(next);
    } catch (err) {
      Alert.alert('Generování selhalo', err instanceof Error ? err.message : 'Zkus to prosím znovu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <H1>Jídelníček</H1>
      <Subtitle>Plán je uložený offline pro čtení. AI výstupy ber jako orientační a uprav podle reality.</Subtitle>

      <Card>
        <Label>Preference pro další generaci</Label>
        <Field value={profile.likes} onChangeText={likes => setProfile({ ...profile, likes })} placeholder="Co rád/a jíš?" multiline />
        <Field value={profile.dislikes} onChangeText={dislikes => setProfile({ ...profile, dislikes })} placeholder="Alergie, omezení, co vynechat" multiline />
        <View style={styles.row}>
          <Button variant="secondary" onPress={() => setProfile({ ...profile, mealCount: Math.max(2, profile.mealCount - 1) })}>− jídlo</Button>
          <Button variant="secondary" onPress={() => setProfile({ ...profile, mealCount: Math.min(6, profile.mealCount + 1) })}>+ jídlo</Button>
        </View>
        <Text style={styles.small}>Počet jídel: {profile.mealCount}</Text>
        <Button disabled={loading} onPress={generate}>{loading ? 'Generuju…' : 'Vygenerovat plán'}</Button>
      </Card>

      {loading && <ActivityIndicator color={colors.green} />}

      <Card>
        <Label>Poslední plán</Label>
        {meals.length === 0 ? (
          <Text style={styles.empty}>Zatím nemáš uložený plán.</Text>
        ) : meals.map((meal, index) => (
          <View key={`${meal.mealType}-${index}`} style={styles.meal}>
            <Text style={styles.mealType}>{meal.mealType}</Text>
            <Text style={styles.mealName}>{meal.name}</Text>
            <Text style={styles.small}>{meal.kcal} kcal · B {meal.protein}g · S {meal.carbs}g · T {meal.fat}g · {meal.prepTime} min</Text>
            <Text style={styles.ingredients}>{meal.ingredients.slice(0, 6).join(', ')}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.faint },
  meal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 4 },
  mealType: { color: colors.green, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  mealName: { color: colors.ink, fontWeight: '900', fontSize: 17 },
  ingredients: { color: colors.muted, lineHeight: 20 },
});
