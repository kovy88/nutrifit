import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Pill, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import type { DietStyle, Gender, Goal, UserProfile } from '../types';
import { DEFAULT_PROFILE, validateProfile } from '../utils/nutrition';

export function OnboardingScreen() {
  const { setProfile } = useNutriFit();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(DEFAULT_PROFILE);
  const progress = useMemo(() => `${step + 1}/3`, [step]);

  function setField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function finish() {
    const errors = validateProfile(draft);
    if (errors.length) {
      Alert.alert('Ještě drobnost', errors.join('\n'));
      return;
    }
    await setProfile(draft);
  }

  return (
    <Screen>
      <Text style={styles.progress}>{progress}</Text>
      <H1>NutriFit nastavíme za minutu.</H1>
      <Subtitle>Mobilní verze počítá denní cíle, plánuje jídelníček a dovolí upravit AI odhady před uložením.</Subtitle>

      {step === 0 && (
        <Card>
          <Label>Základ</Label>
          <View style={styles.row}>
            {(['muz', 'zena'] as Gender[]).map(g => (
              <Pill key={g} active={draft.gender === g} onPress={() => setField('gender', g)}>{g === 'muz' ? 'Muž' : 'Žena'}</Pill>
            ))}
          </View>
          <View style={styles.grid}>
            <Field keyboardType="number-pad" value={String(draft.age)} onChangeText={v => setField('age', Number(v) || 0)} placeholder="Věk" />
            <Field keyboardType="number-pad" value={String(draft.height)} onChangeText={v => setField('height', Number(v) || 0)} placeholder="Výška cm" />
            <Field keyboardType="number-pad" value={String(draft.weight)} onChangeText={v => setField('weight', Number(v) || 0)} placeholder="Váha kg" />
          </View>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Label>Cíl a aktivita</Label>
          <View style={styles.column}>
            {(['hubnutí', 'udržení', 'nabírání'] as Goal[]).map(goal => (
              <Pill key={goal} active={draft.goal === goal} onPress={() => setField('goal', goal)}>{goal}</Pill>
            ))}
          </View>
          <Label>Trénink týdně</Label>
          <View style={styles.rowWrap}>
            {[
              ['0×', 1.2],
              ['1–3×', 1.375],
              ['3–5×', 1.55],
              ['6×+', 1.725],
            ].map(([label, factor]) => (
              <Pill key={String(label)} active={draft.activityFactor === factor} onPress={() => setField('activityFactor', Number(factor))}>{label}</Pill>
            ))}
          </View>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Label>Preference</Label>
          <Field value={draft.likes} onChangeText={v => setField('likes', v)} placeholder="Co rád/a jíš?" multiline />
          <Field value={draft.dislikes} onChangeText={v => setField('dislikes', v)} placeholder="Alergie, potraviny mimo…" multiline />
          <View style={styles.rowWrap}>
            {(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový'] as DietStyle[]).map(diet => (
              <Pill key={diet} active={draft.diet === diet} onPress={() => setField('diet', diet)}>{diet}</Pill>
            ))}
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        {step > 0 && <Button variant="secondary" onPress={() => setStep(s => s - 1)}>Zpět</Button>}
        <Button onPress={step === 2 ? finish : () => setStep(s => s + 1)}>{step === 2 ? 'Dokončit' : 'Pokračovat'}</Button>
      </View>
      <Text style={styles.disclaimer}>NutriFit není zdravotnický prostředek. Nediagnostikuje, neléčí a nenahrazuje konzultaci s lékařem ani nutričním terapeutem.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { color: colors.green, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  column: { gap: 10 },
  grid: { gap: 10 },
  actions: { gap: 10 },
  disclaimer: { color: colors.faint, fontSize: 12, lineHeight: 18 },
});
