import { Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';

export function HistoryScreen() {
  const { meals } = useNutriFit();
  const total = meals.reduce((sum, meal) => sum + meal.kcal, 0);

  function sharePlan() {
    const body = meals.map(meal => `${meal.mealType}: ${meal.name} (${meal.kcal} kcal)`).join('\n');
    Share.share({ message: `Můj jídelníček z NutriFit\n\n${body}\n\nCelkem: ${total} kcal` });
  }

  return (
    <Screen>
      <H1>Historie</H1>
      <Subtitle>V mobilní v1 je dostupný poslední offline plán. Po přihlášení lze doplnit cloudovou historii ze Supabase.</Subtitle>
      <Card>
        <Label>Offline plán</Label>
        {meals.length === 0 ? (
          <Text style={styles.empty}>Zatím není uložený žádný jídelníček.</Text>
        ) : (
          <>
            <Text style={styles.total}>{total} kcal</Text>
            {meals.map((meal, index) => (
              <View key={`${meal.name}-${index}`} style={styles.row}>
                <Text style={styles.name}>{meal.mealType}</Text>
                <Text style={styles.detail}>{meal.name}</Text>
              </View>
            ))}
            <Button variant="secondary" onPress={sharePlan}>Sdílet plán</Button>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.faint },
  total: { color: colors.green, fontSize: 28, fontWeight: '900' },
  row: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
  name: { color: colors.faint, fontWeight: '900', fontSize: 12 },
  detail: { color: colors.ink, fontWeight: '800' },
});
